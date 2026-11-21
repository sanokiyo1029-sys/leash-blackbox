"""End-to-end pipeline tests against a real local EVM node."""

from __future__ import annotations

import json
import sqlite3
from dataclasses import replace

import pytest
from sqlalchemy import select

from app.anchor import AnchorError
from app.attack import AttackLab
from app.generator import ATTACKER_IP, INTRUSION_LENGTH, generate_traffic
from app.hashchain import GENESIS, chain_over
from app.merkle import merkle_root
from app.service import LeashService
from app.storage import VaultEvent
from app.verify import run_verification


def _populate(svc: LeashService, count: int = 60, intrusion: bool = True, seed: int = 1) -> list[dict]:
    records = svc.emit_from_host(generate_traffic(count, seed=seed, include_intrusion=intrusion))
    svc.seal_and_anchor()
    return records


def _lab(svc: LeashService) -> AttackLab:
    return AttackLab(svc.stores.host, svc.stores.lab)


def test_reset_survives_an_open_connection_and_keeps_the_vault_append_only(svc):
    # A request arriving mid-reset holds a store open; on Windows deleting the file then failed halfway (WinError 32).
    svc.ingest(generate_traffic(20, seed=3))
    held = sqlite3.connect(svc.settings.vault_db_path)
    try:
        svc.reset()
    finally:
        held.close()
    assert svc.counts()["vault_events"] == 0 and svc.counts()["host_events"] == 0
    svc.ingest(generate_traffic(5, seed=4))
    with pytest.raises(Exception, match="append-only"):
        with svc.stores.vault() as s:
            s.execute(select(VaultEvent).limit(1)).scalar_one().canonical_json = "{}"


def test_ingest_sequences_and_chains_events(svc):
    records = svc.emit_from_host(generate_traffic(25, seed=3))
    assert [r["seq"] for r in records] == list(range(1, 26))
    with svc.stores.vault() as s:
        rows = list(s.scalars(select(VaultEvent).order_by(VaultEvent.seq)))
    assert rows[0].prev_chain_hash == GENESIS.hex()
    for prev, cur in zip(rows, rows[1:]):
        assert cur.prev_chain_hash == prev.chain_hash
    leaves = [bytes.fromhex(r.leaf_hash) for r in rows]
    assert chain_over(leaves).hex() == rows[-1].chain_hash


def test_anchoring_writes_real_onchain_commitment(svc):
    _populate(svc, 40, intrusion=False)
    batches = svc.list_batches()
    assert len(batches) == 1 and batches[0]["status"] == "anchored"
    b = batches[0]
    dep = svc.active_deployment()
    onchain = svc.anchor.get_batch(dep.contract_address, 0)
    with svc.stores.vault() as s:
        leaves = [bytes.fromhex(e.leaf_hash) for e in s.scalars(select(VaultEvent).order_by(VaultEvent.seq))]
    assert onchain.merkle_root == b["merkle_root"] == merkle_root(leaves).hex()
    assert onchain.chain_head == b["chain_head"]
    assert (onchain.first_seq, onchain.last_seq, onchain.event_count) == (1, 40, 40)
    receipt = svc.anchor.get_receipt(b["tx_hash"])
    assert int(receipt["status"]) == 1
    assert receipt["to"].lower() == dep.contract_address.lower()
    assert b["gas_used"] > 0 and b["block_number"] == onchain.block_number


def test_clean_run_has_no_false_positives(svc):
    _populate(svc, 120, intrusion=True)
    report = run_verification(svc)
    assert report["verdict"] == "CLEAN"
    assert report["chain_attestation"] == "verified"
    assert report["findings"] == []
    assert report["summary"]["intact"] == 120 + INTRUSION_LENGTH
    assert all(b["status"] == "VERIFIED" and b["host_matches_chain"] for b in report["batches"])


def test_multiple_batches_are_contiguous(svc):
    small = LeashService(replace(svc.settings, max_batch_size=16), stores=svc.stores, anchor=svc.anchor)
    small.emit_from_host(generate_traffic(50, seed=9))
    anchored = small.seal_and_anchor()
    assert [b["event_count"] for b in anchored] == [16, 16, 16, 2]
    for prev, cur in zip(anchored, anchored[1:]):
        assert cur["first_seq"] == prev["last_seq"] + 1
        assert cur["prev_chain_head"] == prev["chain_head"]
    report = run_verification(small)
    assert report["verdict"] == "CLEAN" and report["summary"]["batches_verified"] == 4


