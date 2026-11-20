"""Attack lab: a simulated root-level attacker on the monitored host.

The attacker is handed ONLY the host log store. It has no handle on the
evidence vault, the anchor signer or the blockchain node, which mirrors the
threat model: full control of the compromised machine, nothing beyond it.

Every action is also written to the lab ground-truth store so detection can be
scored. The verifier never reads that store.
"""

from __future__ import annotations

import json
import random
import uuid
from collections.abc import Callable
from contextlib import AbstractContextManager
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import delete, func, or_, select
from sqlalchemy.orm import Session

from .generator import ATTACKER_IP, HOST
from .records import utc_now_iso
from .storage import AttackAction, HostEvent

SessionFactory = Callable[[], AbstractContextManager[Session]]

SCENARIOS: dict[str, str] = {
    "cover_tracks": "Delete every host record mentioning the attacker's IP (sed -i '/IP/d' auth.log).",
    "alter_evidence": "Rewrite intrusion records: swap the attacker IP for an internal one and downgrade severity.",
    "fabricate_alibi": "Inject fake benign records claiming a legitimate admin session.",
    "timestomp": "Shift timestamps of intrusion records back three days to break the timeline.",
    "truncate_tail": "Delete the most recent N records (log truncation).",
    "wipe_all": "Delete the entire host log store (rm -rf /var/log/*).",
    "random_tamper": "Randomly modify, delete and inject records (used for validation trials).",
}


