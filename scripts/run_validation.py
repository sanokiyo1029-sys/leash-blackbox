"""Reproducible validation experiments for LEASH BLACKBOX.

Runs against a real local EVM node (Hardhat) and the real backend pipeline,
then writes docs/validation/results.json and docs/validation/RESULTS.md.

    backend/.venv/Scripts/python scripts/run_validation.py [--trials 30] [--rpc URL]

Without --rpc a private Hardhat node is started on a free port and stopped at
the end. Every number in the output comes from this run; nothing is estimated.
"""

from __future__ import annotations

import argparse
import json
import os
import platform
import random
import shutil
import socket
import statistics
import subprocess
import sys
import tempfile
import time
import urllib.request
from dataclasses import replace
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "backend"))
sys.path.insert(0, str(REPO / "verifier"))

import leash_verify  # noqa: E402
from app.attack import SCENARIOS, AttackLab  # noqa: E402
from app.canonical import canonical_bytes  # noqa: E402
from app.config import Settings  # noqa: E402
from app.export import build_bundle  # noqa: E402
from app.generator import generate_traffic  # noqa: E402
from app.merkle import leaf_hash, merkle_root  # noqa: E402
from app.records import build_record  # noqa: E402
from app.service import LeashService  # noqa: E402
from app.verify import run_verification  # noqa: E402

EXPECTED = {"modify": "MODIFIED", "delete": "DELETED", "inject": "INJECTED"}


# ----------------------------------------------------------------- node mgmt
def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _ready(url: str) -> bool:
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "eth_chainId", "params": []}).encode()
    try:
        req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=2) as r:
            return "result" in json.loads(r.read())
    except Exception:  # noqa: BLE001
        return False


def start_node() -> tuple[subprocess.Popen, str]:
    cli = REPO / "blockchain" / "node_modules" / "hardhat" / "internal" / "cli" / "cli.js"
    node = shutil.which("node")
    if not cli.exists() or node is None:
        sys.exit("Hardhat not installed: run `npm install` in blockchain/")
    port = _free_port()
    url = f"http://127.0.0.1:{port}"
    flags = subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0
    proc = subprocess.Popen([node, str(cli), "node", "--hostname", "127.0.0.1", "--port", str(port)],
                            cwd=REPO / "blockchain", stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                            creationflags=flags)
    deadline = time.time() + 90
    while time.time() < deadline and not _ready(url):
        time.sleep(0.5)
    if not _ready(url):
        proc.kill()
        sys.exit("Hardhat node did not start")
    return proc, url


def stop_node(proc: subprocess.Popen) -> None:
    if os.name == "nt":
        subprocess.run(["taskkill", "/PID", str(proc.pid), "/T", "/F"], capture_output=True)
    else:
        proc.terminate()


# ------------------------------------------------------------- experiments
def score(report: dict, truth: dict[int, str]) -> dict[str, int]:
    detected = {f["seq"]: f["status"] for f in report["findings"]}
    tp = sum(1 for seq, a in truth.items() if detected.get(seq) == EXPECTED[a])
    return {"truth": len(truth), "tp": tp, "fn": len(truth) - tp,
            "fp": sum(1 for seq in detected if seq not in truth),
            "misclassified": sum(1 for seq, a in truth.items() if seq in detected and detected[seq] != EXPECTED[a])}


def fresh(base: Settings, tag: str, **overrides) -> LeashService:
    svc = LeashService(replace(base, data_dir=base.data_dir / tag, **overrides))
    svc.reset()
    return svc


