#!/usr/bin/env python3
"""LEASH BLACKBOX file agent: forward a real log file to the collector, then check the file against the chain.

Standard library only, so it can run on a monitored host without extra packages.

  ingest  Read complete new lines of a syslog / auth.log style or JSON-lines file, in file order, and send them to
          POST /api/events/ingest. A state file keeps the byte offset and a hash of everything already sent, so a
          re-run never sends a line twice, and a rewritten (tampered or rotated) prefix is refused instead of resent.
  check   Export the vault evidence, prove it against the chain with verifier/leash_verify.py, then compare the file
          line by line with the proven records: erased, altered and injected lines are reported.

Exit codes: 0 ok / file matches, 1 error, 2 tampering detected (or the already-forwarded part of the file changed),
3 the reference evidence could not be proven against the chain.
"""

from __future__ import annotations

import argparse
import difflib
import hashlib
import json
import os
import re
import socket
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

SEVERITIES = ("info", "low", "medium", "high", "critical")
MAX_MSG = 4096  # same limits as the API's RawEvent model
LIMITS = {"ts": 40, "host": 128, "source": 64, "type": 64, "actor": 128}
LINES_PER_REQUEST = 500
MONTHS = {m: i for i, m in enumerate("Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(), 1)}

SYSLOG = re.compile(
    r"^(?:(?P<mon>[A-Z][a-z]{2}) {1,2}(?P<day>\d{1,2}) (?P<time>\d{2}:\d{2}:\d{2})|(?P<iso>\d{4}-\d{2}-\d{2}T\S+))"
    r" (?P<host>\S+) (?P<prog>[^\s:\[]+)(?:\[(?P<pid>\d+)\])?: ?(?P<body>.*)$"
)
# (pattern, event type, severity), first match wins; named groups user/ip/method fill actor and attrs
RULES = [
    (re.compile(r"Failed \S+ for (?:invalid user )?(?P<user>\S+) from (?P<ip>\S+)"), "login_failure", "low"),
    (re.compile(r"Invalid user (?P<user>\S+) from (?P<ip>\S+)"), "login_failure", "low"),
    (re.compile(r"Accepted (?P<method>\S+) for (?P<user>\S+) from (?P<ip>\S+)"), "login_success", "info"),
    (re.compile(r"^\s*(?P<user>\S+) : .*COMMAND="), "privilege_escalation", "medium"),
    (re.compile(r"session opened for user (?P<user>[^\s(]+)"), "session_open", "info"),
]

Http = Callable[..., dict]


class AgentError(Exception):
    """An API call failed; nothing after the failed request was marked as sent."""


class PrefixChanged(Exception):
    """Bytes that were already forwarded are no longer the same in the file."""


# ------------------------------------------------------------------ parsing
def _utc(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def _syslog_ts(m: re.Match) -> str:
    if m["iso"]:
        dt = datetime.fromisoformat(m["iso"].replace("Z", "+00:00"))
        return _utc(dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc))
    # shortcut: RFC 3164 has no year or zone, so the current UTC year and UTC are assumed; use ISO syslog for exact times.
    year = datetime.now(timezone.utc).year
    h, mi, s = map(int, m["time"].split(":"))
    return _utc(datetime(year, MONTHS[m["mon"]], int(m["day"]), h, mi, s, tzinfo=timezone.utc))


def _fits(ev: dict) -> bool:
    if any(not isinstance(ev.get(k), str) or len(ev[k]) > n for k, n in LIMITS.items()):
        return False
    return (all(ev[k] for k in ("ts", "host", "source", "type")) and ev["severity"] in SEVERITIES
            and isinstance(ev.get("msg"), str) and len(ev["msg"]) <= MAX_MSG)


def parse_line(text: str, line_no: int, file_name: str, default_host: str) -> dict | None:
    """Map one log line to a RawEvent dict. Unrecognised lines are kept as type "unparsed" so the evidence has no gaps.

    Returns None only for lines the API cannot store (longer than 4096 characters)."""
    if len(text) > MAX_MSG:
        return None
    ref = {"file": file_name, "line": str(line_no), "raw_sha256": hashlib.sha256(text.encode()).hexdigest()}
    ev: dict[str, Any] | None = None
    if text.lstrip().startswith("{"):
        try:
            obj = json.loads(text)
            ev = {k: obj.get(k) for k in ("ts", "host", "source", "type", "severity", "msg")}
            ev["actor"] = obj.get("actor", "-")
            ev["attrs"] = {str(k): str(v) for k, v in (obj.get("attrs") or {}).items()}
        except (ValueError, AttributeError):
            ev = None
    elif m := SYSLOG.match(text):
        try:
            ts = _syslog_ts(m)
        except (ValueError, KeyError):
            ts = None
        if ts:
            ev = {"ts": ts, "host": m["host"], "source": m["prog"].lower(), "type": "syslog", "severity": "info",
                  "actor": "-", "msg": text, "attrs": {"pid": m["pid"]} if m["pid"] else {}}
            for pattern, etype, sev in RULES:
                if r := pattern.search(m["body"]):
                    g = r.groupdict()
                    ev.update(type=etype, severity=sev, actor=g.get("user") or "-")
                    ev["attrs"].update({k: v for k, v in (("src_ip", g.get("ip")), ("method", g.get("method"))) if v})
                    break
    if ev is None or not _fits(ev):
        ev = {"ts": _utc(datetime.now(timezone.utc)), "host": default_host, "source": "logfile", "type": "unparsed",
              "severity": "info", "actor": "-", "msg": text, "attrs": {}}
    ev["attrs"].update(ref)
    return ev


# -------------------------------------------------------------------- state
def load_state(path: Path) -> dict:
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return {"offset": 0, "line": 0, "prefix_sha256": hashlib.sha256(b"").hexdigest()}


def save_state(path: Path, state: dict) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(state), encoding="utf-8")
    os.replace(tmp, path)  # atomic: a crash never leaves a half-written offset


def new_lines(data: bytes, state: dict) -> list[tuple[int, bytes, int]]:
    """Complete lines after the saved offset as (line number, raw bytes, end offset). A partial last line waits."""
    off = state["offset"]
    if len(data) < off or hashlib.sha256(data[:off]).hexdigest() != state["prefix_sha256"]:
        raise PrefixChanged("lines that were already forwarded have changed in the file (tampering or rotation)")
    out, n, pos = [], state["line"], off
    while (nl := data.find(b"\n", pos)) != -1:
        n += 1
        out.append((n, data[pos:nl].rstrip(b"\r"), nl + 1))
        pos = nl + 1
    return out


# ---------------------------------------------------------------------- http
def urllib_http(api: str, token: str | None = None) -> Http:
    def call(method: str, path: str, payload: Any = None) -> dict:
        body = None if payload is None else json.dumps(payload).encode()
        req = urllib.request.Request(api.rstrip("/") + path, data=body, method=method, headers={"Content-Type": "application/json"})
        if token:
            req.add_header("Authorization", f"Bearer {token}")
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read() or b"{}")
        except urllib.error.HTTPError as e:
            raise AgentError(f"{method} {path} -> HTTP {e.code}: {e.read()[:300].decode(errors='replace')}") from e
        except urllib.error.URLError as e:
            raise AgentError(f"{method} {path} -> {e.reason}") from e

    return call


