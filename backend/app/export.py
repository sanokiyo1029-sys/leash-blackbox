"""Evidence bundle export for independent auditors.

A bundle carries records plus Merkle inclusion proofs and the claimed batch
metadata. An auditor must NOT trust the claims: the standalone verifier
re-derives every hash and checks it against the contract over JSON-RPC.

source="vault": the protected evidence (what should hold up in front of a court)
source="host":  whatever the monitored host currently holds (possibly tampered)
"""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy import select

from .merkle import merkle_proof
from .records import record_from_host, utc_now_iso
from .service import HASH_SPEC, LeashService
from .storage import Batch, HostEvent, VaultEvent

BUNDLE_FORMAT = "leash-blackbox-evidence/v1"


def build_bundle(svc: LeashService, source: str = "vault", seqs: list[int] | None = None) -> dict[str, Any]:
    if source not in ("vault", "host"):
        raise ValueError("source must be 'vault' or 'host'")
    dep = svc.active_deployment()
    if dep is None:
        raise ValueError("no anchor contract deployed yet")
    wanted = set(seqs) if seqs else None

    with svc.stores.vault() as s:
        batches = list(s.scalars(select(Batch).where(Batch.status == "anchored").order_by(Batch.batch_id)))
        vault_events = list(s.scalars(select(VaultEvent).where(VaultEvent.batch_id.is_not(None))
                                      .order_by(VaultEvent.seq)))
        unanchored = int(len(list(s.scalars(select(VaultEvent.seq).where(VaultEvent.batch_id.is_(None))))))
    anchored_ids = {b.batch_id for b in batches}
    by_batch: dict[int, list[VaultEvent]] = {}
    for e in vault_events:
        if e.batch_id in anchored_ids:
            by_batch.setdefault(e.batch_id, []).append(e)

    host_rows: dict[int, dict[str, Any]] = {}
    if source == "host":
        with svc.stores.host() as s:
            host_rows = {r.seq: record_from_host(r) for r in s.scalars(select(HostEvent).order_by(HostEvent.seq))}

    events_out: list[dict[str, Any]] = []
    batches_out: list[dict[str, Any]] = []
    covered: set[int] = set()
    for b in batches:
        members = sorted(by_batch.get(b.batch_id, []), key=lambda e: e.leaf_index)
        leaves = [bytes.fromhex(e.leaf_hash) for e in members]
        included = False
        for e in members:
            if wanted is not None and e.seq not in wanted:
                continue
            covered.add(e.seq)
            if source == "vault":
                record = json.loads(e.canonical_json)
            else:
                record = host_rows.get(e.seq)
                if record is None:
                    continue  # deleted on the host: the auditor must notice the gap
            proof = [step.to_dict() for step in merkle_proof(leaves, e.leaf_index)]
            events_out.append({"seq": e.seq, "batch_id": b.batch_id, "leaf_index": e.leaf_index,
                               "record": record, "proof": proof})
            included = True
        if wanted is None or included or any(seq in wanted for seq in range(b.first_seq, b.last_seq + 1)):
            batches_out.append({
                "batch_id": b.batch_id, "first_seq": b.first_seq, "last_seq": b.last_seq,
                "event_count": b.event_count, "merkle_root": b.merkle_root, "prev_chain_head": b.prev_chain_head,
                "chain_head": b.chain_head, "manifest_hash": b.manifest_hash, "tx_hash": b.tx_hash,
                "block_number": b.block_number,
            })

    extras: list[dict[str, Any]] = []
    if source == "host":
        anchored_seqs = {e.seq for e in vault_events if e.batch_id in anchored_ids}
        for seq, record in host_rows.items():
            if seq not in anchored_seqs and (wanted is None or seq in wanted):
                extras.append({"seq": seq, "record": record})

    return {
        "format": BUNDLE_FORMAT,
        "exported_at": utc_now_iso(),
        "source": source,
        "scope": "selective" if wanted is not None else "full",
        "hash_spec": HASH_SPEC,
        "anchor": {"chain_id": dep.chain_id, "contract_address": dep.contract_address},
        "batches": batches_out,
        "events": events_out,
        "unanchored_records": extras,
        "notes": {
            "unanchored_in_vault": unanchored,
            "verification": "Claims in this file are untrusted. Verify with verifier/leash_verify.py against an "
                            "RPC endpoint you control or trust, and confirm the contract address out of band.",
        },
    }
