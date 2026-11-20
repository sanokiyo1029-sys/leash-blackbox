"""GHOST PROTOCOL: signed host heartbeats and the reporting-gap rule (collector clock only)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from eth_account import Account
from eth_account.messages import encode_defunct
from fastapi.testclient import TestClient

from app.canonical import canonical_json
from app.heartbeat import HostAgentHeartbeats, check_heartbeats, receive_heartbeat
from app.main import create_app
from app.verify import run_verification

T0 = datetime(2026, 1, 1, 3, 0, 0, tzinfo=timezone.utc)  # in the past, so the real-clock check sees it long silent
HOST = "web-prod-01"


def iso(seconds: float) -> str:
    return (T0 + timedelta(seconds=seconds)).isoformat().replace("+00:00", "Z")


def send(svc, agent, at: float, sent_at: str | None = None) -> None:
    """The agent beats; the collector receives it at `at` seconds on ITS clock."""
    claim_json, signature = agent.beat(sent_at or iso(at))
    receive_heartbeat(svc, claim_json, signature, iso(at))


def gaps(svc, now: float):
    return check_heartbeats(svc, now=iso(now))["gaps"]


def test_on_time_heartbeats_have_no_gap(svc):
    agent = HostAgentHeartbeats(svc.settings, HOST)  # interval 15 s + grace 10 s
    for at in (0, 15, 30, 45):
        send(svc, agent, at)
    assert gaps(svc, now=50) == []


def test_silent_agent_is_a_gap_not_an_intrusion(svc):
    agent = HostAgentHeartbeats(svc.settings, HOST)
    send(svc, agent, 0)
    send(svc, agent, 15)
    found = gaps(svc, now=15 + 26)
    assert [g["kind"] for g in found] == ["silent"] and found[0]["to"] is None
    report = run_verification(svc, persist=False)  # verify now uses the real clock: long silent by then
    assert report["verdict"] == "REPORTING_GAP"
    assert report["summary"]["reporting_gaps"] == 1 and report["summary"]["deleted"] == 0


def test_late_heartbeat_is_a_closed_gap(svc):
    agent = HostAgentHeartbeats(svc.settings, HOST)
    send(svc, agent, 0)
    send(svc, agent, 40)  # 40 s after the previous one: over the 25 s allowance
    found = gaps(svc, now=45)
    assert [(g["kind"], g["seconds"]) for g in found] == [("late", 40.0)]


def test_host_clock_skew_is_ignored(svc):
    agent = HostAgentHeartbeats(svc.settings, HOST)
    for at in (0, 15, 30):
        send(svc, agent, at, sent_at="1999-01-01T00:00:00Z")  # the host's clock is wildly wrong
    assert gaps(svc, now=35) == []


def test_benign_restart_starts_a_new_chain(svc):
    agent = HostAgentHeartbeats(svc.settings, HOST)
    send(svc, agent, 0)
    send(svc, agent, 15)
    agent.restart()  # new boot: seq starts again at 1 with a fresh chain
    send(svc, agent, 22)
    send(svc, agent, 37)
    result = check_heartbeats(svc, now=iso(40))
    assert result["gaps"] == [] and len(result["restarts"]) == 1


def test_dropped_heartbeat_is_a_sequence_gap(svc):
    agent = HostAgentHeartbeats(svc.settings, HOST)
    send(svc, agent, 0)
    agent.beat(iso(15))  # signed but never delivered
    send(svc, agent, 20)
    assert [g["kind"] for g in gaps(svc, now=25)] == ["sequence"]


def test_forged_heartbeat_is_rejected(svc):
    agent = HostAgentHeartbeats(svc.settings, HOST)
    send(svc, agent, 0)  # the agent's key is registered for the host on first use
    rogue = Account.create()
    claim = {"schema": "leash-heartbeat/v1", "host": HOST, "signer": rogue.address, "boot_id": "x", "seq": 1,
             "prev": "00" * 32, "sent_at": iso(10)}
    cj = canonical_json(claim)
    receive_heartbeat(svc, cj, bytes(rogue.sign_message(encode_defunct(text=cj)).signature).hex(), iso(10))
    result = check_heartbeats(svc, now=iso(12))
    assert len(result["rejected"]) == 1 and result["gaps"] == []


def test_stop_agent_via_api_reports_a_gap(settings):
    from dataclasses import replace

    app = create_app(replace(settings, heartbeat_interval_s=0.2, heartbeat_grace_s=0.3))
    with TestClient(app) as c:
        assert c.post("/api/demo/reset").status_code == 200
        c.post("/api/simulate/traffic", json={"count": 10, "seed": 3})
        import time

        time.sleep(1.0)  # several heartbeats arrive
        assert c.post("/api/verify").json()["verdict"] == "CLEAN"
        assert c.post("/api/attacks/stop_agent").json()["affected"] == 0
        time.sleep(1.0)  # past interval + grace with no heartbeat
        report = c.post("/api/verify").json()
        assert report["verdict"] == "REPORTING_GAP"
        assert report["heartbeat"]["gaps"][-1]["kind"] == "silent"
    app.state.svc.stores.dispose()