# -------------------------------------------------------------------- ingest
def ingest_once(log: Path, state_path: Path, http: Http, default_host: str, seal: bool = False) -> dict:
    """Forward every complete new line once, in file order. State advances only after each request succeeds."""
    state = load_state(state_path)
    data = log.read_bytes()  # shortcut: re-reads the whole file per poll to hash the sent prefix; fine for demo-sized logs
    lines = new_lines(data, state)
    summary = {"forwarded": 0, "unparsed": 0, "rejected": [], "first_seq": None, "last_seq": None, "anchored_batches": 0}
    for i in range(0, len(lines), LINES_PER_REQUEST):
        chunk = lines[i:i + LINES_PER_REQUEST]
        events = []
        for n, raw, _ in chunk:
            text = raw.decode("utf-8", errors="replace")
            if not text.strip():
                continue
            ev = parse_line(text, n, log.name, default_host)
            if ev is None:
                summary["rejected"].append(f"line {n}: longer than {MAX_MSG} characters, not forwarded")
                continue
            summary["unparsed"] += ev["type"] == "unparsed"
            events.append(ev)
        if events:
            r = http("POST", "/api/events/ingest", {"events": events})
            summary["forwarded"] += r["ingested"]
            summary["first_seq"] = summary["first_seq"] if summary["first_seq"] is not None else r["first_seq"]
            summary["last_seq"] = r["last_seq"]
        n, _, end = chunk[-1]
        state = {"offset": end, "line": n, "prefix_sha256": hashlib.sha256(data[:end]).hexdigest()}
        save_state(state_path, state)
    if seal and summary["forwarded"]:
        try:
            summary["anchored_batches"] = len(http("POST", "/api/batches/seal")["anchored"])
        except AgentError as e:  # the events are already in the vault; say so instead of looking like nothing was sent
            summary["anchor_error"] = str(e)
    return summary


