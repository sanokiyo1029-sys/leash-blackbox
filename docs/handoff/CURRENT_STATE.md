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
**Next: Phase 5 (frontend).**

## Completed and verified (2026-11-20)
- `LeashAnchor.sol`: append-only batches, on-chain sequence continuity, anchorer allowlist.
  `npx hardhat test` → **9 passing**.
- Backend pipeline: ingest → canonicalize → SHA-256 leaf → hash chain → Merkle batch → real
  transaction on Hardhat → receipt and event checked → verification (host vs vault vs chain).
- Attack lab: cover_tracks, alter_evidence, fabricate_alibi, timestomp, truncate_tail, wipe_all, random_tamper.
- Evidence export (vault/host, full/selective) and `verifier/leash_verify.py` (stdlib only, own Keccak).
- `backend/.venv/Scripts/python -m pytest` → **76 passed in 23.4 s**.
- Live smoke test (Hardhat node + uvicorn + CLI): 212 events anchored in 1 batch (162,994 gas),
  verify CLEAN in 69 ms; cover_tracks deleted 12 → 12/12 detected, 0 FP, 0 FN; vault bundle →
  VERIFIED (exit 0); host bundle → TAMPERING_DETECTED (exit 2).

## Partially implemented
- None in code. The README PowerShell `curl.exe` demo lines were not run in PowerShell; the same
  flow was verified from bash.

## Pending
Frontend (T-009..T-014), validation metrics script and dashboard (T-015), Playwright (T-016),
architecture page and presentation mode (T-017).

## Working commands (verified)
- `cd blockchain; npm install; npx hardhat test`
- `cd blockchain; npx hardhat node --hostname 127.0.0.1 --port 8545`
- `cd backend; .venv\Scripts\python -m pytest`
- `cd backend; .venv\Scripts\python -m uvicorn app.main:create_app --factory --port 8000`
- `python verifier\leash_verify.py BUNDLE.json --rpc http://127.0.0.1:8545`

## Failing commands
None known.

## Services required
Hardhat node on 127.0.0.1:8545 for the API. pytest starts its own node on a free port.

## Important files
`blockchain/contracts/LeashAnchor.sol`, `backend/app/service.py`, `backend/app/verify.py`,
`backend/app/attack.py`, `backend/app/export.py`, `backend/app/main.py`, `verifier/leash_verify.py`,
`backend/tests/*`.

## Known bugs
None confirmed. See KNOWN_ISSUES.md for limitations.

## Current blocker
None.

## Exact next task
T-009: scaffold `frontend/` (Next.js + TypeScript + Tailwind + shadcn/ui + Recharts + Lucide). Then
T-010..T-013 (Dashboard, Evidence Explorer, Proof Explorer, Attack Simulation) against the live API.
