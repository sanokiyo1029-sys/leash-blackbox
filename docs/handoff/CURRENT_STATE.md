# CURRENT STATE — LEASH BLACKBOX

_Last updated: 2026-11-20, session S01 (laptop A)_

## Project goal
Tamper-evident, independently verifiable security evidence: canonical SHA-256 event hashing, hash
chain, Merkle batches anchored to an append-only EVM contract, a protected evidence vault outside the
compromised host, an attack lab, and a standalone auditor verifier. Hackathon: The Big Hack 2.0, B3.

## Git
- Repo: private `sanokiyo1029-sys/leash-blackbox`, branch `main`
- Latest verified code commit: `00443cb3e0465b6cbc9a1d55775bc624569d95e4` (pushed; origin/main matched local).
  A `docs: update development handoff` commit follows it.
- Commit identity (repo-local): `Rohan <277307707+sanokiyo1029-sys@users.noreply.github.com>`
- Push auth: repo-local credential helper → `gh auth git-credential` (gh logged in as sanokiyo1029-sys)
- Uncommitted / unpushed state: none at handoff time (verify with `git status`)

## Phase
Phases 1–4 complete and tested. Phase 6 core (auditor CLI, export, negative tests) done.
Phase 5 web console built and checked manually in a browser; Playwright smoke tests (6) pass.
Phase 7 started: guided presentation mode at `/demo` (T-017) done.
Validation experiments (T-015) done; results committed in `docs/validation/RESULTS.md`.
Pitch script (`docs/PITCH.md`) and real screenshots (`docs/img/`) done (T-019).
Hardening T-020 done (lab gating + ingest token).
**Next: T-022 real log-file agent, T-023 start script, T-021 per-host credentials; T-018 needs the owner's testnet key.**

## Completed and verified (2026-11-20)
- `LeashAnchor.sol`: append-only batches, on-chain sequence continuity, anchorer allowlist.
  `npx hardhat test` → **9 passing**.
- Backend pipeline: ingest → canonicalize → SHA-256 leaf → hash chain → Merkle batch → real
  transaction on Hardhat → receipt and event checked → verification (host vs vault vs chain).
- Attack lab: cover_tracks, alter_evidence, fabricate_alibi, timestomp, truncate_tail, wipe_all, random_tamper.
- Evidence export (vault/host, full/selective) and `verifier/leash_verify.py` (stdlib only, own Keccak).
- `backend/.venv/Scripts/python -m pytest` → **80 passed** (latest run, includes demo-mode gating and ingest-token tests).
- `backend/.venv/Scripts/python scripts/run_validation.py --trials 30` → 30 trials, 476 tampered
  records: recall 100%, precision 100%, 0 clean-run false alarms, independent CLI agreed 30/30
  (about 42 s; full tables in docs/validation/RESULTS.md).
- Live smoke test (Hardhat node + uvicorn + CLI): 212 events anchored in 1 batch (162,994 gas),
  verify CLEAN in 69 ms; cover_tracks deleted 12 → 12/12 detected, 0 FP, 0 FN; vault bundle →
  VERIFIED (exit 0); host bundle → TAMPERING_DETECTED (exit 2).

## Web console (frontend/, verified manually 2026-11-20)
- `npx tsc --noEmit`, `npm run lint`, `npm run build` all pass (8 static routes).
- Checked in the browser against the live API + Hardhat node:
  - Dashboard shows a CLEAN verdict, counts and charts.
  - Attack Lab: cover_tracks + fabricate_alibi → TAMPERING DETECTED, 15/15 detected, 0 missed, 0 false alarms.
  - Evidence Explorer: a DELETED record's original is recovered, with an 8-step proof that the browser
    recomputes to the on-chain root.
  - Auditor Portal: in-browser verification of the vault bundle → VERIFIED 192/192, chain head 1/1.
    The host bundle → TAMPERING DETECTED (12 missing, 3 uncommitted), and the reference CLI agrees.
- Screens: Dashboard, Evidence Explorer, Proof Explorer, Attack Simulation, Auditor Portal,
  Validation (live randomized trials), Architecture.
- `frontend/lib/verify.ts` is a third implementation of the hashing spec (TypeScript + WebCrypto);
  it agreed with the Python implementations on the live bundle.

## Partially implemented
- None in code. The README PowerShell `curl.exe` demo lines were not run in PowerShell; the same
  flow was verified from bash.

## Pending
Real log-file agent (T-022), start script (T-023), per-host credentials (T-021), optional public testnet anchoring
(T-018, needs the owner's key).

## Working commands (verified)
- `cd blockchain; npm install; npx hardhat test`
- `cd blockchain; npx hardhat node --hostname 127.0.0.1 --port 8545`
- `cd backend; .venv\Scripts\python -m pytest`
- `cd backend; .venv\Scripts\python -m uvicorn app.main:create_app --factory --port 8000`
- `python verifier\leash_verify.py BUNDLE.json --rpc http://127.0.0.1:8545`
- `cd frontend; npm install; npm run dev` (http://localhost:3000), `npm run build`, `npm run lint`
- `cd frontend; npm run test:e2e` → **6 passed** (starts its own Hardhat :8546, API :8011, Next :3011;
  uses the installed Microsoft Edge, or set `PW_CHANNEL=chromium` after `npx playwright install chromium`)

## Failing commands
None known.

## Services required
Hardhat node on 127.0.0.1:8545 → API on 127.0.0.1:8000 → frontend on localhost:3000.
pytest starts its own node on a free port.

## Important files
`blockchain/contracts/LeashAnchor.sol`, `backend/app/service.py`, `backend/app/verify.py`,
`backend/app/attack.py`, `backend/app/export.py`, `backend/app/main.py`, `verifier/leash_verify.py`,
`backend/tests/*`.

## Known bugs
None confirmed. See KNOWN_ISSUES.md for limitations.

## Current blocker
None.

## Exact next task
T-022: `agent/tail_agent.py`, which tails a real auth.log-style file, parses lines into events and POSTs them to
`/api/events/ingest` with `LEASH_INGEST_TOKEN`. Then show in a test that editing the file after ingest is caught
(the agent keeps its host-side copy in host_logs.db as today).
