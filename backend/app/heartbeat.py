"""GHOST PROTOCOL: signed host heartbeats and the reporting-gap rule.

The host agent signs a heartbeat every interval. Each one names its boot, its sequence number and the hash of the
previous heartbeat. The collector stamps the receive time with ITS clock and the verifier judges deadlines with that
clock only; the host's own `sent_at` is recorded but never trusted.

A REPORTING_GAP says the host stopped checking in (or a heartbeat went missing). It is not, by itself, an intrusion.
The heartbeat key lives in the host's trust zone, so a compromised host can keep signing: heartbeats prove the agent
was alive and reporting, not that its log is honest. Contradicting a lying host is the witness's job (witness.py).
"""

from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime
from typing import Any

from eth_account import Account
from eth_account.messages import encode_defunct
from sqlalchemy import select

from .canonical import canonical_json
from .records import utc_now_iso
from .storage import Heartbeat, WitnessRegistration
from .witness import SIGNATURE_SCHEME

GENESIS = "00" * 32

TRUST_ASSUMPTIONS = [
    "Deadlines use the collector's receive clock. The host's sent_at is informational only.",
    "The heartbeat key is on the host. A compromised host can keep heartbeats flowing while hiding events, so a "
    "clean heartbeat record does not mean the log is complete.",
    "The first key that checks in for a host is registered for it (trust on first use) until the next lab reset.",
    "A gap means the agent did not check in on time (crash, restart, network loss or a stopped agent). It is not, "
    "by itself, evidence of an intrusion.",
]


def _t(iso: str) -> datetime:
    return datetime.fromisoformat(iso.replace("Z", "+00:00"))


def _role(host: str) -> str:
    return f"host-agent:{host}"


class HostAgentHeartbeats:
    """The (simulated) host agent's heartbeat signer. Its key sits in the host's own trust zone, on purpose."""

    def __init__(self, settings, host: str):
        path = settings.host_agent_key_path
        if not path.exists():
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(bytes(Account.create().key).hex())
        self._account = Account.from_key(path.read_text().strip())
        self.host = host
        self.restart()

    def restart(self) -> None:
        """A new boot: a fresh chain of heartbeats."""
        self.boot_id = str(uuid.uuid4())
        self.seq = 0
        self.prev = GENESIS

    def beat(self, sent_at: str) -> tuple[str, str]:
        self.seq += 1
        claim = {"schema": "leash-heartbeat/v1", "host": self.host, "signer": self._account.address,
                 "boot_id": self.boot_id, "seq": self.seq, "prev": self.prev, "sent_at": sent_at}
        claim_json = canonical_json(claim)
        signature = bytes(self._account.sign_message(encode_defunct(text=claim_json)).signature).hex()
        self.prev = hashlib.sha256(claim_json.encode()).hexdigest()
        return claim_json, signature


def receive_heartbeat(svc, claim_json: str, signature: str, received_at: str | None = None) -> None:
    """Collector side: store the heartbeat with the collector's receive time (append-only)."""
    claim = json.loads(claim_json)
    with svc.stores.vault() as s:
        role = _role(claim["host"])
        if s.scalar(select(WitnessRegistration).where(WitnessRegistration.role == role)) is None:
            s.add(WitnessRegistration(witness_id=claim["signer"], role=role, registered_at=utc_now_iso()))
        s.add(Heartbeat(host=claim["host"], claim_json=claim_json, signature=signature,
                        received_at=received_at or utc_now_iso()))


def _valid(claim_json: str, signature: str, signer: str) -> bool:
    try:
        return Account.recover_message(encode_defunct(text=claim_json), signature=bytes.fromhex(signature)) == signer
    except Exception:  # noqa: BLE001 - malformed signature
        return False