def exp_detection(base: Settings, trials: int, rng: random.Random) -> dict:
    """Randomized tampering vs. ground truth, plus clean-run false alarms and independent CLI agreement."""
    rows = []
    for t in range(trials):
        svc = fresh(base, f"det{t}")
        count = rng.randint(80, 400)
        svc.emit_from_host(generate_traffic(count, seed=10_000 + t, include_intrusion=rng.random() < 0.7))
        batches = svc.seal_and_anchor()
        clean = run_verification(svc, persist=False)
        lab = AttackLab(svc.stores.host, svc.stores.lab)
        params = {"modify": rng.randint(0, 12), "delete_count": rng.randint(0, 12), "inject": rng.randint(0, 5),
                  "seed": 20_000 + t}
        lab.run("random_tamper", **params)
        started = time.perf_counter()
        report = run_verification(svc, persist=False)
        verify_ms = (time.perf_counter() - started) * 1000
        s = score(report, lab.ground_truth())
        # Independent auditor on the host's (tampered) logs and on the vault evidence
        host_cli = leash_verify.verify(build_bundle(svc, "host"), svc.settings.rpc_url,
                                       svc.active_deployment().contract_address)
        vault_cli = leash_verify.verify(build_bundle(svc, "vault"), svc.settings.rpc_url,
                                        svc.active_deployment().contract_address)
        tampered_anchored = params["modify"] + params["delete_count"] > 0
        rows.append({
            "trial": t, "events": svc.counts()["vault_events"], "batches": len(batches), **params, **s,
            "clean_findings": len(clean["findings"]), "clean_verdict": clean["verdict"],
            "verdict": report["verdict"], "verify_ms": round(verify_ms, 2),
            "cli_host_verdict": host_cli["verdict"], "cli_vault_verdict": vault_cli["verdict"],
            "cli_host_flags": host_cli["summary"]["tampered"] + host_cli["summary"]["missing"],
            "cli_expected_flags": params["modify"] + params["delete_count"],
            "cli_agrees": (host_cli["verdict"] == "TAMPERING_DETECTED") == tampered_anchored
            and vault_cli["verdict"] == "VERIFIED",
        })
        svc.stores.dispose()
    tp = sum(r["tp"] for r in rows)
    fn = sum(r["fn"] for r in rows)
    fp = sum(r["fp"] for r in rows)
    return {
        "trials": rows,
        "summary": {
            "trials": len(rows),
            "events_total": sum(r["events"] for r in rows),
            "tampered_records_total": sum(r["truth"] for r in rows),
            "true_positives": tp, "false_negatives": fn, "false_positives": fp,
            "misclassified": sum(r["misclassified"] for r in rows),
            "recall": tp / (tp + fn) if tp + fn else None,
            "precision": tp / (tp + fp) if tp + fp else None,
            "clean_runs_with_findings": sum(1 for r in rows if r["clean_findings"]),
            "clean_runs_verdict_clean": sum(1 for r in rows if r["clean_verdict"] == "CLEAN"),
            "cli_agreement": sum(1 for r in rows if r["cli_agrees"]),
            "cli_flag_count_matches": sum(1 for r in rows if r["cli_host_flags"] == r["cli_expected_flags"]),
        },
    }


def exp_scenarios(base: Settings) -> list[dict]:
    """Each named attack scenario on a fresh host with the intrusion story."""
    out = []
    for name in SCENARIOS:
        svc = fresh(base, f"sc_{name}")
        svc.emit_from_host(generate_traffic(200, seed=7, include_intrusion=True))
        svc.seal_and_anchor()
        lab = AttackLab(svc.stores.host, svc.stores.lab)
        result = lab.run(name, **({"seed": 1} if name == "random_tamper" else {}))
        report = run_verification(svc, persist=False)
        s = score(report, lab.ground_truth())
        out.append({"scenario": name, "affected": result["affected"], "verdict": report["verdict"], **s})
        svc.stores.dispose()
    return out


def exp_scale(base: Settings) -> list[dict]:
    """Verification time and anchoring cost as the log grows (batch size 256)."""
    out = []
    for n in (100, 500, 1000, 2500, 5000):
        svc = fresh(base, f"scale{n}")
        t0 = time.perf_counter()
        svc.emit_from_host(generate_traffic(n, seed=n))
        ingest_s = time.perf_counter() - t0
        batches = svc.seal_and_anchor()
        t1 = time.perf_counter()
        report = run_verification(svc, persist=False)
        verify_ms = (time.perf_counter() - t1) * 1000
        assert report["verdict"] == "CLEAN", report["verdict"]
        out.append({
            "events": n, "batches": len(batches), "ingest_events_per_s": round(n / ingest_s),
            "verify_ms": round(verify_ms, 1), "total_gas": sum(b["gas_used"] for b in batches),
            "gas_per_event": round(sum(b["gas_used"] for b in batches) / n, 1),
            "mean_anchor_latency_ms": round(statistics.mean(b["anchor_latency_ms"] for b in batches), 1),
        })
        svc.stores.dispose()
    return out


