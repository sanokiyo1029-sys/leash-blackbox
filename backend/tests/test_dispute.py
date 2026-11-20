"""GHOST PROTOCOL: dispute packages, committed on-chain by digest and re-derived by anyone holding the package."""

from __future__ import annotations

import hashlib
import time
from dataclasses import replace

import pytest
from fastapi.testclient import TestClient

from app.canonical import canonical_json
from app.generator import ATTACKER_IP
from app.main import create_app
from app.storage import Dispute


@pytest.fixture()
def client(settings):
    app = create_app(settings)
    with TestClient(app) as c:
        assert c.post("/api/demo/reset").status_code == 200
        assert c.post("/api/simulate/traffic", json={"count": 30, "seed": 5}).json()["anchor_error"] is None
        yield c
    app.state.svc.stores.dispose()


def test_omission_dispute_is_committed_and_rederivable(client):
    client.post("/api/attacks/silent_login")
    assert client.post("/api/verify").json()["verdict"] == "OBSERVED_OMISSION"
    body = client.post("/api/disputes").json()

    assert body["dispute_id"] == 0 and body["matches"] is True and body["gas_used"] > 0
    # An auditor needs only the package and the chain: recompute the digest independently.
    recomputed = hashlib.sha256(canonical_json(body["package"]).encode()).hexdigest()
    assert recomputed == body["digest"] == body["onchain"]["digest"]
    assert body["onchain"]["anchored_batches"] >= 1  # tied to the anchored evidence state
    receipt = client.app.state.svc.anchor.get_receipt(body["tx_hash"])
    assert int(receipt["status"]) == 1 and int(receipt["blockNumber"]) == body["block_number"]
    omission = body["package"]["omissions"][0]["observation"]
    assert omission["src_ip"] == ATTACKER_IP and body["package"]["witness_policy"]["version"] == 1

    assert client.get("/api/disputes/0").json()["matches"] is True
    assert [d["dispute_id"] for d in client.get("/api/disputes").json()["disputes"]] == [0]
    # Any edit to the package breaks the match with the chain.
    edited = dict(body["package"], verification={**body["package"]["verification"], "verdict": "CLEAN"})
    assert hashlib.sha256(canonical_json(edited).encode()).hexdigest() != body["onchain"]["digest"]


def test_nothing_to_dispute_on_a_clean_run(client):
    assert client.post("/api/verify").json()["verdict"] == "CLEAN"
    r = client.post("/api/disputes")
    assert r.status_code == 409 and "no observed omission" in r.json()["detail"]
    assert client.get("/api/disputes/0").status_code == 404


def test_dispute_store_is_append_only(client):
    client.post("/api/attacks/silent_login")
    client.post("/api/verify")
    client.post("/api/disputes")
    with pytest.raises(Exception, match="append-only"):
        with client.app.state.svc.stores.vault() as s:
            s.get(Dispute, 0).package_json = "{}"


def test_reporting_gap_dispute(settings):
    app = create_app(replace(settings, heartbeat_interval_s=0.2, heartbeat_grace_s=0.3))
    with TestClient(app) as c:
        assert c.post("/api/demo/reset").status_code == 200
        c.post("/api/simulate/traffic", json={"count": 10, "seed": 3})
        time.sleep(1.0)
        c.post("/api/attacks/stop_agent")
        time.sleep(1.0)
        assert c.post("/api/verify").json()["verdict"] == "REPORTING_GAP"
        body = c.post("/api/disputes").json()
        assert body["matches"] is True and body["package"]["omissions"] == []
        gap = body["package"]["gaps"][-1]
        assert gap["kind"] == "silent" and isinstance(gap["milliseconds"], int)
        assert body["package"]["heartbeat_policy"]["interval_ms"] == 200
    app.state.svc.stores.dispose()
