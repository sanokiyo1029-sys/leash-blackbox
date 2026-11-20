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
| T-019 | Pitch material: 3-minute demo script mapped to judging criteria + screenshots in README (regenerate with `CAPTURE=1 npx playwright test screenshots`) | P2 | T-017 | `docs/PITCH.md` + images under `docs/img/` | DONE |
| T-020 | Hardening: lab endpoints gated by `LEASH_DEMO_MODE`; ingest requires `LEASH_INGEST_TOKEN` (constant-time compare) or is refused outside demo mode | P3 | — | Lab endpoints 403 when `LEASH_DEMO_MODE=0`; ingest rejects unauthenticated hosts (tests) | DONE |
| T-021 | Per-host ingest credentials: `LEASH_HOST_TOKENS` = `host=<sha256 of token>` (hashes only, repeat a host to rotate); a host token may only submit events for its own host (403, request stored as nothing); shared `LEASH_INGEST_TOKEN` still accepted. Not done: mTLS, rate limits, structured audit logging | P3 | T-020 | A host can only ingest events claiming its own host_id | DONE |
| T-022 | Real log source: `agent/tail_agent.py` (`ingest` syslog / ISO syslog / JSON lines with offset + prefix-hash state, `--seal`, `--follow`; `check` proves the vault bundle with `leash_verify` and diffs the file). Sample: `agent/sample/auth.log`. Tests: `backend/tests/test_tail_agent.py` | P2 | T-020 | Editing the tailed file after ingest is detected by verify (`tail_agent.py check`) | DONE |
| T-023 | One-command local start: `scripts\start-all.cmd` → `scripts/start-all.ps1` (prereq + port checks, readiness probes, reset + seed, Ctrl+C / `-Stop` stop only its own PIDs). Windows only; no `.sh` yet | P2 | — | Starts node, API and web; prints URLs | DONE |
| T-024 | Premium UI: design system (tokens in globals.css, `lib/motion.ts`, `components/kit.tsx`), animated shell + mobile drawer + page transitions | P0 | T-009 | tsc/lint/build pass; reduced-motion respected | DONE |
| T-025 | Attack Lab split-screen centerpiece: host vs on-chain commitment, per-record connectors, targeted erase/rewrite API, root rebuild check | P0 | T-024 | e2e: baseline CLEAN → erase → 12/12 caught, 0 console errors | DONE |
| T-026 | Security Dashboard redesign: live timeline, chain status + recent tx, threat activity, integrity donut, tampering alerts | P1 | T-024 | e2e dashboard test passes | DONE |
| T-027 | Evidence Explorer detail: numbered proof steps + explicit "Verify against chain" (browser leaf + proof fold + contract read) | P1 | T-024 | e2e evidence test passes | DONE |
| T-028 | Auditor batch audit: select batch, inspect commitment, verify host/vault copy, discrepancy table, export | P1 | T-024 | e2e batch-audit test passes | DONE |
| T-029 | Restyle the remaining legacy screens (Proofs, Validation, Guided Demo, Architecture, Auditor lower section) with `kit` components (PageTitle/Panel/MetricCard) so the design language is uniform. The demo also shows sample intrusion events (step 2) and re-reads the batch roots from the contract after the attack (step 6) | P2 | T-024 | Visual consistency; e2e still green | DONE |
| T-030 | Mobile pass: Playwright `e2e/responsive.spec.ts` asserts no horizontal overflow and no console errors on all 8 routes at 375px and 768px (16 passed). Remaining: visual review of legacy screens on phones (part of T-029) | P2 | T-024 | No horizontal overflow at 375px on all routes | DONE |
| T-031 | Public release: secret audit, repo public, collaborator `rohanshahare` (write), judge-facing README | P0 | — | Visibility PUBLIC verified; invitation created | DONE |
