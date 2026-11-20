"""Verification engine: host store vs evidence vault vs on-chain commitments.

Trust order (strongest first):
  1. On-chain batch commitments (independent, append-only)
  2. Vault leaves, but only for batches whose recomputed root matches the chain
  3. Vault leaves of not-yet-anchored events (protected by storage separation only)
The host store is never trusted; it is the thing being checked.
"""

from __future__ import annotations

import hashlib
import json
import time
from typing import Any

from sqlalchemy import select

from .anchor import AnchorError
from .hashchain import GENESIS, chain_over
from .merkle import leaf_hash, merkle_root
from .records import diff_records, record_from_host, record_leaf, utc_now_iso
from .storage import Batch, HostEvent, VaultEvent, VerificationRun
from .heartbeat import check_heartbeats
from .witness import check_observations

# Batch states
VERIFIED = "VERIFIED"
PENDING = "PENDING"
MISSING_ON_CHAIN = "MISSING_ON_CHAIN"
VAULT_MISMATCH = "VAULT_MISMATCH"
UNREACHABLE = "CHAIN_UNREACHABLE"

# Event states
INTACT = "INTACT"
MODIFIED = "MODIFIED"
DELETED = "DELETED"
INJECTED = "INJECTED"


def _load(svc) -> tuple[list[VaultEvent], list[Batch], dict[int, dict[str, Any]]]:
    with svc.stores.vault() as s:
        vault_events = list(s.scalars(select(VaultEvent).order_by(VaultEvent.seq)))
        batches = list(s.scalars(select(Batch).order_by(Batch.batch_id)))
    with svc.stores.host() as s:
        host = {row.seq: record_from_host(row) for row in s.scalars(select(HostEvent).order_by(HostEvent.seq))}
    return vault_events, batches, host