def check_heartbeats(svc, now: str | None = None) -> dict[str, Any]:
    st = svc.settings
    limit = st.heartbeat_interval_s + st.heartbeat_grace_s
    policy = {"id": "heartbeat-continuity", "version": 1, "interval_seconds": st.heartbeat_interval_s,
              "grace_seconds": st.heartbeat_grace_s,
              "rule": "Each host agent must deliver a signed heartbeat within interval + grace of the previous one, by "
                      "the collector's clock. Within one boot, sequence numbers must be consecutive and each heartbeat "
                      "must name the previous one's hash. A new boot starts a new chain.",
              "clock": "collector receive time"}
    with svc.stores.vault() as s:
        rows = [(r.host, r.claim_json, r.signature, r.received_at)
                for r in s.scalars(select(Heartbeat).order_by(Heartbeat.id))]
        allowed: dict[str, set[str]] = {}
        for reg in s.scalars(select(WitnessRegistration).where(WitnessRegistration.role.like("host-agent:%"))):
            allowed.setdefault(reg.role.removeprefix("host-agent:"), set()).add(reg.witness_id)
    now_t = _t(now or utc_now_iso())
    gaps: list[dict[str, Any]] = []
    restarts: list[dict[str, Any]] = []
    rejected: list[dict[str, Any]] = []
    last: dict[str, tuple[dict[str, Any], str, datetime, str]] = {}  # host -> (claim, hash, received, received_iso)

    def gap(host: str, kind: str, start: str, end: str | None, seconds: float, why: str, prev: dict, nxt: dict | None):
        gaps.append({"status": "REPORTING_GAP", "host": host, "kind": kind, "from": start, "to": end,
                     "seconds": round(seconds, 1), "explanation": why,
                     "evidence": {"last_heartbeat": {k: prev[k] for k in ("boot_id", "seq")},
                                  "next_heartbeat": None if nxt is None else {k: nxt[k] for k in ("boot_id", "seq")}}})

    for host, claim_json, signature, received_at in rows:
        claim = json.loads(claim_json)
        if claim.get("host") != host or claim.get("signer") not in allowed.get(host, set()) \
                or not _valid(claim_json, signature, claim.get("signer", "")):
            rejected.append({"host": host, "seq": claim.get("seq"), "reason": "unregistered signer or invalid signature"})
            continue
        t = _t(received_at)
        if host in last:
            prev, prev_hash, prev_t, prev_iso = last[host]
            if claim["boot_id"] != prev["boot_id"]:
                restarts.append({"host": host, "at": received_at, "boot_id": claim["boot_id"]})
            elif claim["seq"] != prev["seq"] + 1:
                gap(host, "sequence", prev_iso, received_at, (t - prev_t).total_seconds(),
                    f"Heartbeats {prev['seq'] + 1}..{claim['seq'] - 1} never arrived.", prev, claim)
            elif claim["prev"] != prev_hash:
                gap(host, "chain_break", prev_iso, received_at, (t - prev_t).total_seconds(),
                    "This heartbeat does not name the previous one: the chain was broken or replayed.", prev, claim)
            waited = (t - prev_t).total_seconds()
            if waited > limit:
                gap(host, "late", prev_iso, received_at, waited,
                    f"No heartbeat for {waited:.0f} s (allowed {limit:.0f} s by the collector's clock).", prev, claim)
        last[host] = (claim, hashlib.sha256(claim_json.encode()).hexdigest(), t, received_at)

    for host, (prev, _, prev_t, prev_iso) in last.items():
        silent = (now_t - prev_t).total_seconds()
        if silent > limit:
            gap(host, "silent", prev_iso, None, silent,
                f"The agent has not checked in for {silent:.0f} s (allowed {limit:.0f} s) and is still silent.", prev, None)
    return {"policy": policy, "signature_scheme": SIGNATURE_SCHEME, "trust_assumptions": TRUST_ASSUMPTIONS,
            "hosts": sorted(last), "heartbeats": len(rows), "rejected": rejected, "restarts": restarts, "gaps": gaps}
