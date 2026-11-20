"""HTTP API flows and the independent auditor verifier."""

from __future__ import annotations

import json
import subprocess
import sys

import leash_verify
import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from conftest import REPO


@pytest.fixture()
def client(settings):
    app = create_app(settings)
    with TestClient(app) as c:
        assert c.post("/api/demo/reset").status_code == 200
        yield c
    app.state.svc.stores.dispose()


def _seed(client, count=40, intrusion=True):
    r = client.post("/api/simulate/traffic", json={"count": count, "include_intrusion": intrusion, "seed": 4})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["anchor_error"] is None
    return body


def test_health_and_status(client):
    assert client.get("/api/health").json()["status"] == "ok"
    _seed(client)
    status = client.get("/api/status").json()
    assert status["chain"]["connected"] is True
    assert status["counts"]["unanchored_events"] == 0
    assert status["chain"]["onchain_batch_count"] == 1


def test_full_demo_flow_over_http(client):
    _seed(client)
    assert client.post("/api/verify").json()["verdict"] == "CLEAN"
    attack = client.post("/api/attacks/cover_tracks").json()
    assert attack["affected"] > 0
    report = client.post("/api/verify").json()
    assert report["verdict"] == "TAMPERING_DETECTED"
    assert report["summary"]["deleted"] == attack["affected"]
    score = client.get("/api/verify/score").json()
    assert score["false_positive"] == 0 and score["false_negative"] == 0
    deleted = client.get("/api/events", params={"status": "DELETED"}).json()
    assert deleted["total"] == attack["affected"]
    detail = client.get(f"/api/events/{attack['seqs'][0]}").json()
    assert detail["records"][0]["status"] == "DELETED" and detail["proof"]["proof"] is not None
    runs = client.get("/api/verify/runs").json()["runs"]
    assert [r["verdict"] for r in runs[:2]] == ["TAMPERING_DETECTED", "CLEAN"]


def test_lab_endpoints_refused_outside_demo_mode(settings):
    from dataclasses import replace

    app = create_app(replace(settings, demo_mode=False))
    with TestClient(app) as c:
        assert c.get("/api/status").json()["demo_mode"] is False
        for path in ("/api/demo/reset", "/api/simulate/traffic", "/api/attacks/cover_tracks"):
            r = c.post(path, json={})
            assert r.status_code == 403, path
            assert "LEASH_DEMO_MODE" in r.json()["detail"]
        assert c.post("/api/verify").status_code == 200  # verification stays available
    app.state.svc.stores.dispose()


def test_unknown_attack_scenario_is_rejected(client):
    assert client.post("/api/attacks/format_c").status_code == 400


def test_ingest_validates_input(client):
    bad = {"events": [{"ts": "x", "host": "h", "source": "s", "type": "t", "severity": "apocalyptic", "msg": "m"}]}
    assert client.post("/api/events/ingest", json=bad).status_code == 422


def test_vault_bundle_verifies_independently(client):
    _seed(client)
    bundle = client.get("/api/export", params={"source": "vault"}).json()
    report = leash_verify.verify(bundle, client.app.state.svc.settings.rpc_url,
                                 bundle["anchor"]["contract_address"])
    assert report["verdict"] == "VERIFIED"
    assert report["summary"]["verified"] == report["summary"]["events_checked"] > 0


def test_host_bundle_after_attack_fails_independent_verification(client):
    _seed(client)
    client.post("/api/attacks/cover_tracks")
    client.post("/api/attacks/fabricate_alibi")
    bundle = client.get("/api/export", params={"source": "host"}).json()
    report = leash_verify.verify(bundle, client.app.state.svc.settings.rpc_url)
    assert report["verdict"] == "TAMPERING_DETECTED"
    assert report["summary"]["missing"] > 0
    assert report["summary"]["uncommitted"] == 3


def test_auditor_ignores_forged_claims_in_bundle(client):
    _seed(client, intrusion=False)
    bundle = client.get("/api/export").json()
    # Attacker edits a record AND rewrites the claimed root to match: chain still disagrees.
    bundle["events"][0]["record"]["msg"] = "forged"
    bundle["batches"][0]["merkle_root"] = "00" * 32
    report = client.post("/api/auditor/verify", json={"bundle": bundle}).json()
    assert report["verdict"] == "TAMPERING_DETECTED"
    assert report["events"][0]["status"] == "TAMPERED"
    assert any("differs from chain" in i for i in report["batches"][0]["issues"])


def test_selective_disclosure_bundle(client):
    _seed(client)
    bundle = client.get("/api/export", params={"seqs": "3,5,8"}).json()
    assert bundle["scope"] == "selective" and len(bundle["events"]) == 3
    report = leash_verify.verify(bundle, client.app.state.svc.settings.rpc_url)
    assert report["verdict"] == "VERIFIED" and report["summary"]["missing"] == 0


def test_verifier_cli_exit_codes(client, tmp_path):
    _seed(client, intrusion=False)
    rpc = client.app.state.svc.settings.rpc_url
    good = tmp_path / "good.json"
    good.write_text(json.dumps(client.get("/api/export").json()), encoding="utf-8")
    client.post("/api/attacks/truncate_tail", json={"params": {"count": 3}})
    bad = tmp_path / "bad.json"
    bad.write_text(json.dumps(client.get("/api/export", params={"source": "host"}).json()), encoding="utf-8")
    cli = REPO / "verifier" / "leash_verify.py"
    ok = subprocess.run([sys.executable, "-I", str(cli), str(good), "--rpc", rpc], capture_output=True, text=True)
    assert ok.returncode == 0, ok.stdout + ok.stderr
    assert "VERDICT: VERIFIED" in ok.stdout
    fail = subprocess.run([sys.executable, "-I", str(cli), str(bad), "--rpc", rpc], capture_output=True, text=True)
    assert fail.returncode == 2
    assert "MISSING" in fail.stdout
