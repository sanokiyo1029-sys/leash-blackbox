"""Collector, host agent and batch anchoring pipeline."""

from __future__ import annotations

import hashlib
import threading
import uuid
from typing import Any

from sqlalchemy import func, select

from .anchor import AnchorClient, AnchorError
from .canonical import canonical_bytes, canonical_json
from .config import Settings
from .hashchain import GENESIS, chain_next
from .merkle import leaf_hash, merkle_root
from .records import RawEvent, build_record, host_columns, utc_now_iso
from .storage import Batch, Deployment, HostEvent, Stores, VaultEvent

HASH_SPEC = {
    "canonicalization": "JSON, keys sorted by code point, no whitespace, UTF-8; strings/integers/null only",
    "leaf": "sha256(0x00 || canonical_record)",
    "node": "sha256(0x01 || left || right); unpaired last node promoted",
    "chain": "sha256(0x02 || prev_chain || leaf); genesis = 32 zero bytes",
    "manifest": "sha256(canonical_json(manifest))",
}


def batch_to_dict(b: Batch) -> dict[str, Any]:
    return {
        "batch_id": b.batch_id,
        "first_seq": b.first_seq,
        "last_seq": b.last_seq,
        "event_count": b.event_count,
        "merkle_root": b.merkle_root,
        "prev_chain_head": b.prev_chain_head,
        "chain_head": b.chain_head,
        "manifest_hash": b.manifest_hash,
        "status": b.status,
        "sealed_at": b.sealed_at,
        "tx_hash": b.tx_hash,
        "block_number": b.block_number,
        "block_timestamp": b.block_timestamp,
        "gas_used": b.gas_used,
        "anchored_at": b.anchored_at,
        "anchor_latency_ms": b.anchor_latency_ms,
        "error": b.error,
    }


def deployment_to_dict(d: Deployment | None) -> dict[str, Any] | None:
    if d is None:
        return None
    return {
        "id": d.id,
        "chain_id": d.chain_id,
        "contract_address": d.contract_address,
        "deployer": d.deployer,
        "tx_hash": d.tx_hash,
        "block_number": d.block_number,
        "deployed_at": d.deployed_at,
    }