class AttackLab:
    def __init__(self, host_session: SessionFactory, lab_session: SessionFactory):
        self._host = host_session
        self._lab = lab_session

    # ----------------------------------------------------------------- helpers
    def _record(self, scenario: str, actions: list[tuple[str, int, dict[str, Any]]]) -> None:
        now = utc_now_iso()
        with self._lab() as s:
            for action, seq, detail in actions:
                s.add(AttackAction(performed_at=now, scenario=scenario, action=action, seq=seq,
                                   detail_json=json.dumps(detail)))

    @staticmethod
    def _mentions_attacker(stmt):
        pattern = f"%{ATTACKER_IP}%"
        return stmt.where(or_(HostEvent.message.like(pattern), HostEvent.attrs_json.like(pattern),
                              HostEvent.actor.like(pattern)))

    # --------------------------------------------------------------- scenarios
    def run(self, scenario: str, **params: Any) -> dict[str, Any]:
        handler = getattr(self, f"_s_{scenario}", None)
        if scenario not in SCENARIOS or handler is None:
            raise ValueError(f"unknown scenario {scenario!r}")
        actions: list[tuple[str, int, dict[str, Any]]] = handler(**params)
        self._record(scenario, actions)
        tally: dict[str, int] = {}
        for action, _, _ in actions:
            tally[action] = tally.get(action, 0) + 1
        return {
            "scenario": scenario,
            "description": SCENARIOS[scenario],
            "affected": len(actions),
            "actions": tally,
            "seqs": sorted({seq for _, seq, _ in actions}),
        }

    def _s_cover_tracks(self) -> list:
        with self._host() as s:
            seqs = list(s.scalars(self._mentions_attacker(select(HostEvent.seq))))
            if seqs:
                s.execute(delete(HostEvent).where(HostEvent.seq.in_(seqs)))
        return [("delete", seq, {}) for seq in seqs]

    def _s_alter_evidence(self) -> list:
        out = []
        with self._host() as s:
            for row in s.scalars(self._mentions_attacker(select(HostEvent))):
                before = {"message": row.message, "severity": row.severity}
                row.message = row.message.replace(ATTACKER_IP, "10.0.4.12")
                row.attrs_json = row.attrs_json.replace(ATTACKER_IP, "10.0.4.12")
                row.actor = row.actor.replace(ATTACKER_IP, "10.0.4.12")
                row.severity = "info"
                out.append(("modify", row.seq, {"before": before, "after": {"message": row.message,
                                                                             "severity": row.severity}}))
        return out

    def _s_fabricate_alibi(self, count: int = 3) -> list:
        out = []
        with self._host() as s:
            last = s.scalar(select(func.max(HostEvent.seq))) or 0
            last_ts = s.scalar(select(HostEvent.ts).order_by(HostEvent.seq.desc()).limit(1))
            base = _parse_ts(last_ts) if last_ts else datetime(2026, 1, 1)
            for i in range(count):
                seq = last + 1 + i
                ts = (base + timedelta(seconds=5 * (i + 1))).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
                s.add(HostEvent(seq=seq, event_id=str(uuid.uuid4()), ts=ts, host=HOST, source="sshd",
                                event_type="login_success", severity="info", actor="alice",
                                message="Accepted publickey for alice from 10.0.4.12 port 50122 ssh2",
                                attrs_json=json.dumps({"method": "publickey", "src_ip": "10.0.4.12"})))
                out.append(("inject", seq, {"ts": ts}))
        return out

    def _s_timestomp(self, days: int = 3) -> list:
        out = []
        with self._host() as s:
            for row in s.scalars(self._mentions_attacker(select(HostEvent))):
                before = row.ts
                row.ts = (_parse_ts(row.ts) - timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
                out.append(("modify", row.seq, {"before": before, "after": row.ts}))
        return out

    def _s_truncate_tail(self, count: int = 10) -> list:
        with self._host() as s:
            seqs = list(s.scalars(select(HostEvent.seq).order_by(HostEvent.seq.desc()).limit(count)))
            if seqs:
                s.execute(delete(HostEvent).where(HostEvent.seq.in_(seqs)))
        return [("delete", seq, {}) for seq in sorted(seqs)]

    def _s_wipe_all(self) -> list:
        with self._host() as s:
            seqs = list(s.scalars(select(HostEvent.seq)))
            s.execute(delete(HostEvent))
        return [("delete", seq, {}) for seq in sorted(seqs)]

    def _s_random_tamper(self, modify: int = 3, delete_count: int = 3, inject: int = 1,
                         seed: int | None = None) -> list:
        rng = random.Random(seed)
        out = []
        with self._host() as s:
            seqs = list(s.scalars(select(HostEvent.seq)))
            rng.shuffle(seqs)
            mod_seqs = seqs[:modify]
            del_seqs = seqs[modify:modify + delete_count]
            for seq in mod_seqs:
                row = s.get(HostEvent, seq)
                field = rng.choice(["message", "severity", "actor", "ts"])
                before = getattr(row, field)
                if field == "message":
                    row.message = row.message + " "  # a single trailing space is enough
                elif field == "severity":
                    row.severity = "info" if row.severity != "info" else "low"
                elif field == "actor":
                    row.actor = "root" if row.actor != "root" else "alice"
                else:
                    row.ts = (_parse_ts(row.ts) + timedelta(milliseconds=1)).strftime(
                        "%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
                out.append(("modify", seq, {"field": field, "before": before}))
            if del_seqs:
                s.execute(delete(HostEvent).where(HostEvent.seq.in_(del_seqs)))
                out += [("delete", seq, {}) for seq in del_seqs]
        if inject:
            out += self._s_fabricate_alibi(count=inject)
        return out

    # ------------------------------------------------------------------- reads
    def history(self, limit: int = 200) -> list[dict[str, Any]]:
        with self._lab() as s:
            rows = s.scalars(select(AttackAction).order_by(AttackAction.id.desc()).limit(limit))
            return [{"id": r.id, "performed_at": r.performed_at, "scenario": r.scenario, "action": r.action,
                     "seq": r.seq, "detail": json.loads(r.detail_json)} for r in rows]

    def ground_truth(self) -> dict[int, str]:
        """Final per-seq tamper state (last action wins) for scoring detection."""
        truth: dict[int, str] = {}
        with self._lab() as s:
            for r in s.scalars(select(AttackAction).order_by(AttackAction.id)):
                if r.action == "delete" and truth.get(r.seq) == "inject":
                    truth.pop(r.seq)
                elif r.action == "modify" and truth.get(r.seq) == "inject":
                    continue
                else:
                    truth[r.seq] = r.action
        return truth


def _parse_ts(ts: str) -> datetime:
    return datetime.strptime(ts.rstrip("Z"), "%Y-%m-%dT%H:%M:%S.%f")