# --------------------------------------------------------------------- check
def check_file(log: Path, http: Http, rpc_url: str, contract: str | None = None) -> dict:
    """Compare the file with the anchored vault records for it, after proving those records against the chain."""
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "verifier"))
    import leash_verify  # noqa: PLC0415  (stdlib-only reference verifier)

    bundle = http("GET", "/api/export?source=vault")
    proof = leash_verify.verify(bundle, rpc_url, contract)
    result: dict[str, Any] = {"reference": proof["verdict"], "committed": 0, "lines": 0, "findings": []}
    if proof["verdict"] != "VERIFIED":
        result["verdict"] = "REFERENCE_NOT_PROVEN"
        result["errors"] = proof.get("errors", [])
        return result

    committed = sorted((e for e in bundle["events"] if e["record"].get("attrs", {}).get("file") == log.name
                        and "raw_sha256" in e["record"]["attrs"]), key=lambda e: e["seq"])
    current = [(n, t) for n, t in enumerate(log.read_bytes().decode("utf-8", errors="replace").splitlines(), 1) if t.strip()]
    a = [e["record"]["attrs"]["raw_sha256"] for e in committed]
    b = [hashlib.sha256(t.encode()).hexdigest() for _, t in current]
    result.update(committed=len(a), lines=len(b))
    ops = difflib.SequenceMatcher(None, a, b, autojunk=False).get_opcodes()
    # Lines after the last committed line may simply not be forwarded/anchored yet; lines before it cannot be.
    tail = max((j2 for tag, _, _, _, j2 in ops if tag == "equal"), default=0)
    f = result["findings"]
    for tag, i1, i2, j1, j2 in ops:
        if tag == "equal":
            continue
        old, new = committed[i1:i2], current[j1:j2]
        for e, (n, t) in zip(old, new):
            f.append({"status": "ALTERED", "seq": e["seq"], "line": n, "original": e["record"]["msg"], "now": t})
        for e in old[len(new):]:
            f.append({"status": "ERASED", "seq": e["seq"], "line": int(e["record"]["attrs"]["line"]), "original": e["record"]["msg"]})
        for k, (n, t) in enumerate(new[len(old):], start=j1 + len(old)):
            f.append({"status": "INJECTED" if k < tail else "NOT_COMMITTED", "line": n, "now": t})
    if any(x["status"] != "NOT_COMMITTED" for x in f):
        result["verdict"] = "TAMPERING_DETECTED"
    else:
        result["verdict"] = "MATCHES_WITH_UNCOMMITTED_LINES" if f else "MATCHES"
    return result