def test_cover_tracks_deletion_detected_and_recoverable(svc):
    _populate(svc)
    result = _lab(svc).run("cover_tracks")
    assert result["affected"] == INTRUSION_LENGTH
    report = run_verification(svc)
    assert report["verdict"] == "TAMPERING_DETECTED"
    deleted = [f for f in report["findings"] if f["status"] == "DELETED"]
    assert sorted(f["seq"] for f in deleted) == result["seqs"]
    # The original evidence is recovered from the vault, proven by the anchored root
    assert all(ATTACKER_IP in json.dumps(f["recovered_record"]) for f in deleted)
    assert all(f["protection"] == "anchored" for f in deleted)
    assert report["summary"]["host_batches_matching_chain"] == 0


def test_alter_evidence_detected_with_field_diff(svc):
    _populate(svc)
    result = _lab(svc).run("alter_evidence")
    report = run_verification(svc)
    modified = {f["seq"]: f for f in report["findings"] if f["status"] == "MODIFIED"}
    assert sorted(modified) == result["seqs"]
    sample = next(iter(modified.values()))
    assert "msg" in sample["diff"] or "severity" in sample["diff"]


def test_fabricated_records_flagged_as_injected(svc):
    _populate(svc)
    result = _lab(svc).run("fabricate_alibi", count=2)
    report = run_verification(svc)
    injected = sorted(f["seq"] for f in report["findings"] if f["status"] == "INJECTED")
    assert injected == result["seqs"]


def test_timestomp_truncate_and_wipe_detected(svc):
    _populate(svc, 50)
    lab = _lab(svc)
    stomp = lab.run("timestomp")
    report = run_verification(svc)
    assert {f["seq"] for f in report["findings"] if f["status"] == "MODIFIED"} == set(stomp["seqs"])
    trunc = lab.run("truncate_tail", count=5)
    report = run_verification(svc)
    assert set(trunc["seqs"]) <= {f["seq"] for f in report["findings"] if f["status"] == "DELETED"}
    lab.run("wipe_all")
    report = run_verification(svc)
    assert report["summary"]["deleted"] == 50 + INTRUSION_LENGTH
    assert report["summary"]["intact"] == 0


def test_targeted_erase_and_rewrite_are_detected(svc):
    records = _populate(svc, 40)
    attacker = [r["seq"] for r in records if ATTACKER_IP in r["msg"]]
    lab = _lab(svc)
    assert lab.run("erase_record", seq=attacker[0])["seqs"] == [attacker[0]]
    assert lab.run("rewrite_record", seq=attacker[1])["actions"] == {"modify": 1}
    assert lab.run("rewrite_record", seq=1, message="nothing happened")["seqs"] == [1]
    report = run_verification(svc)
    found = {f["seq"]: f["status"] for f in report["findings"]}
    assert found == {attacker[0]: "DELETED", attacker[1]: "MODIFIED", 1: "MODIFIED"}
    rewritten = next(f for f in report["findings"] if f["seq"] == attacker[1])
    assert ATTACKER_IP not in json.dumps(rewritten["host_record"])
    assert ATTACKER_IP in json.dumps(rewritten["recovered_record"])
    with pytest.raises(ValueError):
        lab.run("erase_record", seq=attacker[0])  # already gone


def test_replacing_a_deleted_committed_record_is_reported_as_modified(svc):
    """Delete the newest record, then fabricate a new one under the same anchored seq."""
    _populate(svc, 30, intrusion=False)
    lab = _lab(svc)
    deleted = lab.run("truncate_tail", count=1)["seqs"]
    injected = lab.run("fabricate_alibi", count=1)["seqs"]
    assert deleted == injected == [30]
    report = run_verification(svc)
    assert [(f["seq"], f["status"]) for f in report["findings"]] == [(30, "MODIFIED")]
    assert lab.ground_truth() == {30: "modify"}


