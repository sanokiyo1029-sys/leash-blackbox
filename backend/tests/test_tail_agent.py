"""File agent (agent/tail_agent.py): parsing, ordering, no duplicates, error handling, and tamper detection on the file."""

from __future__ import annotations

import sys

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from conftest import REPO

sys.path.insert(0, str(REPO / "agent"))
import tail_agent  # noqa: E402

SAMPLE = (REPO / "agent" / "sample" / "auth.log").read_text(encoding="utf-8")
SAMPLE_LINES = [line for line in SAMPLE.splitlines() if line.strip()]


def make_http(client, token=None):
    """Route the agent's HTTP calls through the in-process API, with the same error contract as the urllib client."""
    def call(method, path, payload=None):
        r = client.request(method, path, json=payload, headers={"Authorization": f"Bearer {token}"} if token else None)
        if r.status_code >= 400:
            raise tail_agent.AgentError(f"{method} {path} -> HTTP {r.status_code}: {r.text[:300]}")
        return r.json()

    return call


@pytest.fixture()
def api(settings):
    app = create_app(settings)
    with TestClient(app) as c:
        assert c.post("/api/demo/reset").status_code == 200
        yield c
    app.state.svc.stores.dispose()


@pytest.fixture()
def log(tmp_path):
    path = tmp_path / "auth.log"
    path.write_text(SAMPLE, encoding="utf-8", newline="\n")
    return path


def test_parses_syslog_iso_syslog_and_json_and_keeps_unknown_lines():
    def p(text):
        return tail_agent.parse_line(text, 7, "auth.log", "fallback-host")

    e = p("Nov 20 09:01:10 web-prod-01 sshd[820]: Failed password for root from 203.0.113.45 port 51000 ssh2")
    assert (e["type"], e["severity"], e["actor"], e["host"], e["source"]) == ("login_failure", "low", "root", "web-prod-01", "sshd")
    assert e["attrs"]["src_ip"] == "203.0.113.45" and e["attrs"]["line"] == "7" and e["msg"].startswith("Nov 20 09:01:10")

    e = p("2026-11-20T09:01:44+02:00 web-prod-01 sudo[830]:   deploy : TTY=pts/0 ; USER=root ; COMMAND=/bin/bash")
    assert (e["type"], e["actor"], e["ts"]) == ("privilege_escalation", "deploy", "2026-11-20T07:01:44.000Z")

    e = p('{"ts": "2026-11-20T09:02:30.000Z", "host": "h1", "source": "edr", "type": "suspicious_process", '
          '"severity": "high", "msg": "curl | sh", "attrs": {"n": 1}}')
    assert (e["type"], e["severity"], e["actor"], e["attrs"]["n"]) == ("suspicious_process", "high", "-", "1")

    for junk in ("kernel: no header here", '{"severity": "apocalyptic"}', "Feb 30 10:00:00 h1 sshd[1]: impossible date"):
        e = p(junk)
        assert (e["type"], e["host"], e["msg"]) == ("unparsed", "fallback-host", junk)

    assert p("x" * 4097) is None  # the API cannot store it: reported, not forwarded


def test_ingest_preserves_order_and_never_sends_a_line_twice(api, log):
    http, state = make_http(api), log.with_name("state.json")
    s = tail_agent.ingest_once(log, state, http, "fallback-host", seal=True)
    assert (s["forwarded"], s["unparsed"], s["anchored_batches"], s["rejected"]) == (len(SAMPLE_LINES), 1, 1, [])
    assert tail_agent.ingest_once(log, state, http, "fallback-host")["forwarded"] == 0

    with log.open("a", encoding="utf-8", newline="\n") as f:
        f.write("2026-11-20T09:05:00+00:00 web-prod-01 sshd[900]: Accepted publickey for carol from 10.0.7.3 port 40001 ssh2\n")
        f.write("2026-11-20T09:05:01+00:00 web-prod-01 sshd[901]: half-written line")  # no newline yet
    assert tail_agent.ingest_once(log, state, http, "fallback-host")["forwarded"] == 1

    items = api.get("/api/events?limit=1000&order=asc").json()["items"]
    lines = [int(i["record"]["attrs"]["line"]) for i in items]
    assert lines == list(range(1, len(SAMPLE_LINES) + 2))  # one event per line, in file order, no duplicates


def test_rejected_token_is_reported_and_nothing_is_marked_sent(tmp_path, rpc_url, log):
    settings = Settings(data_dir=tmp_path / "tok", rpc_url=rpc_url, receipt_timeout_s=30, ingest_token="right-token")
    app = create_app(settings)
    state = log.with_name("state.json")
    with TestClient(app) as c:
        assert c.post("/api/demo/reset").status_code == 200
        with pytest.raises(tail_agent.AgentError, match="401"):
            tail_agent.ingest_once(log, state, make_http(c, "wrong-token"), "h1")
        assert not state.exists()
        assert tail_agent.ingest_once(log, state, make_http(c, "right-token"), "h1")["forwarded"] == len(SAMPLE_LINES)
    app.state.svc.stores.dispose()


def test_check_detects_edits_to_the_file_after_ingest(api, log, settings):
    http, state = make_http(api), log.with_name("state.json")
    tail_agent.ingest_once(log, state, http, "fallback-host", seal=True)
    r = tail_agent.check_file(log, http, settings.rpc_url)
    assert (r["verdict"], r["reference"], r["committed"], r["findings"]) == ("MATCHES", "VERIFIED", len(SAMPLE_LINES), [])

    lines = log.read_text(encoding="utf-8").splitlines()
    erased, altered = lines[3], lines[8]
    lines[8] = altered.replace("203.0.113.45", "10.0.4.12")  # hide the attacker's IP on the successful login
    alibi = "2026-11-20T09:02:10+00:00 web-prod-01 sshd[999]: Accepted publickey for alice from 10.0.4.12 port 50000 ssh2"
    lines.insert(11, alibi)
    del lines[3]
    lines.append("2026-11-20T09:09:00+00:00 web-prod-01 CRON[1]: (root) CMD (true)")  # genuinely new, not forwarded yet
    log.write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")

    r = tail_agent.check_file(log, http, settings.rpc_url)
    by: dict[str, list[dict]] = {}
    for f in r["findings"]:
        by.setdefault(f["status"], []).append(f)
    assert r["verdict"] == "TAMPERING_DETECTED"
    assert [f["original"] for f in by["ERASED"]] == [erased]
    assert [(f["original"], f["now"]) for f in by["ALTERED"]] == [(altered, lines[7])]
    assert [f["now"] for f in by["INJECTED"]] == [alibi]
    assert [f["now"] for f in by["NOT_COMMITTED"]] == [lines[-1]]

    with pytest.raises(tail_agent.PrefixChanged):  # the agent refuses to resume over a rewritten prefix
        tail_agent.ingest_once(log, state, http, "fallback-host")


def test_check_refuses_evidence_it_cannot_prove(api, log, settings):
    http = make_http(api)
    tail_agent.ingest_once(log, log.with_name("state.json"), http, "fallback-host", seal=True)
    r = tail_agent.check_file(log, http, settings.rpc_url, contract="0x" + "11" * 20)  # not the anchor contract
    assert r["verdict"] == "REFERENCE_NOT_PROVEN" and r["findings"] == []
