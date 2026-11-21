"""GHOST PROTOCOL witnesses: signed gateway and identity observations and the 2-of-3 evidence-of-silence rule."""

from __future__ import annotations

import json

import pytest
from eth_account import Account
from eth_account.messages import encode_defunct
from fastapi.testclient import TestClient

from app.canonical import canonical_json
from app.generator import ATTACKER_IP, HOST
from app.heartbeat import HostAgentHeartbeats, receive_heartbeat
from app.main import create_app
from app.records import RawEvent, utc_now_iso
from app.storage import WitnessObservation
from app.witness import GatewayWitness, verify_claim


def _signed_row(account, obs_id: str, role: str, kind: str) -> WitnessObservation:
    claim = {"schema": "leash-witness/v1", "obs_id": obs_id, "witness": account.address, "role": role, "kind": kind,
             "host": HOST, "user": "mallory", "src_ip": "198.51.100.66", "observed_at": utc_now_iso()}
    cj = canonical_json(claim)
    sig = bytes(account.sign_message(encode_defunct(text=cj)).signature).hex()
    return WitnessObservation(obs_id=obs_id, witness_id=account.address, claim_json=cj, signature=sig,
                              recorded_at=utc_now_iso())


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
    assert s["omissions"] == 0 and s["witness_rejected"] == 0 and s["conflicts"] == 0
    # Every real session is seen by both witnesses and reported by the host: 3 of 3.
    assert {tuple(c["sources"]) for c in report["witness"]["corroborated"]} == {("gateway", "identity", "host")}


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
    # 2 of 3: both witnesses signed it, each with its own key; only the host is missing.
    assert finding["sources"] == ["gateway", "identity"]
    second = finding["corroborated_by"][0]
    assert second["observation"]["role"] == "identity" and second["observation"]["witness"] != finding["observation"]["witness"]
    assert verify_claim(canonical_json(second["observation"]), second["signature"], second["observation"]["witness"])
    assert report["witness"]["policy"]["version"] == 2 and report["witness"]["trust_assumptions"]


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


def test_one_compromised_witness_cannot_frame_the_host(client):
    # The attacker holds the gateway's key and signs a session that never happened, twice.
    gateway = GatewayWitness(client.app.state.svc)  # same key file, so the same registered signer
    for _ in range(2):
        gateway.observe_session(HOST, "mallory", "198.51.100.66", utc_now_iso())
    report = client.post("/api/verify").json()
    assert report["verdict"] == "CONFLICTING_ATTESTATIONS"
    assert report["summary"]["omissions"] == 0
    assert report["summary"]["conflicts"] == 2  # one vote per witness per session: signing twice adds no weight
    for c in report["witness"]["conflicts"]:
        assert c["sources"] == ["gateway"] and c["missing"] == ["identity", "host"]


def test_a_witness_votes_only_in_its_registered_role(client):
    svc = client.app.state.svc
    client.post("/api/attacks/silent_login")  # one genuine omission, signed by both witnesses
    agent = HostAgentHeartbeats(svc.settings, HOST)
    receive_heartbeat(svc, *agent.beat(utc_now_iso()))  # the host agent's key is registered, as a host agent
    with svc.stores.witness() as s:
        # The gateway's key posing as the identity witness, and the host agent's key posing as the gateway.
        s.add(_signed_row(GatewayWitness(svc)._account, "as-identity", "identity", "ssh_auth"))
        s.add(_signed_row(agent._account, "as-gateway", "gateway", "ssh_session"))
    report = client.post("/api/verify").json()
    reasons = {r["obs_id"]: r["reason"] for r in report["witness"]["rejected"]}
    assert reasons["as-identity"].endswith("registered as gateway")
    assert reasons["as-gateway"] == "unregistered witness or invalid signature"
    assert report["summary"]["omissions"] == 1 and report["summary"]["conflicts"] == 0
    assert report["verdict"] == "OBSERVED_OMISSION"


def test_host_and_one_witness_are_enough(client):
    # The identity plane missed a session that the host reported and the gateway saw: 2 of 3, no dispute.
    svc = client.app.state.svc
    at = utc_now_iso()
    svc.emit_from_host([RawEvent(ts=at, host=HOST, source="sshd", type="login_success", severity="info",
                                 actor="alice", msg="Accepted publickey for alice", attrs={"src_ip": "10.0.4.20"})])
    obs = GatewayWitness(svc).observe_session(HOST, "alice", "10.0.4.20", at)
    report = client.post("/api/verify").json()
    assert report["verdict"] == "CLEAN"
    hit = next(c for c in report["witness"]["corroborated"] if c["obs_id"] == obs["claim"]["obs_id"])
    assert hit["sources"] == ["gateway", "host"]


def test_witness_store_is_append_only(client):
    svc = client.app.state.svc
    client.post("/api/attacks/silent_login")
    with pytest.raises(Exception, match="append-only"):
        with svc.stores.witness() as s:
            row = s.query(WitnessObservation).first()
            row.claim_json = json.dumps({"tampered": True})
