# Next tasks (prioritized backlog)

Statuses: TODO · IN_PROGRESS · BLOCKED · DONE

| ID | Description | Priority | Depends on | Acceptance criteria | Status |
|---|---|---|---|---|---|
| T-001 | Repo, handoff docs, attribution guard hook | P0 | — | Private GitHub repo exists, `main` pushed, no AI trailers in commits | DONE |
| T-002 | LeashAnchor contract + Hardhat tests | P0 | — | `npx hardhat test` passes | DONE |
| T-003 | Backend skeleton: config, 3 stores, models, FastAPI factory | P0 | — | App starts, `/api/health` ok | DONE |
| T-004 | Canonicalization, Merkle, hash chain + unit tests | P0 | — | `pytest tests/test_integrity.py` passes | DONE |
| T-005 | Collector/host agent, sealing, real anchoring via web3 | P0 | T-002,T-003 | Batch anchored on Hardhat node, receipt status 1, on-chain root equals vault root | DONE |
| T-006 | Verification engine (host vs vault vs chain) | P0 | T-005 | Clean run gives 0 findings; every attack scenario detected exactly | DONE |
| T-007 | Attack lab scenarios + ground-truth scoring | P0 | T-005 | `test_pipeline.py` attack tests pass | DONE |
| T-008 | Evidence export + standalone auditor CLI | P0 | T-006 | Vault bundle VERIFIED (exit 0); tampered host bundle TAMPERING_DETECTED (exit 2) | DONE |
| T-009 | Frontend scaffold (Next.js, TS, Tailwind, shadcn/ui, Recharts, Lucide) | P1 | T-006 | `npm run build` passes; API base URL from env | DONE |
| T-010 | Security Dashboard screen (live status, counts, last verdict, chain status) | P1 | T-009 | Shows real `/api/status` and `/api/verify` data | DONE |
| T-011 | Evidence Explorer (paginated events, status filter, field diff, proof view) | P1 | T-009 | Uses `/api/events`, `/api/events/{seq}` | DONE |
| T-012 | Blockchain Proof Explorer (batches, tx hash, block, on-chain vs vault root) | P1 | T-009 | Uses `/api/batches/{id}` | DONE |
| T-013 | Live Attack Simulation (run scenarios, verify, before/after) | P1 | T-009 | Uses `/api/attacks/*`, `/api/verify`, `/api/verify/score` | DONE |
| T-014 | Independent Auditor Portal (upload bundle, verify, in-browser hashing) | P2 | T-008,T-009 | Upload → verdict. Stretch: browser-side SHA-256 + RPC with no backend | DONE |
| T-015 | Validation dashboard + `scripts/run_validation.py` (N randomized trials, precision/recall, latency, gas). Dashboard page and offline script DONE; results in `docs/validation/` | P2 | T-007 | Results JSON + markdown in `docs/validation/`, numbers taken from real runs | DONE |
| T-016 | Playwright smoke tests for the core screens (runs on installed Edge) | P2 | T-010..T-013 | `npx playwright test` passes | DONE |
| T-017 | Architecture documentation page + presentation mode (`/demo` guided 7-step story) | P3 | T-010 | Story runs end to end; e2e test passes | DONE |
| T-018 | Optional: public testnet anchoring (Sepolia/L2) behind env flag. Needs the owner's funded testnet key in a local `.env` | P3 | T-005 | Documented, never commits keys; one real testnet tx hash recorded | TODO |
| T-019 | Pitch material: 3-minute demo script mapped to judging criteria + screenshots in README | P2 | T-017 | `docs/PITCH.md` + images under `docs/img/` | TODO |
| T-020 | Hardening: API auth for mutating endpoints (attack/reset are demo-only), rate limits, structured logging | P3 | — | Mutating endpoints disabled unless `LEASH_DEMO_MODE=1` | TODO |