class LeashService:
    def __init__(self, settings: Settings, stores: Stores | None = None, anchor: AnchorClient | None = None):
        self.settings = settings
        self.stores = stores or Stores(settings)
        self.anchor = anchor or AnchorClient(settings)
        self.lock = threading.RLock()

    # -------------------------------------------------------------- deployment
    def active_deployment(self) -> Deployment | None:
        with self.stores.vault() as s:
            return s.scalar(select(Deployment).where(Deployment.active.is_(True)).order_by(Deployment.id.desc()))

    def ensure_deployment(self) -> Deployment:
        """Return the active contract, deploying one only if none exists yet."""
        with self.lock:
            dep = self.active_deployment()
            if dep is not None:
                if not self.anchor.has_code(dep.contract_address):
                    raise AnchorError(
                        f"anchor contract {dep.contract_address} not found on chain at {self.settings.rpc_url}; "
                        "the local chain was probably restarted - run a demo reset"
                    )
                return dep
            if not self.anchor.is_connected():
                raise AnchorError(f"blockchain node unreachable at {self.settings.rpc_url}")
            result = self.anchor.deploy()
            with self.stores.vault() as s:
                dep = Deployment(chain_id=result.chain_id, contract_address=result.address, deployer=result.deployer,
                                 tx_hash=result.tx_hash, block_number=result.block_number,
                                 deployed_at=utc_now_iso(), active=True)
                s.add(dep)
            return dep

    def reset(self) -> Deployment:
        """Wipe every store and deploy a fresh contract (demo reset)."""
        with self.lock:
            self.stores.wipe()
            return self.ensure_deployment()

    # --------------------------------------------------------------- collector
    def ingest(self, raws: list[RawEvent]) -> list[dict[str, Any]]:
        """Sequence, canonicalize, hash and chain events into the evidence vault."""
        records: list[dict[str, Any]] = []
        with self.lock, self.stores.vault() as s:
            last = s.scalar(select(VaultEvent).order_by(VaultEvent.seq.desc()).limit(1))
            seq = last.seq if last else 0
            prev = bytes.fromhex(last.chain_hash) if last else GENESIS
            now = utc_now_iso()
            for raw in raws:
                seq += 1
                record = build_record(seq, str(uuid.uuid4()), raw)
                canon = canonical_json(record)
                leaf = leaf_hash(canon.encode("utf-8"))
                chained = chain_next(prev, leaf)
                s.add(VaultEvent(seq=seq, event_id=record["id"], canonical_json=canon, leaf_hash=leaf.hex(),
                                 prev_chain_hash=prev.hex(), chain_hash=chained.hex(), ingested_at=now))
                prev = chained
                records.append(record)
        return records

    # -------------------------------------------------------------- host agent
    def emit_from_host(self, raws: list[RawEvent]) -> list[dict[str, Any]]:
        """Simulated host agent: forward to the collector, then keep a local copy."""
        records = self.ingest(raws)
        with self.stores.host() as s:
            for record in records:
                s.add(HostEvent(**host_columns(record)))
        return records

    # ---------------------------------------------------------------- anchoring
    def pending_event_count(self) -> int:
        with self.stores.vault() as s:
            return int(s.scalar(select(func.count()).select_from(VaultEvent).where(VaultEvent.batch_id.is_(None))))

    def seal_and_anchor(self) -> list[dict[str, Any]]:
        """Seal all unbatched events into batches and anchor each one on-chain."""
        with self.lock:
            dep = self.ensure_deployment()
            anchored: list[dict[str, Any]] = []
            with self.stores.vault() as s:
                unfinished = list(s.scalars(select(Batch).where(Batch.status != "anchored").order_by(Batch.batch_id)))
            for batch in unfinished:
                anchored.append(self._submit(dep, batch.batch_id))
            while True:
                batch_id = self._seal_next(dep)
                if batch_id is None:
                    break
                anchored.append(self._submit(dep, batch_id))
            return anchored

    def _seal_next(self, dep: Deployment) -> int | None:
        with self.stores.vault() as s:
            events = list(s.scalars(
                select(VaultEvent).where(VaultEvent.batch_id.is_(None)).order_by(VaultEvent.seq)
                .limit(self.settings.max_batch_size)
            ))
            if not events:
                return None
            max_id = s.scalar(select(func.max(Batch.batch_id)))
            batch_id = 0 if max_id is None else int(max_id) + 1
            leaves = [bytes.fromhex(e.leaf_hash) for e in events]
            root = merkle_root(leaves)
            manifest = {
                "schema": "leash-blackbox-batch/v1",
                "batch_id": batch_id,
                "first_seq": events[0].seq,
                "last_seq": events[-1].seq,
                "event_count": len(events),
                "merkle_root": root.hex(),
                "prev_chain_head": events[0].prev_chain_hash,
                "chain_head": events[-1].chain_hash,
                "leaf_hashes": [e.leaf_hash for e in events],
                "hash_spec": HASH_SPEC,
            }
            manifest_hash = hashlib.sha256(canonical_bytes(manifest)).hexdigest()
            s.add(Batch(
                batch_id=batch_id, deployment_id=dep.id, first_seq=events[0].seq, last_seq=events[-1].seq,
                event_count=len(events), merkle_root=root.hex(), prev_chain_head=events[0].prev_chain_hash,
                chain_head=events[-1].chain_hash, manifest_json=canonical_json(manifest),
                manifest_hash=manifest_hash, status="pending", sealed_at=utc_now_iso(),
            ))
            for index, e in enumerate(events):
                e.batch_id = batch_id
                e.leaf_index = index
            return batch_id

    def _submit(self, dep: Deployment, batch_id: int) -> dict[str, Any]:
        with self.stores.vault() as s:
            b = s.get(Batch, batch_id)
            args = (bytes.fromhex(b.merkle_root), bytes.fromhex(b.chain_head), bytes.fromhex(b.manifest_hash),
                    b.first_seq, b.last_seq, b.event_count)
        try:
            onchain_count = self.anchor.batch_count(dep.contract_address)
            if onchain_count != batch_id:
                raise AnchorError(f"on-chain batch count {onchain_count} does not match local batch id {batch_id}")
            receipt = self.anchor.anchor_batch(dep.contract_address, *args)
            if receipt.batch_id != batch_id:
                raise AnchorError(f"contract assigned batch id {receipt.batch_id}, expected {batch_id}")
        except AnchorError as exc:
            with self.stores.vault() as s:
                b = s.get(Batch, batch_id)
                b.status = "failed"
                b.error = str(exc)[:2000]
            raise
        with self.stores.vault() as s:
            b = s.get(Batch, batch_id)
            b.status = "anchored"
            b.tx_hash = receipt.tx_hash
            b.block_number = receipt.block_number
            b.block_timestamp = receipt.block_timestamp
            b.gas_used = receipt.gas_used
            b.anchored_at = utc_now_iso()
            b.anchor_latency_ms = receipt.latency_ms
            b.error = None
            return batch_to_dict(b)

    # ------------------------------------------------------------------- reads
    def list_batches(self) -> list[dict[str, Any]]:
        with self.stores.vault() as s:
            return [batch_to_dict(b) for b in s.scalars(select(Batch).order_by(Batch.batch_id))]

    def counts(self) -> dict[str, int]:
        with self.stores.vault() as s:
            vault_total = int(s.scalar(select(func.count()).select_from(VaultEvent)))
            unbatched = int(s.scalar(select(func.count()).select_from(VaultEvent).where(VaultEvent.batch_id.is_(None))))
            anchored_events = int(s.scalar(
                select(func.coalesce(func.sum(Batch.event_count), 0)).where(Batch.status == "anchored")))
            batches = int(s.scalar(select(func.count()).select_from(Batch)))
            anchored_batches = int(s.scalar(select(func.count()).select_from(Batch).where(Batch.status == "anchored")))
        with self.stores.host() as s:
            host_total = int(s.scalar(select(func.count()).select_from(HostEvent)))
        return {
            "host_events": host_total,
            "vault_events": vault_total,
            "anchored_events": anchored_events,
            "unanchored_events": vault_total - anchored_events,
            "unbatched_events": unbatched,
            "batches": batches,
            "anchored_batches": anchored_batches,
        }
