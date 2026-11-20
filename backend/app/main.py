"""FastAPI application exposing the LEASH BLACKBOX pipeline."""

from __future__ import annotations

import hmac
import json
import sys
from typing import Any

from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import select

from . import __version__
from .anchor import AnchorError
from .attack import SCENARIOS, AttackLab
from .config import REPO_ROOT, Settings, load_settings
from .export import build_bundle
from .generator import generate_traffic
from .records import RawEvent
from .service import LeashService, deployment_to_dict
from .storage import VerificationRun
from .verify import run_verification, snapshot

sys.path.insert(0, str(REPO_ROOT / "verifier"))
import leash_verify  # noqa: E402  (standalone auditor tool, reused for the portal)


class TrafficRequest(BaseModel):
    count: int = Field(default=50, ge=0, le=5000)
    include_intrusion: bool = False
    seed: int | None = None
    anchor: bool = True


class AttackRequest(BaseModel):
    params: dict[str, Any] = Field(default_factory=dict)


class IngestRequest(BaseModel):
    events: list[RawEvent] = Field(min_length=1, max_length=5000)


class AuditRequest(BaseModel):
    bundle: dict[str, Any]
    contract_address: str | None = None


def _anchor_error(exc: AnchorError) -> HTTPException:
    return HTTPException(status_code=503, detail=str(exc))


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or load_settings()
    svc = LeashService(settings)
    lab = AttackLab(svc.stores.host, svc.stores.lab)

    app = FastAPI(title="LEASH BLACKBOX", version=__version__,
                  description="The attacker can erase the logs. They cannot erase the proof.")
    app.add_middleware(CORSMiddleware, allow_origins=list(settings.cors_origins),
                       allow_methods=["*"], allow_headers=["*"])
    app.state.svc = svc
    app.state.lab = lab

    @app.get("/api/health")
    def health() -> dict[str, Any]:
        return {"status": "ok", "version": __version__}

    @app.get("/api/status")
    def status() -> dict[str, Any]:
        connected = svc.anchor.is_connected()
        dep = svc.active_deployment()
        chain: dict[str, Any] = {"rpc_url": settings.rpc_url, "connected": connected}
        if connected:
            try:
                chain.update(chain_id=svc.anchor.chain_id(), latest_block=svc.anchor.latest_block())
                if dep:
                    chain["contract_present"] = svc.anchor.has_code(dep.contract_address)
                    if chain["contract_present"]:
                        chain["onchain_batch_count"] = svc.anchor.batch_count(dep.contract_address)
            except AnchorError as exc:
                chain["error"] = str(exc)
        with svc.stores.vault() as s:
            last = s.scalar(select(VerificationRun).order_by(VerificationRun.id.desc()).limit(1))
            last_run = None if last is None else {
                "run_id": last.id, "verified_at": last.verified_at, "verdict": last.verdict,
                "duration_ms": last.duration_ms, "summary": json.loads(last.summary_json)}
        return {"version": __version__, "demo_mode": settings.demo_mode, "chain": chain,
                "deployment": deployment_to_dict(dep), "counts": svc.counts(), "last_verification": last_run}

    def require_demo_mode() -> None:
        if not settings.demo_mode:
            raise HTTPException(403, "lab endpoint disabled (LEASH_DEMO_MODE=0)")

    # ---------------------------------------------------------------- system
    @app.post("/api/system/deploy")
    def deploy() -> dict[str, Any]:
        try:
            return {"deployment": deployment_to_dict(svc.ensure_deployment())}
        except AnchorError as exc:
            raise _anchor_error(exc) from exc

    @app.post("/api/demo/reset")
    def reset() -> dict[str, Any]:
        require_demo_mode()
        try:
            dep = svc.reset()
        except AnchorError as exc:
            raise _anchor_error(exc) from exc
        return {"reset": True, "deployment": deployment_to_dict(dep)}

    # -------------------------------------------------------------- ingestion
    @app.post("/api/events/ingest")
    def ingest(req: IngestRequest, authorization: str | None = Header(default=None)) -> dict[str, Any]:
        if settings.ingest_token:
            presented = (authorization or "").removeprefix("Bearer ").strip()
            if not hmac.compare_digest(presented.encode(), settings.ingest_token.encode()):
                raise HTTPException(401, "invalid or missing ingest token", headers={"WWW-Authenticate": "Bearer"})
        elif not settings.demo_mode:
            raise HTTPException(403, "ingest disabled: set LEASH_INGEST_TOKEN")
        records = svc.emit_from_host(req.events)
        return {"ingested": len(records), "first_seq": records[0]["seq"], "last_seq": records[-1]["seq"]}

    @app.post("/api/simulate/traffic")
    def traffic(req: TrafficRequest) -> dict[str, Any]:
        require_demo_mode()
        raws = generate_traffic(req.count, seed=req.seed, include_intrusion=req.include_intrusion)
        if not raws:
            return {"ingested": 0, "batches": []}
        records = svc.emit_from_host(raws)
        batches: list[dict[str, Any]] = []
        error = None
        if req.anchor:
            try:
                batches = svc.seal_and_anchor()
            except AnchorError as exc:
                error = str(exc)
        return {"ingested": len(records), "first_seq": records[0]["seq"], "last_seq": records[-1]["seq"],
                "batches": batches, "anchor_error": error}

    # -------------------------------------------------------------- anchoring
    @app.post("/api/batches/seal")
    def seal() -> dict[str, Any]:
        try:
            return {"anchored": svc.seal_and_anchor()}
        except AnchorError as exc:
            raise _anchor_error(exc) from exc

    @app.get("/api/batches")
    def batches() -> dict[str, Any]:
        return {"batches": svc.list_batches(), "deployment": deployment_to_dict(svc.active_deployment())}

    @app.get("/api/batches/{batch_id}")
    def batch_detail(batch_id: int) -> dict[str, Any]:
        found = [b for b in svc.list_batches() if b["batch_id"] == batch_id]
        if not found:
            raise HTTPException(404, "unknown batch")
        dep = svc.active_deployment()
        onchain = None
        receipt = None
        if dep and found[0]["status"] == "anchored" and svc.anchor.is_connected():
            try:
                oc = svc.anchor.get_batch(dep.contract_address, batch_id)
                onchain = oc.to_dict() if oc else None
                r = svc.anchor.get_receipt(found[0]["tx_hash"])
                if r:
                    receipt = {"status": int(r["status"]), "block_number": int(r["blockNumber"]),
                               "gas_used": int(r["gasUsed"]), "from": r["from"], "to": r["to"],
                               "transaction_hash": "0x" + bytes(r["transactionHash"]).hex(),
                               "logs": len(r["logs"])}
            except AnchorError as exc:
                onchain = {"error": str(exc)}
        return {"batch": found[0], "onchain": onchain, "receipt": receipt}

    # ----------------------------------------------------------------- events
    @app.get("/api/events")
    def events(offset: int = Query(0, ge=0), limit: int = Query(100, ge=1, le=1000),
               status: str | None = None, order: str = Query("desc", pattern="^(asc|desc)$")) -> dict[str, Any]:
        items, _, _ = snapshot(svc)
        if status:
            wanted = {s.strip().upper() for s in status.split(",")}
            items = [i for i in items if i["status"] in wanted]
        if order == "desc":
            items = list(reversed(items))
        return {"total": len(items), "offset": offset, "limit": limit, "items": items[offset:offset + limit]}

    @app.get("/api/events/{seq}")
    def event_detail(seq: int) -> dict[str, Any]:
        items, batch_reports, _ = snapshot(svc)
        matches = [i for i in items if i["seq"] == seq]
        if not matches:
            raise HTTPException(404, "unknown sequence number")
        proof = None
        dep = svc.active_deployment()
        if dep:
            bundle = build_bundle(svc, source="vault", seqs=[seq])
            proof = next((e for e in bundle["events"] if e["seq"] == seq), None)
        batch = next((b for b in batch_reports if b["batch_id"] == matches[0]["batch_id"]), None)
        return {"records": matches, "proof": proof, "batch": batch}

    # ---------------------------------------------------------------- attacks
    @app.get("/api/attacks/scenarios")
    def scenarios() -> dict[str, Any]:
        return {"scenarios": [{"id": k, "description": v} for k, v in SCENARIOS.items()]}

    @app.post("/api/attacks/{scenario}")
    def attack(scenario: str, req: AttackRequest | None = None) -> dict[str, Any]:
        require_demo_mode()
        try:
            return lab.run(scenario, **((req.params if req else {}) or {}))
        except (ValueError, TypeError) as exc:
            raise HTTPException(400, str(exc)) from exc

    @app.get("/api/attacks")
    def attack_history(limit: int = Query(200, ge=1, le=5000)) -> dict[str, Any]:
        return {"actions": lab.history(limit)}

    # ----------------------------------------------------------- verification
    @app.post("/api/verify")
    def verify() -> dict[str, Any]:
        return run_verification(svc)

    @app.get("/api/verify/runs")
    def verify_runs(limit: int = Query(50, ge=1, le=500)) -> dict[str, Any]:
        with svc.stores.vault() as s:
            rows = s.scalars(select(VerificationRun).order_by(VerificationRun.id.desc()).limit(limit))
            return {"runs": [{"run_id": r.id, "verified_at": r.verified_at, "verdict": r.verdict,
                              "duration_ms": r.duration_ms, "summary": json.loads(r.summary_json)} for r in rows]}

    @app.get("/api/verify/runs/{run_id}")
    def verify_run(run_id: int) -> dict[str, Any]:
        with svc.stores.vault() as s:
            r = s.get(VerificationRun, run_id)
            if r is None:
                raise HTTPException(404, "unknown run")
            return json.loads(r.report_json) | {"run_id": r.id}

    @app.get("/api/verify/score")
    def score() -> dict[str, Any]:
        """Compare the latest detection results with attack-lab ground truth."""
        report = run_verification(svc, persist=False)
        truth = lab.ground_truth()
        expected = {"delete": "DELETED", "modify": "MODIFIED", "inject": "INJECTED"}
        detected = {f["seq"]: f["status"] for f in report["findings"]}
        tp = sum(1 for seq, a in truth.items() if detected.get(seq) == expected[a])
        fn = len(truth) - tp
        fp = sum(1 for seq in detected if seq not in truth)
        return {"ground_truth_tampered": len(truth), "detected": len(detected), "true_positive": tp,
                "false_negative": fn, "false_positive": fp, "verdict": report["verdict"]}

    # ----------------------------------------------------------------- export
    @app.get("/api/export")
    def export(source: str = Query("vault", pattern="^(vault|host)$"), seqs: str | None = None) -> dict[str, Any]:
        wanted = [int(s) for s in seqs.split(",") if s.strip()] if seqs else None
        try:
            return build_bundle(svc, source=source, seqs=wanted)
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc

    @app.post("/api/auditor/verify")
    def auditor_verify(req: AuditRequest) -> dict[str, Any]:
        """Run the standalone verifier (no backend state involved) on an uploaded bundle.

        Only the configured RPC endpoint is used, so the portal cannot be turned
        into a request proxy (SSRF). Auditors who want their own node run the CLI.
        """
        try:
            return leash_verify.verify(req.bundle, settings.rpc_url, req.contract_address)
        except (ValueError, RuntimeError, OSError) as exc:
            raise HTTPException(400, str(exc)) from exc

    return app
