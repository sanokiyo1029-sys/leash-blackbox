# Session history

## S01 — 2026-11-20 — laptop A
- **Starting commit:** none (new repository)
- **Ending commit:** `00443cb` (code, pushed and verified on origin/main) + the `docs: update development handoff` commit that follows it
- **Work completed:**
  - Inspected the environment and installed GitHub CLI.
  - Logged gh in as sanokiyo1029-sys. Set the repo-local identity (Rohan, GitHub noreply) and a
    credential helper. Turned off assistant attribution in the coding tool's user settings. Added a guard hook.
  - Hardhat project and the `LeashAnchor` contract with tests; ABI export.
  - Backend phases 1–4: three stores, collector/host agent, Merkle sealing, web3 anchoring,
    verification engine, attack lab, evidence export, FastAPI.
  - Standalone auditor verifier, pytest suite, and handoff docs.
  - Moved the project to `C:\Users\sreea\leash-blackbox` (Windows path-length limit).
- **Files substantially changed:** everything (initial import).
- **Tests executed and results:**
  - `npx hardhat test` → 9 passing
  - `pytest` → 76 passed
  - Live API + CLI smoke test passed (numbers in CURRENT_STATE.md)
- **Architectural changes:** initial architecture (ARCHITECTURE_DECISIONS.md ADR-001..007).
- **Frontend (same session, later):**
  - Next.js 16 + Tailwind 4 + shadcn/ui (base-ui) + Recharts + Lucide web console with 7 screens.
  - In-browser verifier (`lib/verify.ts`).
  - tsc, lint and build pass; verified manually in a browser (results in CURRENT_STATE.md).
- **Validation (same session, later):**
  - Added `scripts/run_validation.py`.
  - The first run showed 1 "missed" record. Root cause: the lab's ground truth labelled "delete, then inject at
    the same anchored seq" as an inject, while the verifier correctly reports MODIFIED. Fixed the labelling
    and added a regression test (77 passed).
  - Re-run: recall 100%, precision 100% over 30 trials.
- **E2E:** added Playwright smoke tests (5 passed, Edge channel, private ports).
- **Presentation:** `/demo` guided story (7 steps, real API + in-browser auditor), e2e test added (6 passed).
- **Hardening:** lab endpoints gated by `LEASH_DEMO_MODE` (78 passed).
- **Pitch:** `docs/PITCH.md`, plus 6 real screenshots captured by Playwright (`docs/img/`). Fixed a premature-match bug
  in the demo e2e wait condition.
- **Hardening:** ingest bearer token (`LEASH_INGEST_TOKEN`, constant-time compare); 80 tests passed.
- **Premium UI transformation (same session, later):**
  - The reference Instagram reel was behind a login wall: only the account name and a "FUTURE of web design" caption
    were visible, so I did not attempt exact reference matching. I followed the written design direction instead.
  - Built the design system, the Attack Lab split screen (with targeted erase/rewrite API + test), the dashboard,
    the evidence verification panel and the auditor batch audit. Added Motion (`motion` npm).
  - Tests: backend 81 passed; e2e 7 smoke passed (the Attack Lab test also asserts 0 console errors); screenshots
    were regenerated.
  - Responsive e2e: 16 passed (8 routes × 375/768px, no overflow, no console errors).
- **Remaining problems:** legacy screens not yet restyled (T-029); T-018, T-021, T-022 and T-023 are open.
