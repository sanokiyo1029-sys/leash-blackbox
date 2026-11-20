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
**Premium UI transformation (T-024..T-028) done:** design system, Attack Lab split-screen centerpiece,
dashboard, evidence verification panel and auditor batch audit. Legacy screens are still to be restyled (T-029).
Responsive checks (T-030) are automated: no overflow and no console errors at 375/768px on every route.
**Next: T-029 restyle legacy screens with the kit; then T-022/T-023/T-021. T-018 needs the owner's testnet key.**

## Completed and verified (2026-11-20)
- `LeashAnchor.sol`: append-only batches, on-chain sequence continuity, anchorer allowlist.
  `npx hardhat test` → **9 passing**.
- Backend pipeline: ingest → canonicalize → SHA-256 leaf → hash chain → Merkle batch → real
  transaction on Hardhat → receipt and event checked → verification (host vs vault vs chain).
- Attack lab: cover_tracks, alter_evidence, fabricate_alibi, timestomp, truncate_tail, wipe_all, random_tamper.
- Evidence export (vault/host, full/selective) and `verifier/leash_verify.py` (stdlib only, own Keccak).
- `backend/.venv/Scripts/python -m pytest` → **81 passed** (latest run, includes the targeted erase/rewrite attack test).
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
- `cd frontend; npm run test:e2e` → smoke **7 passed** + responsive **16 passed** (the screenshot spec is skipped unless CAPTURE=1) (starts its own Hardhat :8546, API :8011, Next :3011;
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
T-029: restyle `/proofs`, `/validation`, `/demo`, `/architecture` and the lower "Full-bundle audit" part of `/auditor`
with the kit components (`PageTitle`, `Panel`, `MetricCard`, `AlertBanner`, `HashChip`), matching the Attack Lab
and dashboard. Keep the e2e selectors working: button names "Run the full story", "Load protected vault evidence",
"Verify in my browser"; texts "status 1 · 1 log", "Protected evidence". Then run `npm run test:e2e`.

## UI architecture notes (for the next session)
- Tokens: `frontend/app/globals.css` (`.dark` block: background/primary/violet/ok/warn/bad, shadows; utilities
  `.surface`, `.surface-hover`, `.app-backdrop`, `.font-hash`; reduced-motion override).
- Motion: `frontend/lib/motion.ts` (ease, dur, spring, fadeUp, stagger). `MotionConfig reducedMotion="user"` lives in `AppShell`.
- Components: `frontend/components/kit.tsx` (Panel, PageTitle, MetricCard/AnimatedNumber, LiveDot, AlertBanner,
  EmptyState, Skeleton/LoadingRows, Spinner, Modal, Reveal, HashChip). Legacy helpers remain in `components/status.tsx`.
- Attack Lab: `frontend/app/attack/page.tsx`. Rows are a single 3-column grid on desktop (`lg:contents` wrapper);
  verdicts come only from the explicit `/api/verify` report (never from live diffing), and the on-chain root is
  read directly via `lib/verify.ts readBatch`.
- New API: `POST /api/attacks/erase_record` and `rewrite_record` with `{"params": {"seq": N}}`
  (`GET /api/attacks/scenarios` lists them under `targeted`).