def exp_batch_gas(base: Settings) -> list[dict]:
    """On-chain cost per batch is constant: one 32-byte root regardless of batch size."""
    out = []
    for size in (1, 16, 64, 256, 1024):
        svc = fresh(base, f"gas{size}", max_batch_size=size)
        svc.emit_from_host(generate_traffic(size * 3, seed=size))
        batches = svc.seal_and_anchor()
        gas = [b["gas_used"] for b in batches]
        out.append({"batch_size": size, "batches": len(batches), "first_batch_gas": gas[0],
                    "later_batch_gas_mean": round(statistics.mean(gas[1:]), 1),
                    "gas_per_event_steady": round(statistics.mean(gas[1:]) / size, 2)})
        svc.stores.dispose()
    return out


def exp_hashing(rng: random.Random) -> dict:
    raws = generate_traffic(20_000, seed=99)
    t0 = time.perf_counter()
    leaves = [leaf_hash(canonical_bytes(build_record(i + 1, f"id-{i}", r))) for i, r in enumerate(raws)]
    t1 = time.perf_counter()
    root = merkle_root(leaves)
    t2 = time.perf_counter()
    return {"records": len(leaves), "canonicalize_and_hash_per_s": round(len(leaves) / (t1 - t0)),
            "merkle_root_ms_20k": round((t2 - t1) * 1000, 1), "root": root.hex()}


# ------------------------------------------------------------------ report
def pct(x: float | None) -> str:
    return "n/a" if x is None else f"{x * 100:.2f}%"