def _verify_batches(svc, vault_events: list[VaultEvent], batches: list[Batch],
                    host: dict[int, dict[str, Any]]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    dep = svc.active_deployment()
    connected = svc.anchor.is_connected()
    chain: dict[str, Any] = {
        "rpc_url": svc.settings.rpc_url,
        "connected": connected,
        "chain_id": None,
        "latest_block": None,
        "contract_address": dep.contract_address if dep else None,
        "contract_present": False,
        "onchain_batch_count": None,
        "error": None,
    }
    if connected and dep:
        try:
            chain["chain_id"] = svc.anchor.chain_id()
            chain["latest_block"] = svc.anchor.latest_block()
            chain["contract_present"] = svc.anchor.has_code(dep.contract_address)
            if chain["contract_present"]:
                chain["onchain_batch_count"] = svc.anchor.batch_count(dep.contract_address)
            if chain["chain_id"] != dep.chain_id:
                chain["error"] = f"connected to chain {chain['chain_id']}, deployment is on chain {dep.chain_id}"
        except AnchorError as exc:
            chain["error"] = str(exc)
    chain_ok = bool(connected and dep and chain["contract_present"] and chain["error"] is None)

    by_batch: dict[int, list[VaultEvent]] = {}
    for e in vault_events:
        if e.batch_id is not None:
            by_batch.setdefault(e.batch_id, []).append(e)

    reports: list[dict[str, Any]] = []
    expected_prev = GENESIS.hex()
    for b in batches:
        members = sorted(by_batch.get(b.batch_id, []), key=lambda e: e.leaf_index or 0)
        issues: list[str] = []
        # Vault self-consistency
        for e in members:
            if leaf_hash(e.canonical_json.encode("utf-8")).hex() != e.leaf_hash:
                issues.append(f"vault leaf hash mismatch at seq {e.seq}")
        seqs = [e.seq for e in members]
        if seqs != list(range(b.first_seq, b.last_seq + 1)) or len(members) != b.event_count:
            issues.append("vault batch membership does not cover the committed range")
        leaves = [bytes.fromhex(e.leaf_hash) for e in members]
        vault_root = merkle_root(leaves).hex() if leaves else None
        vault_head = chain_over(leaves, bytes.fromhex(b.prev_chain_head)).hex() if leaves else None
        if vault_root != b.merkle_root:
            issues.append("recomputed vault root differs from sealed root")
        if vault_head != b.chain_head:
            issues.append("recomputed hash-chain head differs from sealed head")
        if b.prev_chain_head != expected_prev:
            issues.append("batch does not link to the previous batch's chain head")
        if hashlib.sha256(b.manifest_json.encode("utf-8")).hexdigest() != b.manifest_hash:
            issues.append("manifest hash mismatch")

        # Host-side recomputation for this batch (only possible if no record is missing)
        host_leaves = [record_leaf(host[s]) for s in range(b.first_seq, b.last_seq + 1) if s in host]
        host_complete = len(host_leaves) == b.event_count
        host_root = merkle_root(host_leaves).hex() if host_complete and host_leaves else None

        report: dict[str, Any] = {
            "batch_id": b.batch_id,
            "first_seq": b.first_seq,
            "last_seq": b.last_seq,
            "event_count": b.event_count,
            "sealed_root": b.merkle_root,
            "vault_root": vault_root,
            "host_root": host_root,
            "onchain": None,
            "tx_hash": b.tx_hash,
            "block_number": b.block_number,
            "receipt_status": None,
            "host_matches_chain": None,
            "issues": issues,
        }

        if b.status != "anchored":
            report["status"] = PENDING
        elif not chain_ok:
            report["status"] = UNREACHABLE
        else:
            onchain = svc.anchor.get_batch(dep.contract_address, b.batch_id)
            if onchain is None:
                report["status"] = MISSING_ON_CHAIN
                issues.append("no commitment for this batch id on-chain")
            else:
                report["onchain"] = onchain.to_dict()
                checks = {
                    "merkle root": onchain.merkle_root == vault_root == b.merkle_root,
                    "chain head": onchain.chain_head == vault_head == b.chain_head,
                    "manifest hash": onchain.manifest_hash == b.manifest_hash,
                    "sequence range": (onchain.first_seq, onchain.last_seq, onchain.event_count)
                    == (b.first_seq, b.last_seq, b.event_count),
                }
                for name, ok in checks.items():
                    if not ok:
                        issues.append(f"on-chain {name} does not match vault")
                receipt = svc.anchor.get_receipt(b.tx_hash) if b.tx_hash else None
                if receipt is None:
                    issues.append("anchoring transaction receipt not found")
                else:
                    report["receipt_status"] = int(receipt.get("status", 0))
                    if report["receipt_status"] != 1:
                        issues.append("anchoring transaction did not succeed")
                    if int(receipt.get("blockNumber", -1)) != onchain.block_number:
                        issues.append("receipt block differs from on-chain record")
                    to_addr = str(receipt.get("to") or "").lower()
                    if to_addr != dep.contract_address.lower():
                        issues.append("receipt was not sent to the anchor contract")
                report["host_matches_chain"] = host_root == onchain.merkle_root if host_root else False
                report["status"] = VERIFIED if not issues else VAULT_MISMATCH
                expected_prev = onchain.chain_head
                reports.append(report)
                continue
        expected_prev = b.chain_head
        reports.append(report)

    return reports, chain


def classify_events(vault_events: list[VaultEvent], batch_status: dict[int, str],
                    host: dict[int, dict[str, Any]]) -> list[dict[str, Any]]:
    """Per-event status for every sequence number seen in the vault or on the host."""
    out: list[dict[str, Any]] = []
    vault_seqs = set()
    for e in vault_events:
        vault_seqs.add(e.seq)
        b_status = batch_status.get(e.batch_id) if e.batch_id is not None else None
        if b_status == VERIFIED:
            protection = "anchored"
        elif b_status in (None, PENDING):
            protection = "vault_only"
        else:
            protection = "unverifiable"
        expected = json.loads(e.canonical_json)
        found = host.get(e.seq)
        item: dict[str, Any] = {
            "seq": e.seq,
            "event_id": e.event_id,
            "batch_id": e.batch_id,
            "protection": protection,
            "leaf_hash": e.leaf_hash,
            "host_leaf_hash": None,
            "record": expected,
            "host_record": found,
            "diff": None,
        }
        if found is None:
            item["status"] = DELETED
        else:
            host_leaf = record_leaf(found).hex()
            item["host_leaf_hash"] = host_leaf
            if host_leaf == e.leaf_hash:
                item["status"] = INTACT
            else:
                item["status"] = MODIFIED
                item["diff"] = diff_records(expected, found)
        out.append(item)
    for seq, found in host.items():
        if seq not in vault_seqs:
            out.append({
                "seq": seq, "event_id": found.get("id"), "batch_id": None, "protection": "none",
                "leaf_hash": None, "host_leaf_hash": record_leaf(found).hex(), "record": None,
                "host_record": found, "diff": None, "status": INJECTED,
            })
    out.sort(key=lambda i: (i["seq"], i["status"] != INJECTED))
    return out


def snapshot(svc) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    vault_events, batches, host = _load(svc)
    batch_reports, chain = _verify_batches(svc, vault_events, batches, host)
    status = {r["batch_id"]: r["status"] for r in batch_reports}
    events = classify_events(vault_events, status, host)
    return events, batch_reports, chain


def run_verification(svc, persist: bool = True) -> dict[str, Any]:
    started = time.perf_counter()
    events, batch_reports, chain = snapshot(svc)
    witness = check_observations(svc)
    heartbeat = check_heartbeats(svc)

    counts = {INTACT: 0, MODIFIED: 0, DELETED: 0, INJECTED: 0}
    anchored_counts = {INTACT: 0, MODIFIED: 0, DELETED: 0}
    for e in events:
        counts[e["status"]] += 1
        if e["protection"] == "anchored":
            anchored_counts[e["status"]] += 1
    findings = [
        {k: e[k] for k in ("seq", "event_id", "batch_id", "status", "protection", "diff", "leaf_hash",
                           "host_leaf_hash")}
        | {"recovered_record": e["record"] if e["status"] in (MODIFIED, DELETED) else None,
           "host_record": e["host_record"] if e["status"] in (MODIFIED, INJECTED) else None}
        for e in events if e["status"] != INTACT
    ]
    batch_states = [r["status"] for r in batch_reports]
    vault_problem = any(s in (VAULT_MISMATCH, MISSING_ON_CHAIN) for s in batch_states)
    unreachable = any(s == UNREACHABLE for s in batch_states)
    anchored_batches = sum(1 for s in batch_states if s != PENDING)

    # Precedence: proven rewriting of history, then a witnessed session the host never reported, then "can't tell".
    if findings or vault_problem:
        verdict = "TAMPERING_DETECTED"
    elif witness["omissions"]:
        verdict = "OBSERVED_OMISSION"
    elif heartbeat["gaps"]:
        verdict = "REPORTING_GAP"  # the host stopped checking in; not, by itself, an intrusion
    elif unreachable or witness["rejected"] or heartbeat["rejected"]:
        verdict = "INCONCLUSIVE"
    else:
        verdict = "CLEAN"
    if anchored_batches == 0:
        attestation = "none_anchored"
    elif unreachable:
        attestation = "unavailable"
    elif vault_problem:
        attestation = "failed"
    else:
        attestation = "verified"

    summary = {
        "total_records": len(events),
        "intact": counts[INTACT],
        "modified": counts[MODIFIED],
        "deleted": counts[DELETED],
        "injected": counts[INJECTED],
        "anchored_intact": anchored_counts[INTACT],
        "anchored_modified": anchored_counts[MODIFIED],
        "anchored_deleted": anchored_counts[DELETED],
        "batches_total": len(batch_reports),
        "batches_verified": batch_states.count(VERIFIED),
        "batches_pending": batch_states.count(PENDING),
        "batches_failed": sum(1 for s in batch_states if s in (VAULT_MISMATCH, MISSING_ON_CHAIN)),
        "host_batches_matching_chain": sum(1 for r in batch_reports if r["host_matches_chain"]),
        "first_divergent_seq": min((f["seq"] for f in findings), default=None),
        "witness_observations": witness["observations"],
        "witness_corroborated": len(witness["corroborated"]),
        "witness_rejected": len(witness["rejected"]),
        "omissions": len(witness["omissions"]),
        "heartbeats": heartbeat["heartbeats"],
        "reporting_gaps": len(heartbeat["gaps"]),
    }
    duration_ms = int((time.perf_counter() - started) * 1000)
    report = {
        "verified_at": utc_now_iso(),
        "duration_ms": duration_ms,
        "verdict": verdict,
        "chain_attestation": attestation,
        "chain": chain,
        "summary": summary,
        "batches": batch_reports,
        "findings": findings,
        "witness": witness,
        "heartbeat": heartbeat,
    }
    if persist:
        with svc.stores.vault() as s:
            run = VerificationRun(verified_at=report["verified_at"], duration_ms=duration_ms, verdict=verdict,
                                  summary_json=json.dumps(summary), report_json=json.dumps(report))
            s.add(run)
            s.flush()
            report["run_id"] = run.id
    return report
