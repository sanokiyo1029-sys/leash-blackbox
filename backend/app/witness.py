"""GHOST PROTOCOL, first witness: a network gateway that independently observes SSH sessions and signs each one.

The evidence-of-silence rule compares those signed observations with what the host actually forwarded to the vault.
A session the gateway saw but the host never reported is an OBSERVED_OMISSION.

Prototype boundary: the witness runs in the collector's process, but with its own signing key and its own append-only
store, both outside the host's reach. It is logically isolated, not physically independent.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta
from typing import Any

from eth_account import Account
from eth_account.messages import encode_defunct
from sqlalchemy import select

from .canonical import canonical_json
from .records import RawEvent, utc_now_iso
from .storage import VaultEvent, WitnessObservation, WitnessRegistration

POLICY: dict[str, Any] = {
    "id": "ssh-session-corroboration",
    "version": 1,
    "rule": "Every SSH session the gateway witness observed must match one host-reported sshd login_success for the "
            "same host, user and source IP, within the clock-skew allowance. Each host record corroborates at most "
            "one observation.",
    "skew_seconds": 120,
    "compared_against": "the evidence vault (everything the host forwarded), not the host's current log",
}

TRUST_ASSUMPTIONS = [
    "The gateway witness is outside the host's trust boundary. In this prototype it is a separate signing key and "
    "store on the same machine: logically isolated, not physically independent.",
    "A valid signature proves the registered witness made the claim. It does not prove the claim is true.",
    "Host timestamps are host-controlled; matching allows the policy's clock-skew window.",
    "An omission shows the host did not report a session the witness saw. It does not by itself show why "
    "(logging disabled, agent crash, or delivery loss).",
]

SIGNATURE_SCHEME = "secp256k1 ECDSA over EIP-191 personal_sign of the canonical claim JSON (eth_account)"


def _t(iso: str) -> datetime:
    return datetime.fromisoformat(iso.replace("Z", "+00:00"))


def verify_claim(claim_json: str, signature: str, witness_id: str) -> bool:
    try:
        signer = Account.recover_message(encode_defunct(text=claim_json), signature=bytes.fromhex(signature))
    except Exception:  # noqa: BLE001 - a malformed signature is simply invalid
        return False
    return signer == witness_id and json.loads(claim_json).get("witness") == witness_id


class GatewayWitness:
    role = "gateway"

    def __init__(self, svc):
        self.svc = svc
        path = svc.settings.witness_key_path
        if not path.exists():
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(bytes(Account.create().key).hex())
        self._account = Account.from_key(path.read_text().strip())
        self.witness_id: str = self._account.address

    def _register(self) -> None:
        with self.svc.stores.vault() as s:
            if s.get(WitnessRegistration, self.witness_id) is None:
                s.add(WitnessRegistration(witness_id=self.witness_id, role=self.role, registered_at=utc_now_iso()))

    def observe_session(self, host: str, user: str, src_ip: str, observed_at: str) -> dict[str, Any]:
        """Sign and store one observed SSH session. `observed_at` is the witness's clock (the simulation clock here)."""
        self._register()
        claim = {"schema": "leash-witness/v1", "obs_id": str(uuid.uuid4()), "witness": self.witness_id,
                 "role": self.role, "kind": "ssh_session", "host": host, "user": user, "src_ip": src_ip,
                 "observed_at": observed_at}
        claim_json = canonical_json(claim)
        signature = bytes(self._account.sign_message(encode_defunct(text=claim_json)).signature).hex()
        with self.svc.stores.witness() as s:
            s.add(WitnessObservation(obs_id=claim["obs_id"], witness_id=self.witness_id, claim_json=claim_json,
                                     signature=signature, recorded_at=utc_now_iso()))
        return {"claim": claim, "signature": signature}

    def observe_traffic(self, raws: list[RawEvent]) -> int:
        """The gateway sees every SSH session that really happened, whatever the host does with its log."""
        sessions = [r for r in raws if r.source == "sshd" and r.type == "login_success" and r.attrs.get("src_ip")]
        for r in sessions:
            self.observe_session(r.host, r.actor, r.attrs["src_ip"], r.ts)
        return len(sessions)


def list_observations(svc, limit: int = 200) -> list[dict[str, Any]]:
    with svc.stores.witness() as s:
        rows = list(s.scalars(select(WitnessObservation).order_by(WitnessObservation.id.desc()).limit(limit)))
        return [{"claim": json.loads(r.claim_json), "signature": r.signature, "recorded_at": r.recorded_at}
                for r in rows]


def check_observations(svc) -> dict[str, Any]:
    """Evidence of silence: every valid observation needs a matching host-forwarded record."""
    with svc.stores.witness() as s:
        observations = [(r.claim_json, r.signature, r.witness_id)
                        for r in s.scalars(select(WitnessObservation).order_by(WitnessObservation.id))]
    with svc.stores.vault() as s:
        registered = set(s.scalars(select(WitnessRegistration.witness_id)))
        logins = [r for r in (json.loads(c) for c in s.scalars(select(VaultEvent.canonical_json).order_by(VaultEvent.seq)))
                  if r["source"] == "sshd" and r["type"] == "login_success"]
    skew = timedelta(seconds=POLICY["skew_seconds"])
    used: set[int] = set()
    corroborated: list[dict[str, Any]] = []
    omissions: list[dict[str, Any]] = []
    rejected: list[dict[str, Any]] = []
    for claim_json, signature, witness_id in observations:
        claim = json.loads(claim_json)
        if witness_id not in registered or not verify_claim(claim_json, signature, witness_id):
            rejected.append({"obs_id": claim.get("obs_id"), "witness": witness_id,
                             "reason": "unregistered witness or invalid signature"})
            continue
        t = _t(claim["observed_at"])
        match = next((r for r in logins if r["seq"] not in used and r["host"] == claim["host"]
                      and r["actor"] == claim["user"] and r["attrs"].get("src_ip") == claim["src_ip"]
                      and abs(_t(r["ts"]) - t) <= skew), None)
        if match is not None:
            used.add(match["seq"])
            corroborated.append({"obs_id": claim["obs_id"], "seq": match["seq"]})
            continue
        omissions.append({
            "status": "OBSERVED_OMISSION",
            "evidence_category": "directly observed by an independent witness; no matching host record",
            "observation": claim,
            "signature": signature,
            "signature_valid": True,
            "expected": {"source": "sshd", "type": "login_success", "host": claim["host"], "actor": claim["user"],
                         "src_ip": claim["src_ip"],
                         "window": [(t - skew).isoformat().replace("+00:00", "Z"),
                                    (t + skew).isoformat().replace("+00:00", "Z")]},
            "explanation": f"The gateway witness signed an SSH session by {claim['user']} from {claim['src_ip']} to "
                           f"{claim['host']} at {claim['observed_at']}, but the host never reported a matching login.",
        })
    return {"policy": POLICY, "signature_scheme": SIGNATURE_SCHEME, "trust_assumptions": TRUST_ASSUMPTIONS,
            "witnesses": sorted(registered), "observations": len(observations), "corroborated": corroborated,
            "rejected": rejected, "omissions": omissions}
