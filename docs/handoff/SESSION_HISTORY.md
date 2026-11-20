# Session history

## S01 — 2026-11-20 — laptop A
- **Starting commit:** none (new repository)
- **Ending commit:** `ae97e9c` (last code commit, verified on origin/main at handoff) + the `docs: session handoff` commit that follows it.
  The first push of the session was `00443cb`.
- **Work completed:**
  - Inspected the environment and installed GitHub CLI.
  - Logged gh in as sanokiyo1029-sys. Set the repo-local identity (Rohan, GitHub noreply) and a
    credential helper. Turned off assistant attribution in the coding tool's user settings. Added a guard hook.
  - Hardhat project and the `LeashAnchor` contract with tests; ABI export.
  - Backend phases 1–4: three stores, collector/host agent, Merkle sealing, web3 anchoring,
    verification engine, attack lab, evidence export, FastAPI.
  - Standalone auditor verifier, pytest suite, and handoff docs.
  - Moved the project to `C:\Users\<user>\leash-blackbox` (Windows path-length limit).
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
- **Handoff (owner typed HANDOFF NOW):**
  - Re-ran everything: backend 81 passed, contract 9 passing, e2e 23 passed + 1 skipped, tsc/lint clean.
  - Usage at handoff: 78% of the 5-hour window (read from the app's usage indicator).
  - Local services left running on laptop A: Hardhat :8545, API :8000, Next dev :3000. They are not needed on laptop B.
- **Public release (owner request):**
  - Secret audit of all 23 commits found no keys, tokens, passwords, `.env` files, wallet material, personal
    emails or credentials.
  - One low-sensitivity finding: a local Windows user path. It was removed from the current docs but remains in
    older commits; scrubbing it would need a force-push, which the project rules forbid.
  - Repo made public; `rohanshahare` invited with write access; README rewritten for judges.

## S02 — 2026-11-20 — laptop B
- **Starting commit:** `0b311df` (fresh clone; local `main` equal to `origin/main`, clean tree).
- **Environment found:** `gh` was authenticated as `lector-sys` through a `GH_TOKEN` variable, with READ access to the
  repo, not as `rohanshahare`. The global git identity on this laptop belonged to neither project account. The repo was already public.
  No commit was made under either identity before the owner decided (see CURRENT_STATE "Current blocker").
- **Work completed:**
  - T-029: `/proofs`, `/validation`, `/demo`, `/architecture` and the auditor's full-bundle section rebuilt on the kit
    (PageTitle, Panel, MetricCard, AlertBanner, HashChip, EmptyState, LoadingRows, Reveal). `VerdictBanner` now renders an
    `AlertBanner`; the unused legacy helpers `PageHeader`, `ErrorNote`, `Stat` and `Hash` were removed from `status.tsx`.
  - Proof Explorer: metric row (batches, records committed, gas, median anchor latency) and a live "vault record matches
    the contract" banner computed from the browser's own contract read.
  - Guided demo: progress bar, auto-scroll to the running step, sample high/critical events in step 2, and in step 6 the
    batch roots are re-read from the contract and compared with the roots anchored before the attack.
  - T-023: `scripts/start-all.ps1` + `scripts/start-all.cmd`; `logs/` added to `.gitignore`; README and PITCH updated.
- **Tests executed and results (this session, this laptop):**
  - `npx hardhat test` → 9 passing; `python -m pytest` → 81 passed (81 collected, exit 0).
  - `npm run lint` clean; `npm run build` passes (all 8 app routes prerendered); `npx tsc --noEmit` exit 0 after the build.
  - `npm run test:e2e` → 23 passed, 1 skipped (screenshot spec).
  - Start script: full start in one command (chain, API, reset + 132 events in 1 anchored batch, production build, web);
    a second start while running refused with the three port owners named and exit 1; `-Stop` stopped the three recorded
    processes and freed 8545/8000/3000.
  - Manual browser check against the started stack: Proof Explorer, full demo story (step 6 "On-chain commitment
    unchanged", 1/1 roots), auditor host bundle at 375px (TAMPERING DETECTED, 12 MISSING rows, no horizontal overflow).
- **Not done:** `.sh` start script (only Windows was required); T-022, T-021, T-018.
- **Push:** owner logged gh in as `rohanshahare` (device flow); pushed `0b311df..54fa106`, remote head verified.
- **T-022 (same session, later):**
  - `agent/tail_agent.py` (stdlib only): `ingest` forwards complete new lines in file order. Its state keeps the byte
    offset plus a SHA-256 of the forwarded prefix, so re-runs never resend and a rewritten prefix is refused (exit 2).
    It reads RFC 3164 / ISO syslog with sshd/sudo/pam rules and JSON lines; unknown lines are committed as `unparsed`;
    lines over 4096 chars are reported, not sent. `--seal` anchors right away, `--follow` polls.
  - `check` proves the vault export with `leash_verify` (refuses unproven evidence), then diffs the file and reports
    ERASED / ALTERED / INJECTED / NOT_COMMITTED.
  - Tests: `backend/tests/test_tail_agent.py` → 5 passed; full backend suite → 86 passed.
  - Live run against the started stack, agent on the system Python 3.14 (not the venv): 14 lines forwarded and anchored
    (1 unparsed), re-run forwarded 0, `check` MATCHES; after deleting one line and rewriting the attacker IP on another,
    `check` reported 1 ERASED (original text) and 1 ALTERED (was/now), exit 2; `ingest` then refused to resume, exit 2.
- **T-021 (same session, later):**
  - `Settings.host_tokens` + `LEASH_HOST_TOKENS` (`host=<sha256 hex>` pairs; a malformed entry fails startup and names
    only the host, so a mistakenly pasted token is never echoed). Ingest hashes the presented token, compares it with
    every entry, and refuses (403) a request containing any event for another host, storing nothing. The shared
    `LEASH_INGEST_TOKEN` still works; with no tokens configured, demo-mode behaviour is unchanged.
  - Agent: an anchoring failure after a successful forward is now reported as "forwarded, but anchoring failed" (it
    previously looked as if nothing was sent).
  - Tests: 4 new (own/foreign host, mixed batch stores nothing, rotation, shared fallback, env parsing, agent with host
    token) → backend 90 passed.
  - Live over HTTP with a freshly generated token (hash only in the environment): no token → 401; right token but a
    line claiming another host → 403; own host → 14 forwarded and anchored; `check` → MATCHES 14/14.
- **Presentation prep (same session, later):**
  - Screenshots regenerated (`CAPTURE=1 npx playwright test screenshots`). Fixed the capture script: waits for the
    metric counters (the first proofs shot showed mid-tween numbers, 125 instead of 162), scrolls the auditor result
    into view, and scrolls to top before the full-page demo shot (the story's auto-scroll had misplaced the shell).
  - Auditor: "Chain heads ok 0 of 0" was green; it is now neutral with "not checkable: a batch is incomplete".
  - Demo step 2 shows one event per intrusion stage instead of four similar failed-password lines.
  - PITCH: test counts, next steps, two judge Q&A rows (real log files, per-host tokens), demo-day checklist.
  - Checks: lint clean, tsc ok, e2e 23 passed + 1 skipped. `scripts\start-all.cmd` was run through cmd.exe
    (default production build): ready, `/demo` 200, 132 events anchored; `start-all.cmd -Stop` stopped all three.