# ----------------------------------------------------------------------- cli
def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("--api", default=os.environ.get("LEASH_API_URL", "http://127.0.0.1:8000"))
    sub = p.add_subparsers(dest="cmd", required=True)
    pi = sub.add_parser("ingest", help="forward new lines of a log file")
    pi.add_argument("file", type=Path)
    pi.add_argument("--state", type=Path, help="offset file (default: <file>.leash-state.json)")
    pi.add_argument("--token", default=os.environ.get("LEASH_INGEST_TOKEN"), help="shared token or this host's own token (env LEASH_INGEST_TOKEN)")
    pi.add_argument("--host", default=socket.gethostname(), help="host name for lines that carry none")
    pi.add_argument("--seal", action="store_true", help="anchor forwarded events on-chain right away")
    pi.add_argument("--follow", action="store_true", help="keep polling the file")
    pi.add_argument("--interval", type=float, default=2.0)
    pc = sub.add_parser("check", help="compare a log file with its proven on-chain evidence")
    pc.add_argument("file", type=Path)
    pc.add_argument("--rpc", default="http://127.0.0.1:8545", help="JSON-RPC endpoint you trust")
    pc.add_argument("--contract", help="anchor contract address obtained out of band")
    args = p.parse_args(argv)

    if args.cmd == "check":
        try:
            r = check_file(args.file, urllib_http(args.api), args.rpc, args.contract)
        except (AgentError, OSError, ValueError) as e:
            print(f"error: {e}", file=sys.stderr)
            return 1
        print(f"{r['verdict']}: {args.file.name} has {r['lines']} line(s); {r['committed']} committed and proven on-chain "
              f"(reference evidence: {r['reference']})")
        for x in r["findings"]:
            if x["status"] == "ERASED":
                print(f"  ERASED    seq {x['seq']} (was line {x['line']}): {x['original']}")
            elif x["status"] == "ALTERED":
                print(f"  ALTERED   seq {x['seq']} line {x['line']}:\n    was: {x['original']}\n    now: {x['now']}")
            elif x["status"] == "INJECTED":
                print(f"  INJECTED  line {x['line']} (never committed, sits between committed lines): {x['now']}")
            else:
                print(f"  NOT YET COMMITTED  line {x['line']}: {x['now']}")
        return {"MATCHES": 0, "MATCHES_WITH_UNCOMMITTED_LINES": 0, "TAMPERING_DETECTED": 2}.get(r["verdict"], 3)

    state = args.state or args.file.with_name(args.file.name + ".leash-state.json")
    http = urllib_http(args.api, args.token)
    while True:
        try:
            s = ingest_once(args.file, state, http, args.host, args.seal)
            if s["forwarded"] or s["rejected"] or not args.follow:
                seqs = f" (seq {s['first_seq']}-{s['last_seq']})" if s["forwarded"] else ""
                print(f"forwarded {s['forwarded']} event(s){seqs}, {s['unparsed']} unparsed kept as raw text, "
                      f"{len(s['rejected'])} rejected, {s['anchored_batches']} batch(es) anchored")
                for msg in s["rejected"]:
                    print(f"  rejected {msg}", file=sys.stderr)
            if s.get("anchor_error"):
                print(f"error: forwarded, but anchoring failed: {s['anchor_error']}", file=sys.stderr)
                if not args.follow:
                    return 1
        except PrefixChanged as e:
            print(f"refusing to continue: {e}. Run `check` to see what changed; use a new --state file after a real rotation.",
                  file=sys.stderr)
            return 2
        except (AgentError, OSError) as e:
            print(f"error: {e}", file=sys.stderr)
            if not args.follow:
                return 1
        if not args.follow:
            return 0
        time.sleep(args.interval)


if __name__ == "__main__":
    sys.exit(main())
