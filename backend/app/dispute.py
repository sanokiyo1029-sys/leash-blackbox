"""GHOST PROTOCOL: dispute packages committed on-chain.

When a verification finds an observed omission or a reporting gap, the evidence is frozen into a canonical package
(the signed witness observations, the heartbeat gaps, the policies applied, the anchored batches it relates to and the
trust assumptions). Only the package's SHA-256 goes on-chain (`LeashAnchor.commitDispute`); the package stays in the
vault. Anyone holding the package can recompute the digest and compare it with the chain.

A commitment proves the package existed, unchanged, at that block. It does not make the package's claims true.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

from sqlalchemy import select

from .anchor import AnchorError
from .canonical import canonical_bytes, canonical_json
from .records import utc_now_iso
from .storage import Batch, Dispute, VerificationRun

SCHEMA = "leash-dispute/v1"
DIGEST_SPEC = "sha256(canonical_json(package))"


def digest_of(package_json: str) -> str:
    return hashlib.sha256(package_json.encode("utf-8")).hexdigest()


def build_package(svc) -> dict[str, Any]:
    """Freeze the latest verification's omissions and gaps. Raises ValueError when there is nothing to dispute."""
    dep = svc.active_deployment()
    with svc.stores.vault() as s:
        run = s.scalar(select(VerificationRun).order_by(VerificationRun.id.desc()).limit(1))
        if run is None:
            raise ValueError("run a verification first")
        report = json.loads(run.report_json)
        batches = [{"batch_id": b.batch_id, "merkle_root": b.merkle_root, "tx_hash": b.tx_hash}
                   for b in s.scalars(select(Batch).where(Batch.status == "anchored").order_by(Batch.batch_id))]
        run_id = run.id
    witness = report.get("witness") or {}
    heartbeat = report.get("heartbeat") or {}
    omissions = witness.get("omissions") or []
    gaps = heartbeat.get("gaps") or []
    if not omissions and not gaps:
        raise ValueError("the latest verification found no observed omission or reporting gap to dispute")
    hb = heartbeat["policy"] if gaps else None
    # Canonical JSON allows strings, integers and null only, so seconds become integer milliseconds here.
    return {
        "schema": SCHEMA,
        "verification": {"run_id": run_id, "verified_at": report["verified_at"], "verdict": report["verdict"]},
        "chain": {"chain_id": dep.chain_id if dep else None, "contract": dep.contract_address if dep else None,
                  "anchored_batches": batches},
        "omissions": [{"observation": o["observation"], "signature": o["signature"],
                       "corroborated_by": o.get("corroborated_by") or []} for o in omissions],
        "witness_policy": witness.get("policy") if omissions else None,
        "witness_signature_scheme": witness.get("signature_scheme") if omissions else None,
        "gaps": [{"host": g["host"], "kind": g["kind"], "from": g["from"], "to": g["to"],
                  "milliseconds": int(round(g["seconds"] * 1000)), "explanation": g["explanation"]} for g in gaps],
        "heartbeat_policy": None if hb is None else {
            "id": hb["id"], "version": hb["version"], "interval_ms": int(hb["interval_seconds"] * 1000),
            "grace_ms": int(hb["grace_seconds"] * 1000), "clock": hb["clock"], "rule": hb["rule"]},
        "trust_assumptions": (witness.get("trust_assumptions") or []) + (heartbeat.get("trust_assumptions") or []),
    }


def commit(svc) -> dict[str, Any]:
    package = build_package(svc)
    package_json = canonical_json(package)
    digest = digest_of(package_json)
    with svc.lock:
        dep = svc.ensure_deployment()
        receipt = svc.anchor.commit_dispute(dep.contract_address, bytes.fromhex(digest))
        with svc.stores.vault() as s:
            s.add(Dispute(dispute_id=receipt["dispute_id"], deployment_id=dep.id, digest=digest, package_json=package_json,
                          tx_hash=receipt["tx_hash"], block_number=receipt["block_number"],
                          gas_used=receipt["gas_used"], committed_at=utc_now_iso()))
    return check(svc, receipt["dispute_id"])


def check(svc, dispute_id: int) -> dict[str, Any]:
    """Re-derive the digest from the stored package and compare it with what the contract holds."""
    with svc.stores.vault() as s:
        row = s.get(Dispute, dispute_id)
        if row is None:
            raise KeyError(dispute_id)
        stored = {"dispute_id": row.dispute_id, "digest": row.digest, "package_json": row.package_json,
                  "tx_hash": row.tx_hash, "block_number": row.block_number, "gas_used": row.gas_used,
                  "committed_at": row.committed_at}
    recomputed = digest_of(stored["package_json"])
    onchain, chain_error = None, None
    dep = svc.active_deployment()
    try:
        onchain = svc.anchor.get_dispute(dep.contract_address, dispute_id) if dep else None
    except AnchorError as exc:
        chain_error = str(exc)
    return {
        **{k: v for k, v in stored.items() if k != "package_json"},
        "package": json.loads(stored["package_json"]),
        "digest_spec": DIGEST_SPEC,
        "recomputed_digest": recomputed,
        "onchain": onchain,
        "chain_error": chain_error,
        "matches": onchain is not None and recomputed == stored["digest"] == onchain["digest"],
    }


def list_disputes(svc) -> list[dict[str, Any]]:
    with svc.stores.vault() as s:
        return [{"dispute_id": d.dispute_id, "digest": d.digest, "tx_hash": d.tx_hash, "block_number": d.block_number,
                 "committed_at": d.committed_at} for d in s.scalars(select(Dispute).order_by(Dispute.dispute_id))]
