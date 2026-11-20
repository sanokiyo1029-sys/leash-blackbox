"""GHOST PROTOCOL, first witness: signed gateway observations and the evidence-of-silence rule."""

from __future__ import annotations

import json

import pytest
from eth_account import Account
from eth_account.messages import encode_defunct
from fastapi.testclient import TestClient

from app.canonical import canonical_json
from app.generator import ATTACKER_IP, HOST
from app.main import create_app
from app.storage import WitnessObservation
from app.witness import verify_claim


@pytest.fixture()
def client(settings):
    app = create_app(settings)
    with TestClient(app) as c:
        assert c.post("/api/demo/reset").status_code == 200
        r = c.post("/api/simulate/traffic", json={"count": 60, "include_intrusion": True, "seed": 7})
        assert r.status_code == 200 and r.json()["anchor_error"] is None, r.text
        yield c
    app.state.svc.stores.dispose()


def test_normal_sessions_are_corroborated(client):
    report = client.post("/api/verify").json()
    s = report["summary"]
    assert report["verdict"] == "CLEAN"
    assert s["witness_observations"] > 0  # seed 7 includes SSH logins, and the intrusion's deploy login
    assert s["witness_corroborated"] == s["witness_observations"]
    assert s["omissions"] == 0 and s["witness_rejected"] == 0


def test_silent_login_is_an_observed_omission(client):
    before = client.get("/api/status").json()["counts"]
    attack = client.post("/api/attacks/silent_login").json()
    assert attack["affected"] == 0  # the logger is dead: nothing written anywhere on the host
    assert client.get("/api/status").json()["counts"] == before

    report = client.post("/api/verify").json()
    assert report["verdict"] == "OBSERVED_OMISSION"
    assert report["summary"]["omissions"] == 1
    finding = report["witness"]["omissions"][0]
    assert finding["observation"]["user"] == "deploy" and finding["observation"]["src_ip"] == ATTACKER_IP
    assert finding["observation"]["host"] == HOST
    assert finding["signature_valid"] is True
    assert verify_claim(canonical_json(finding["observation"]), finding["signature"], finding["observation"]["witness"])
    assert report["witness"]["policy"]["version"] == 1 and report["witness"]["trust_assumptions"]


def test_erased_login_is_tampering_not_omission(client):
    client.post("/api/attacks/cover_tracks")
    report = client.post("/api/verify").json()
    assert report["verdict"] == "TAMPERING_DETECTED"
    assert report["summary"]["omissions"] == 0  # the host DID report it; the vault kept it, so this is deletion


def test_forged_and_altered_observations_are_rejected(client):
    svc = client.app.state.svc
    # A claim signed by a key the verifier never registered.
    rogue = Account.create()
    claim = {"schema": "leash-witness/v1", "obs_id": "forged-1", "witness": rogue.address, "role": "gateway",
             "kind": "ssh_session", "host": HOST, "user": "deploy", "src_ip": ATTACKER_IP,
             "observed_at": "2026-11-21T00:00:00.000Z"}
    cj = canonical_json(claim)
    sig = bytes(rogue.sign_message(encode_defunct(text=cj)).signature).hex()
    # A genuine observation whose claim is edited after signing.
    genuine = client.post("/api/attacks/silent_login").json()["witness"]
    edited = dict(genuine["claim"], obs_id="edited-1", user="alice")
    with svc.stores.witness() as s:
        s.add(WitnessObservation(obs_id="forged-1", witness_id=rogue.address, claim_json=cj, signature=sig,
                                 recorded_at="2026-11-21T00:00:00Z"))
        s.add(WitnessObservation(obs_id="edited-1", witness_id=edited["witness"], claim_json=canonical_json(edited),
                                 signature=genuine["signature"], recorded_at="2026-11-21T00:00:00Z"))
    report = client.post("/api/verify").json()
    assert {r["obs_id"] for r in report["witness"]["rejected"]} == {"forged-1", "edited-1"}
    assert report["summary"]["omissions"] == 1  # only the genuine silent login counts
    assert report["verdict"] == "OBSERVED_OMISSION"


def test_witness_store_is_append_only(client):
    svc = client.app.state.svc
    client.post("/api/attacks/silent_login")
    with pytest.raises(Exception, match="append-only"):
        with svc.stores.witness() as s:
            row = s.query(WitnessObservation).first()
            row.claim_json = json.dumps({"tampered": True})
