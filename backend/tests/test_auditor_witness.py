"""T-046: the stdlib-only auditor CLI checks witness signatures and the 2-of-3 omission rule offline."""

from __future__ import annotations

import json

import leash_verify
import pytest
from eth_account import Account
from eth_account.messages import encode_defunct
from fastapi.testclient import TestClient

from app.generator import HOST
from app.main import create_app
from app.records import utc_now_iso
from app.storage import WitnessObservation
from app.witness import GatewayWitness


@pytest.fixture()
def client(settings):
    app = create_app(settings)
    with TestClient(app) as c:
        assert c.post("/api/demo/reset").status_code == 200
        r = c.post("/api/simulate/traffic", json={"count": 60, "include_intrusion": True, "seed": 7})
        assert r.status_code == 200 and r.json()["anchor_error"] is None, r.text
        yield c
    app.state.svc.stores.dispose()


def _cli(client, bundle, pinned=True):
    pins = {w["role"]: w["witness_id"] for w in client.get("/api/witness").json()["witnesses"]} if pinned else None
    return leash_verify.verify(bundle, client.app.state.svc.settings.rpc_url, bundle["anchor"]["contract_address"],
                               pins)


def test_recovery_matches_eth_account():
    for text in ("", "hello", '{"a":"ü 漢字"}', "x" * 300):
        acct = Account.create()
        sig = bytes(acct.sign_message(encode_defunct(text=text)).signature).hex()
        assert leash_verify.recover_signer(text, sig) == acct.address.lower()
        assert leash_verify.recover_signer(text + " ", sig) != acct.address.lower()  # any edit changes the signer
    good = bytes(Account.create().sign_message(encode_defunct(text="m")).signature)
    zero_r = bytes(32) + good[32:]
    big_s = good[:32] + (leash_verify._N).to_bytes(32, "big") + good[64:]
    for bad in (good[:64], zero_r, big_s, good[:64] + bytes([29]), b""):
        assert leash_verify.recover_signer("m", bad.hex()) is None
    assert leash_verify.recover_signer("m", "not hex") is None


def test_clean_bundle_corroborates_every_session(client):
    bundle = client.get("/api/export").json()
    assert bundle["witness"]["policy"]["version"] == 2 and bundle["witness"]["observations"]
    report = _cli(client, bundle)
    w = report["witness"]
    assert report["verdict"] == "VERIFIED" and w["complete_evidence"] is True
    assert {tuple(c["sources"]) for c in w["corroborated"]} == {("gateway", "identity", "host")}
    assert not (w["omissions"] or w["conflicts"] or w["unresolved"] or w["rejected"])


def test_cli_agrees_with_backend_on_omission_conflict_and_forgery(client):
    svc = client.app.state.svc
    client.post("/api/attacks/silent_login")  # both witnesses, no host record: omission
    GatewayWitness(svc).observe_session(HOST, "mallory", "198.51.100.66", utc_now_iso())  # gateway alone: conflict
    rogue = Account.create()
    claim = json.dumps({"obs_id": "forged-1", "witness": rogue.address, "role": "gateway", "kind": "ssh_session",
                        "host": HOST, "user": "deploy", "src_ip": "203.0.113.45", "observed_at": utc_now_iso()})
    with svc.stores.witness() as s:  # an unregistered key: rejected
        s.add(WitnessObservation(obs_id="forged-1", witness_id=rogue.address, claim_json=claim, recorded_at="x",
                                 signature=bytes(rogue.sign_message(encode_defunct(text=claim)).signature).hex()))

    backend = client.post("/api/verify").json()
    cli = _cli(client, client.get("/api/export").json())
    w = cli["witness"]
    assert backend["verdict"] == cli["verdict"] == "OBSERVED_OMISSION"
    assert cli["records_verdict"] == "VERIFIED"  # the records themselves are all proven on-chain
    assert [o["obs_id"] for o in w["omissions"]] == [o["observation"]["obs_id"] for o in backend["witness"]["omissions"]]
    assert [c["obs_id"] for c in w["conflicts"]] == [c["observation"]["obs_id"] for c in backend["witness"]["conflicts"]]
    assert {r["obs_id"] for r in w["rejected"]} == {r["obs_id"] for r in backend["witness"]["rejected"]} == {"forged-1"}
    assert w["omissions"][0]["sources"] == ["gateway", "identity"] and w["conflicts"][0]["sources"] == ["gateway"]


def test_incomplete_evidence_never_accuses_the_host(client):
    client.post("/api/attacks/silent_login")
    bundle = client.get("/api/export").json()
    del bundle["events"][0]  # a record the auditor can no longer check
    cli = _cli(client, bundle)
    assert cli["verdict"] == "TAMPERING_DETECTED"  # the missing record, not an omission
    w = cli["witness"]
    assert w["complete_evidence"] is False and w["omissions"] == []
    assert any(u["session"]["user"] == "deploy" for u in w["unresolved"])


def test_pinned_witnesses_defeat_a_swapped_registry(client):
    # Whoever exports the bundle replaces the registry with two keys of their own and signs a fake session with both.
    bundle = client.get("/api/export").json()
    keys = {"gateway": Account.create(), "identity": Account.create()}
    bundle["witness"]["registry"] = [{"witness_id": a.address, "role": r} for r, a in keys.items()]
    for role, acct in keys.items():
        claim = json.dumps({"obs_id": f"fake-{role}", "witness": acct.address, "role": role,
                            "kind": leash_verify.WITNESS_KINDS[role], "host": HOST, "user": "alice",
                            "src_ip": "10.9.9.9", "observed_at": utc_now_iso()})
        bundle["witness"]["observations"].append({"witness_id": acct.address, "claim_json": claim,
                                                  "signature": bytes(acct.sign_message(encode_defunct(text=claim)).signature).hex()})
    trusting = _cli(client, bundle, pinned=False)
    assert trusting["verdict"] == "OBSERVED_OMISSION"
    assert any("out of band" in x for x in trusting["warnings"])
    pinned = _cli(client, bundle)  # identities from /api/witness, i.e. obtained independently of the bundle
    assert pinned["verdict"] == "INCONCLUSIVE" and pinned["witness"]["omissions"] == []
    assert {"fake-gateway", "fake-identity"} <= {r["obs_id"] for r in pinned["witness"]["rejected"]}


def test_cli_entry_point_takes_pinned_witnesses(client, tmp_path):
    client.post("/api/attacks/silent_login")
    path = tmp_path / "bundle.json"
    path.write_text(json.dumps(client.get("/api/export").json()), encoding="utf-8")
    args = [str(path), "--rpc", client.app.state.svc.settings.rpc_url]
    for w in client.get("/api/witness").json()["witnesses"]:
        args += ["--witness", f"{w['role']}={w['witness_id']}"]
    assert leash_verify.main(args) == 2  # an observed omission is not "verified"
    with pytest.raises(SystemExit):
        leash_verify.main([str(path), "--witness", "nobody=0x1"])