def write_markdown(res: dict, path: Path) -> None:
    d = res["detection"]["summary"]
    lines = [
        "# Validation results",
        "",
        f"Generated by `scripts/run_validation.py` on {res['meta']['generated_at']} "
        f"(seed {res['meta']['seed']}, {res['meta']['platform']}, Python {res['meta']['python']}, "
        f"local Hardhat EVM node, chain id {res['meta']['chain_id']}). All numbers are measured, not estimated.",
        "",
        "## 1. Detection accuracy (randomized tampering vs. ground truth)",
        "",
        f"- Trials: **{d['trials']}**. Events anchored: **{d['events_total']}**. Tampered host records: **{d['tampered_records_total']}**",
        f"- Recall **{pct(d['recall'])}** ({d['true_positives']} TP / {d['false_negatives']} FN). "
        f"Precision **{pct(d['precision'])}** ({d['false_positives']} FP). Misclassified type: {d['misclassified']}",
        f"- Clean runs before any attack: {d['clean_runs_verdict_clean']}/{d['trials']} verdict CLEAN; "
        f"{d['clean_runs_with_findings']} run(s) with any finding (false alarms)",
        f"- Independent auditor CLI agreed with ground truth in {d['cli_agreement']}/{d['trials']} trials "
        f"(host bundle flagged iff anchored records were modified/deleted; vault bundle VERIFIED). "
        f"Its tampered+missing count equalled modified+deleted in {d['cli_flag_count_matches']}/{d['trials']} trials.",
        "",
        "## 2. Attack scenarios (200 events + intrusion kill chain)",
        "",
        "| Scenario | Records affected | Verdict | TP | FN | FP |",
        "|---|---|---|---|---|---|",
    ]
    for s in res["scenarios"]:
        lines.append(f"| {s['scenario']} | {s['affected']} | {s['verdict']} | {s['tp']} | {s['fn']} | {s['fp']} |")
    lines += [
        "",
        "## 3. Scaling (batch size 256)",
        "",
        "| Events | Batches | Ingest (events/s) | Full verification (ms) | Total gas | Gas / event | Mean anchor latency (ms) |",
        "|---|---|---|---|---|---|---|",
    ]
    for s in res["scale"]:
        lines.append(f"| {s['events']} | {s['batches']} | {s['ingest_events_per_s']} | {s['verify_ms']} | "
                     f"{s['total_gas']} | {s['gas_per_event']} | {s['mean_anchor_latency_ms']} |")
    lines += [
        "",
        "## 4. On-chain cost vs. batch size",
        "",
        "| Batch size | First batch gas (cold storage) | Later batch gas (mean) | Gas per event (steady) |",
        "|---|---|---|---|",
    ]
    for g in res["batch_gas"]:
        lines.append(f"| {g['batch_size']} | {g['first_batch_gas']} | {g['later_batch_gas_mean']} | {g['gas_per_event_steady']} |")
    h = res["hashing"]
    lines += [
        "",
        "## 5. Hashing throughput (single thread)",
        "",
        f"- Canonicalize + SHA-256 leaf: **{h['canonicalize_and_hash_per_s']} records/s**",
        f"- Merkle root over {h['records']} leaves: **{h['merkle_root_ms_20k']} ms**",
        "",
        "## Caveats",
        "",
        "- Local Hardhat node with automine: anchoring latency excludes real network block times.",
        "  On a public chain, add the block interval and the confirmation depth.",
        "- Gas is measured on the local EVM. Fees depend on the target network's gas price.",
        "- Detection is measured within the stated threat model: the attacker controls the host store only.",
        "- Detection is a deterministic hash comparison, not a statistical classifier. The randomized trials",
        "  check implementation correctness across many tampering patterns; 100% here is expected, not a",
        "  probabilistic claim. Real-world limits (forging at the source, suppression before forwarding)",
        "  are listed in ARCHITECTURE_DECISIONS.md.",
        "",
    ]
    path.write_text("\n".join(lines), encoding="utf-8", newline="\n")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--trials", type=int, default=30)
    ap.add_argument("--seed", type=int, default=1337)
    ap.add_argument("--rpc", default=None)
    args = ap.parse_args()
    rng = random.Random(args.seed)
    proc = None
    rpc = args.rpc
    if rpc is None:
        proc, rpc = start_node()
    tmp = Path(tempfile.mkdtemp(prefix="leash-validation-"))
    try:
        base = Settings(data_dir=tmp, rpc_url=rpc, receipt_timeout_s=30)
        probe = fresh(base, "probe")
        chain_id = probe.anchor.chain_id()
        probe.stores.dispose()
        t0 = time.time()
        print(f"[1/5] detection trials ({args.trials})", flush=True)
        detection = exp_detection(base, args.trials, rng)
        print("[2/5] attack scenarios", flush=True)
        scenarios = exp_scenarios(base)
        print("[3/5] scaling", flush=True)
        scale = exp_scale(base)
        print("[4/5] batch gas", flush=True)
        batch_gas = exp_batch_gas(base)
        print("[5/5] hashing throughput", flush=True)
        hashing = exp_hashing(rng)
        res = {
            "meta": {"generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"), "seed": args.seed,
                     "trials": args.trials, "platform": platform.platform(), "python": platform.python_version(),
                     "chain_id": chain_id, "runtime_s": round(time.time() - t0, 1)},
            "detection": detection, "scenarios": scenarios, "scale": scale, "batch_gas": batch_gas,
            "hashing": hashing,
        }
        out = REPO / "docs" / "validation"
        out.mkdir(parents=True, exist_ok=True)
        (out / "results.json").write_text(json.dumps(res, indent=2) + "\n", encoding="utf-8", newline="\n")
        write_markdown(res, out / "RESULTS.md")
        d = detection["summary"]
        print(f"recall={pct(d['recall'])} precision={pct(d['precision'])} clean_false_alarm_runs="
              f"{d['clean_runs_with_findings']} cli_agreement={d['cli_agreement']}/{d['trials']} "
              f"runtime={res['meta']['runtime_s']}s")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
        if proc is not None:
            stop_node(proc)


if __name__ == "__main__":
    main()
