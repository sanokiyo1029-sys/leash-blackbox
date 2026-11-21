"""GHOST PROTOCOL witnesses: a network gateway and an identity/auth control plane, each signing every SSH session it sees.

The evidence-of-silence rule needs 2 of 3 independent sources (the host's forwarded log, the gateway, the identity
plane). Both witnesses saw a session the host never reported: OBSERVED_OMISSION. Only one witness saw it:
CONFLICTING_ATTESTATIONS, because one witness is wrong or compromised and nothing can be concluded about the host.

Prototype boundary: the witnesses run in the collector's process, but each with its own signing key, and their
observations live in an append-only store outside the host's reach. They are logically isolated, not physically
independent.
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

# The roles that may vote, and the kind of claim each one makes.
WITNESS_ROLES = {"gateway": "ssh_session", "identity": "ssh_auth"}

POLICY: dict[str, Any] = {
    "id": "ssh-session-corroboration",
    "version": 2,
    "rule": "An SSH session is established when at least 2 of 3 independent sources attest it: the host's forwarded "
            "sshd login_success, the gateway witness and the identity witness, matched on host, user and source IP "
            "within the clock-skew allowance. Each source counts at most once per session, and each witness must be "
            "a signer registered in the vault for that role. Established but never reported by the host: "
            "OBSERVED_OMISSION. Attested by one witness only: CONFLICTING_ATTESTATIONS, with nothing concluded about "
            "the host. Each host record corroborates at most one session.",
    "quorum": 2,
    "sources": ["host", "gateway", "identity"],
    "skew_seconds": 120,
    "compared_against": "the evidence vault (everything the host forwarded), not the host's current log",
}

TRUST_ASSUMPTIONS = [
    "The gateway and identity witnesses are outside the host's trust boundary. In this prototype each is a separate "
    "signing key on the same machine: logically isolated, not physically independent.",
    "A valid signature proves the registered witness made the claim. It does not prove the claim is true.",
    "One compromised witness cannot produce an OBSERVED_OMISSION on its own; two colluding witnesses could.",
    "Host timestamps are host-controlled; matching allows the policy's clock-skew window.",
    "An omission shows the host did not report a session the witnesses saw. It does not by itself show why "
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


class Witness:
    role: str
    kind: str

    def __init__(self, svc):
        self.svc = svc
        path = svc.settings.witness_key_path.with_name(f"{self.role}.key")
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
                 "role": self.role, "kind": self.kind, "host": host, "user": user, "src_ip": src_ip,
                 "observed_at": observed_at}
        claim_json = canonical_json(claim)
        signature = bytes(self._account.sign_message(encode_defunct(text=claim_json)).signature).hex()
        with self.svc.stores.witness() as s:
            s.add(WitnessObservation(obs_id=claim["obs_id"], witness_id=self.witness_id, claim_json=claim_json,
                                     signature=signature, recorded_at=utc_now_iso()))
        return {"claim": claim, "signature": signature}

    def observe_traffic(self, raws: list[RawEvent]) -> int:
        """Every SSH session that really happened crosses the gateway and authenticates at the identity plane,
        whatever the host does with its log."""
        sessions = [r for r in raws if r.source == "sshd" and r.type == "login_success" and r.attrs.get("src_ip")]
        for r in sessions:
            self.observe_session(r.host, r.actor, r.attrs["src_ip"], r.ts)
        return len(sessions)


class GatewayWitness(Witness):
    """The network gateway: it sees every SSH session on the wire."""

    role, kind = "gateway", WITNESS_ROLES["gateway"]


class IdentityWitness(Witness):
    """The identity/auth control plane: it authenticates every SSH login, independently of the network path."""

    role, kind = "identity", WITNESS_ROLES["identity"]


def list_observations(svc, limit: int = 200) -> list[dict[str, Any]]:
    with svc.stores.witness() as s:
        rows = list(s.scalars(select(WitnessObservation).order_by(WitnessObservation.id.desc()).limit(limit)))
        return [{"claim": json.loads(r.claim_json), "signature": r.signature, "recorded_at": r.recorded_at}
                for r in rows]


def _same_session(a: dict[str, Any], b: dict[str, Any]) -> bool:
    return a["host"] == b["host"] and a["user"] == b["user"] and a["src_ip"] == b["src_ip"]


def check_observations(svc) -> dict[str, Any]:
    """Evidence of silence: every session needs 2 of 3 sources, and the host must be one of them."""
    with svc.stores.witness() as s:
        observations = [(r.claim_json, r.signature, r.witness_id)
                        for r in s.scalars(select(WitnessObservation).order_by(WitnessObservation.id))]
    with svc.stores.vault() as s:
        # Only witness roles vote: a host-agent heartbeat key registered in the same table cannot attest sessions.
        roles = {r.witness_id: r.role for r in s.scalars(select(WitnessRegistration)) if r.role in WITNESS_ROLES}
        logins = [r for r in (json.loads(c) for c in s.scalars(select(VaultEvent.canonical_json).order_by(VaultEvent.seq)))
                  if r["source"] == "sshd" and r["type"] == "login_success"]
    skew = timedelta(seconds=POLICY["skew_seconds"])
    sessions: list[dict[str, Any]] = []  # {"t": first sighting, "claim": first claim, "by": {role: attestation}}
    rejected: list[dict[str, Any]] = []
    # The same signed claim can't be stored twice (obs_id is unique and inside the signature), so duplicates can only
    # be new claims by the same witness; those get one vote per session below.
    for claim_json, signature, witness_id in observations:
        claim = json.loads(claim_json)
        role = roles.get(witness_id)
        if role is None or not verify_claim(claim_json, signature, witness_id):
            reason = "unregistered witness or invalid signature"
        elif claim.get("role") != role or claim.get("kind") != WITNESS_ROLES[role]:
            reason = f"claims to be {claim.get('role')}/{claim.get('kind')} but is registered as {role}"
        else:
            reason = None
        if reason:
            rejected.append({"obs_id": claim.get("obs_id"), "witness": witness_id, "reason": reason})
            continue
        t = _t(claim["observed_at"])
        # A witness votes once per session: a second sighting by the same role starts another session.
        session = next((x for x in sessions if role not in x["by"] and _same_session(x["claim"], claim)
                        and abs(x["t"] - t) <= skew), None)
        if session is None:
            session = {"t": t, "claim": claim, "by": {}}
            sessions.append(session)
        session["by"][role] = {"observation": claim, "signature": signature}

    used: set[int] = set()
    corroborated: list[dict[str, Any]] = []
    omissions: list[dict[str, Any]] = []
    conflicts: list[dict[str, Any]] = []
    for x in sessions:
        c, t, by = x["claim"], x["t"], x["by"]
        match = next((r for r in logins if r["seq"] not in used and r["host"] == c["host"] and r["actor"] == c["user"]
                      and r["attrs"].get("src_ip") == c["src_ip"] and abs(_t(r["ts"]) - t) <= skew), None)
        sources = sorted(by) + (["host"] if match is not None else [])
        first, *others = by.values()
        what = f"an SSH session by {c['user']} from {c['src_ip']} to {c['host']} at {c['observed_at']}"
        if match is not None:
            used.add(match["seq"])
            corroborated += [{"obs_id": a["observation"]["obs_id"], "seq": match["seq"], "sources": sources}
                             for a in by.values()]
        elif len(by) >= POLICY["quorum"]:
            omissions.append({
                "status": "OBSERVED_OMISSION",
                "evidence_category": "directly observed by two independent witnesses; no matching host record",
                "observation": first["observation"],
                "signature": first["signature"],
                "signature_valid": True,
                "corroborated_by": others,
                "sources": sources,
                "expected": {"source": "sshd", "type": "login_success", "host": c["host"], "actor": c["user"],
                             "src_ip": c["src_ip"],
                             "window": [(t - skew).isoformat().replace("+00:00", "Z"),
                                        (t + skew).isoformat().replace("+00:00", "Z")]},
                "explanation": f"The {' and '.join(sorted(by))} witnesses both signed {what}, but the host never "
                               f"reported a matching login.",
            })
        else:
            silent = next(r for r in WITNESS_ROLES if r not in by)
            conflicts.append({
                "status": "CONFLICTING_ATTESTATIONS",
                "observation": first["observation"],
                "signature": first["signature"],
                "sources": sources,
                "missing": [silent, "host"],
                "explanation": f"Only the {sources[0]} witness signed {what}; the {silent} witness and the host have no "
                               f"record of it. One witness is wrong or compromised, so nothing is concluded about "
                               f"the host.",
            })
    return {"policy": POLICY, "signature_scheme": SIGNATURE_SCHEME, "trust_assumptions": TRUST_ASSUMPTIONS,
            "witnesses": sorted(roles), "observations": len(observations), "corroborated": corroborated,
            "rejected": rejected, "omissions": omissions, "conflicts": conflicts}