@pytest.mark.parametrize("seed", [11, 12, 13])
def test_random_tampering_matches_ground_truth(svc, seed):
    _populate(svc, 80, seed=seed)
    lab = _lab(svc)
    lab.run("random_tamper", modify=4, delete_count=4, inject=2, seed=seed)
    report = run_verification(svc)
    truth = lab.ground_truth()
    expected = {"modify": "MODIFIED", "delete": "DELETED", "inject": "INJECTED"}
    detected = {f["seq"]: f["status"] for f in report["findings"]}
    assert detected == {seq: expected[a] for seq, a in truth.items()}


def test_vault_rejects_updates_and_deletes(svc):
    _populate(svc, 10, intrusion=False)
    con = sqlite3.connect(svc.settings.vault_db_path)
    try:
        with pytest.raises(sqlite3.DatabaseError, match="append-only"):
            con.execute("UPDATE vault_events SET canonical_json = '{}' WHERE seq = 1")
        with pytest.raises(sqlite3.DatabaseError, match="append-only"):
            con.execute("DELETE FROM vault_events WHERE seq = 1")
        with pytest.raises(sqlite3.DatabaseError, match="immutable"):
            con.execute("UPDATE batches SET merkle_root = '00' WHERE batch_id = 0")
    finally:
        con.close()


def test_out_of_model_vault_tampering_is_caught_by_chain(svc):
    """Even an attacker who also rewrites the vault cannot match the on-chain root."""
    _populate(svc, 20, intrusion=False)
    svc.stores.dispose()
    con = sqlite3.connect(svc.settings.vault_db_path)
    con.execute("DROP TRIGGER vault_events_no_rewrite")
    row = con.execute("SELECT canonical_json FROM vault_events WHERE seq = 5").fetchone()
    forged = json.loads(row[0])
    forged["msg"] = "nothing to see here"
    from app.canonical import canonical_json
    from app.merkle import leaf_hash
    canon = canonical_json(forged)
    con.execute("UPDATE vault_events SET canonical_json = ?, leaf_hash = ? WHERE seq = 5",
                (canon, leaf_hash(canon.encode()).hex()))
    con.commit()
    con.close()
    # Make the host agree with the forged vault so only the chain can tell.
    hcon = sqlite3.connect(svc.settings.host_db_path)
    hcon.execute("UPDATE host_events SET message = 'nothing to see here' WHERE seq = 5")
    hcon.commit()
    hcon.close()
    svc.stores._open()
    report = run_verification(svc)
    assert report["verdict"] == "TAMPERING_DETECTED"
    assert report["chain_attestation"] == "failed"
    assert report["batches"][0]["status"] == "VAULT_MISMATCH"


def test_chain_outage_keeps_events_pending_then_recovers(svc, offline_settings):
    svc.emit_from_host(generate_traffic(10, seed=5))
    offline = LeashService(replace(svc.settings, rpc_url=offline_settings.rpc_url, rpc_timeout_s=1.0),
                           stores=svc.stores)
    with pytest.raises(AnchorError):
        offline.seal_and_anchor()
    report = run_verification(offline)
    assert report["verdict"] in ("CLEAN", "INCONCLUSIVE")  # no anchored batches yet; host intact
    assert report["chain_attestation"] in ("none_anchored", "unavailable")
    # Back online: the same events get anchored, nothing lost or duplicated.
    svc.seal_and_anchor()
    assert svc.counts()["anchored_events"] == 10
    assert run_verification(svc)["verdict"] == "CLEAN"


def test_unreachable_chain_after_anchoring_is_inconclusive(svc, offline_settings):
    _populate(svc, 15, intrusion=False)
    offline = LeashService(replace(svc.settings, rpc_url=offline_settings.rpc_url, rpc_timeout_s=1.0),
                           stores=svc.stores)
    report = run_verification(offline)
    assert report["verdict"] == "INCONCLUSIVE"
    assert report["chain_attestation"] == "unavailable"


def test_reset_is_repeatable_with_fresh_contract(svc):
    first = svc.active_deployment().contract_address
    _populate(svc, 10)
    _lab(svc).run("wipe_all")
    second = svc.reset().contract_address
    assert second != first
    assert svc.counts()["vault_events"] == 0
    _populate(svc, 10)
    assert run_verification(svc)["verdict"] == "CLEAN"
