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
- **Reference-driven redesign T-032 (same session, later):**
  - Opened the owner's reference reel in the browser (dismissed Instagram's sign-up overlay; no sign-in), paused the
    23.5 s video and sampled ~15 frames. It shows a website in a red/ink/paper manga print style, not a dark
    dashboard. Spec of what was visible: `docs/design/REFERENCE_SPEC.md`.
  - Stage order: tokens + fonts + shell + kit + dashboard first, screenshot, compare, refine (added a focal ink disc,
    hatched chart fills, red CTA band), then Attack Lab (speed-line scene, comic stepper, ink terminal, IMMUTABLE stamp)
    and Guided Demo (red opening scene, comic-strip progress, numbered panels, red/green verdict blocks), then the
    supporting pages (inherit via kit; evidence filter bar fixed).
  - Bugs found and fixed on the way: the Attack Lab scan line never finished its exit animation (it inherited
    `repeat: Infinity`); `.surface` background overrode `bg-ink` on the current stepper step (white on white); the demo
    progress bar animated from full width on first render; white titles vanished over a paper-filled disc; a 1 px
    overflow of the evidence filter bar at 375 px; screenshot shots caught the decorative cursor.
  - Checks: tsc and lint clean; e2e 23 passed + 1 skipped (production build; all 8 routes at 375/768 px with no
    overflow and no console errors); screenshots regenerated. No backend, contract or verification code changed.
  - Also confirmed live: Ctrl+C in the start-all window stops all three services.
- **Handoff (owner typed HANDOFF NOW, to pass the project to another teammate):**
  - Stopped the running site; ports 8545/8000/3000 free. `main` clean and equal to `origin/main` (`9c22e94`) before
    the handoff docs commit.
  - Re-ran everything on the final code: contract 9 passing; backend 90 passed; frontend lint clean, `npm run build`
    ok (8 routes), `tsc` ok; Playwright 23 passed + 1 skipped.
  - `HANDOFF_PROMPT.md` rewritten as a continuation guide for someone on a fresh machine (clone, install, own
    identity, collaborator invite, start command, assistant prompt). `AGENTS.md` now says each contributor commits
    with their own identity. Added T-033 (rehearsal), T-034 (`start-all.sh`) and KI-017.
  - Usage indicator: not read this session.

## S03 — 2026-11-20 — laptop A (delivery brief: Dashboard redesign behind an approval gate)
- **Starting commit:** `0b311df` locally, behind by 12; fast-forwarded to `a1ae30a` (laptop B's S02 work).
- **Baseline re-run at `a1ae30a`:** backend 90 passed, hardhat 9 passing, `tsc` and lint clean, build compiled.
- **Reference:**
  - Reel `DfFzpXTR9AY` inspected again from genuine frames (canvas overlay in the browser, nothing saved): 16 single
    frames plus dense sampling of 3.4–5.0 s and 12.6–14.2 s.
  - S02's static observations were confirmed. What it missed (and what produced the rejected newspaper look):
    minimal frames, rare display type, press-and-hold controls, bottom-up scene wipes, and the next-scene peek.
  - Spec rewritten (v2).
- **Built on branch `design/dashboard-v2`:**
  - The Dashboard v2 verdict scene and bands; scoped `.dash` tokens; `components/dashboard/{integrity-seal,hold-button}.tsx`.
  - A route-scoped shell variant for `/` (full-bleed main, lighter header, no footer).
  - A header tab-wrap fix at 1280 px.
- **QA (real stack via `scripts\start-all.ps1 -Dev`):**
  - 4 viewports × clean and tampered: no overflow, no console errors, no failed requests.
  - Hold released after 250 ms → no verify request; a full hold → exactly one; CLEAN → TAMPERED bloom.
  - Keyboard: focus reaches the hold control and "Verify now" with a visible ring.
- **Fixed during QA:**
  - a hydration mismatch (the reveal moved to CSS);
  - a stale-report race that showed "0 records diverge" after a flip (counts now come from the run summary, and ticks
    only from the report whose run id matches);
  - an e2e strict-mode duplicate text.
- **Tests on the branch:** Playwright 23 passed, 1 skipped; `tsc` and lint clean.
- **Usage indicator (app):** 13 % of the 5-hour window at session start.
- **Owner approved Dashboard v2.** `main` was fast-forwarded to it (`78cf00f`). Rollout on `design/rollout-v2`, then merged:
  - global v2 tokens (field `#fbfaf7` with ink grain, white plates, 1 px rules, red `#d81e1e`, 2 px radius)
  - `PageTitle` without the red band; `AlertBanner` as verdict fields; shell header and outlined tab on every route;
    1 px buttons
  - Attack Lab: v2 restyle, hold-to-verify, and an "Inspect proof" drawer for each finding
  - Guided Demo: restyled (7 scenes kept, so backend behaviour and e2e selectors are unchanged)
  - Fixed Attack Lab horizontal overflow at 375/390 px (grid column templates)
  - Tests: Playwright 23 passed + 1 skipped; lint and `tsc` clean. 16 route captures (8 routes × 1440/390): no
    overflow, no console errors, no failed requests.
- **T-038 live judge-demo check (S03, production build via `scripts\start-all.cmd`):**
  - **Steps 1–3:** ready; 132 events anchored in batch #0; baseline CLEAN; receipt status 0x1; on-chain root read by
    `eth_call` equals the vault root.
  - **Steps 4–5:** "Erase my trail" removed 13 host lines. That is 12 intrusion lines plus 1 attacker line from the
    file-agent test, so the script's hard-coded 12 was wrong for this run. The verifier reported exactly 13 deleted.
  - **Step 6:** an erased record was recovered from the vault with an 8-step proof; the CLI on the vault bundle
    exited 0.
  - **Step 7:** host bundle: the CLI exited 2 and listed 13 missing; the browser verifier also listed 13 missing.
  - **Step 8:** the guided demo ran twice back to back (VERIFIED both times).
  - **Step 9:** Ctrl+C stopped all three services and freed the ports; a restart came back healthy.
  - **KI-014 confirmed:** `tail_agent.py check` passed before the file edit (exit 0) and caught it afterwards
    (exit 2), while `/api/verify` stayed CLEAN. The Dashboard now says which check covers what.
- **T-037:** `docs/PITCH.md` rewritten: 90-second script with cues, 3-minute walkthrough, judge Q&A including the
  Indian context (CERT-In 2022 directions), all claims tied to demo actions or local-EVM measurements.
- **Final tests:** Playwright 23 passed + 1 skipped; `tsc` and lint clean; backend unchanged since the S03 baseline
  (90 passed).

### S04 (laptop A, 2026-11-20): ScrollCraft story
- The owner answered the ScrollCraft interview: one unbroken cinematic world; seven chapters; "the scroll is the
  attack"; ink black, paper, one signal red; no paid assets. Their answers are in
  `scrollcraft/builds/story/BRIEF.md` verbatim.
- Built `/story`.
  - **Structure:** the continuous-world grammar as a bespoke fixed stage. One camera travels host log → wire →
    evidence vault → Merkle tree → chain block → verifier → the real Attack Lab screenshot. The engine is not used,
    since its worldflight mode is video-only. The page publishes `data-sc-verify-state` for the harness.
  - **Signature move:** the visitor's scroll erases five lines and rewrites one, typing the attacker's `sed`
    commands. The verdict blooms red and the originals fly back from the vault, each with a verified 4-step proof.
  - **Depth:** a far grid, a canvas of motes at many depths, and a giant faint night clock that advances with the
    log.
- **Evidence:**
  - Harness, three runs: desktop 46 frames, phone 33, reduced 27. Final state: no dead scroll, all cues peak,
    contrast clear.
  - Roots cross-checked against `backend/app/merkle.py`.
  - Keyboard, overflow and error checks as listed in CURRENT_STATE.
- **Fixes found by the harness:**
  - restore labels laid out as a grid cell (CSS specificity);
  - the scrim greying the log;
  - text over the wide shot;
  - the verdict holding too briefly;
  - the reduced-motion dip firing at the first and last frame;
  - the phone wide shot under the bar.
- **Handoff at 90% of the 5-hour usage window.** T-040 is open.
- **HANDOFF NOW** (owner): docs updated, frontend `tsc` and lint rerun clean; e2e not run (T-040). Pushed for the other laptop.

## S05 — 2026-11-20 — laptop B
- **Starting commit:** `60fb9a7` (fast-forward from `a1ae30a`, 7 commits from laptop A; clean tree, no divergence).
- **T-040 (part):** added `frontend/e2e/story.spec.ts` (2 tests) and `/story` to `e2e/responsive.spec.ts`.
- **Tests:** `npx tsc --noEmit` exit 0; eslint on the specs clean; `npm run test:e2e` → 27 passed, 1 skipped (1.4 min),
  demo stack not running. Backend, contract, verifier and agent unchanged (last: 90 passed / 9 passing in S03–S04).
- **T-040 steps 4–5:** `scripts\start-all.cmd` started cleanly (132 events, 1 batch). `/story` on :3000: `sc-ready`, root
  `916a1113…`, CTA `/attack`, no overflow, live line "Live now: local chain 31337 · block 2 · 132 events anchored".
  Feel-check diff in BRIEF.md (not cold); follow-ups recorded as T-041. KI-024 resolved.
- **T-041:** stack stopped; `story-world.tsx`, `story-data.ts` and `story.css` changed (stamp, hidden wire/vault before
  ch4, seal focus, vault out of the close). Checked on the dev stack (`start-all.cmd -Dev`) at 1630×845 and 375×812;
  `npm run lint` and `tsc` clean; e2e 27 passed + 1 skipped. ScrollCraft harness not re-run. KI-025 recorded.
- **API proxy (2026-11-21):** the owner's browser reported the API offline; a clean Edge worked, so a profile-level
  blocker was cutting `localhost:3000` → `127.0.0.1:8000`. `lib/api.ts` now defaults to the same origin and
  `next.config.ts` rewrites `/api/*` to the backend; e2e uses the proxy too (27 passed + 1 skipped). KI-026.
- **Left running:** the demo stack (:8545/:8000/:3000, production build) for the owner.

### S06 (laptop A, 2026-11-21): GHOST PROTOCOL P0 on `feature/ghost-protocol`
- The owner pasted the "GHOST ENTERPRISE" master prompt. Scope was cut to its own P0 (ponytail ultra): enterprise
  features, the inquiry form, integrations, the forensic graph, extra verdict names and business documents were
  deferred, with the reasons given to the owner.
- `main` had moved on the other laptop (`57400da`: T-040, T-041, API through the web origin). It was pulled
  fast-forward, and the work went on a new branch.
- **Built:** witness store and registry, the signed gateway witness, the ssh-session-corroboration rule, the
  OBSERVED_OMISSION verdict, the silent_login attack, `/api/witness`, and UI for Attack Lab and the Dashboard.
- **Tests:** backend 95 passed; Playwright 27 passed + 1 skipped. Live demo on the real stack: CLEAN with 21
  corroborated sessions → Go silent → Observed omission, signature valid.
- Owner approved the merge: `main` fast-forwarded to `feature/ghost-protocol` (main had not moved, so the tested tree is unchanged).
- **T-043:** signed host heartbeats and REPORTING_GAP, judged by the collector's clock (backend 103 passed,
  Playwright 27 passed + 1 skipped). Live: Go silent produced both Observed omission and Reporting gap.
  Declared-count reconciliation was deliberately left out (KI-028).
- **T-045:** `commitDispute` contract method + dispute packages (contract 11, backend 107, Playwright 27 + 1
  skipped). Live receipt: dispute #0, block 5, 117,268 gas, chain read-back matches.

### S07 (laptop A, 2026-11-21): redesign + Wick on `redesign/castle`
- Started from `bed98ce`. Implemented the owner's redesign brief: two themes with a no-flash System/Light/Dark
  control, new fonts, Dashboard → `/dashboard`, `/story` retired, homepage sample case, Wick assistant.
- Tests: backend 107 passed; Playwright 28 passed + 1 skipped; tsc and lint clean; production build OK.
- The owner then supplied 20 mood references; a photo-based hero was built and then removed at the owner's request
  ("no pics on the site; the whole site a medieval castle; UI first, then backend"). Direction recorded in
  `docs/design/CASTLE_DIRECTION.md`; references in `docs/design/references/`.
- Stopped near the owner's usage limit; branch pushed for the other laptop.

### S08 (laptop B, 2026-11-21): "The Missing Session" 3D tour on `redesign/castle`
- Pulled `main` fast-forward to `bed98ce`, switched to `redesign/castle` (`8e8d1bb`). Built the S07 handoff's layered
  SVG castle first; then the owner sent the 3D brief, which replaced the castle-explorer plan. A tree-levels endpoint
  written for the explorer was removed again (the seal chamber uses the existing `/api/events/{seq}` proof).
- Added `three` 0.187 + `@react-three/fiber` 9.8 (owner approved via the brief); fortress scene, five-room tour,
  live seal check, room-aware Wick, reduced-motion/no-WebGL fallback, e2e for both paths, `scripts/tour-shots.mjs`.
- Checks: tsc/eslint clean; Playwright 29 passed + 1 skipped; pytest 107 passed; production build; three shots.
- Left running: the production stack in the "LEASH demo stack (production)" terminal tab (stop with Ctrl+C or
  `scripts\start-all.ps1 -Stop`).
- Same session, after the owner's review ("too cartoonish … realism … cybersecurity"): the fortress was replaced by a
  realistic data hall (`datacenter-scene.tsx`, CC0 Poly Haven maps + HDRI in `frontend/public/tour/`, bloom, soft
  shadows), rooms retold for the data center, the knight art removed from Wick, posters for the fallback. Playwright
  29 passed + 1 skipped; production build; three new shots.
- Owner approved the merge: `main` fast-forwarded to `redesign/castle` (main had not moved, so the tested tree is
  unchanged; backend, contract, verifier and agent are identical to `bed98ce`).
- ADR-008 added (the homepage 3D tour). Pushing from laptop B was refused (403) because a `GH_TOKEN` for another
  GitHub account overrode the owner's login; at the owner's request it was removed from the Windows user
  environment.
- HANDOFF NOW to the other laptop: contract 11 passing, pytest 107 passed, tsc + eslint clean on `08258d3`;
  Playwright not rerun (demo stack running, KI-022; last run 29 passed + 1 skipped on `ab00107`, docs only since).

### S09 (laptop A, 2026-11-21): took over `main`, T-054 measurements
- Pulled `3893dc5` fast-forward; installed the new frontend deps (three, R3F) with `npm install` (lockfile unchanged).
- Rerun: contract 11, backend 107, tsc + lint clean, Playwright 29 passed + 1 skipped.
- T-054: frame timing on the AMD iGPU (desktop ~47 fps, phone ~57 fps; GPU-bound); light theme walked at every station;
  bloom threshold made per theme to stop the light-theme washout. A static shadow map was tried, measured no gain,
  reverted. Final code: tsc + lint clean, Playwright 29 passed + 1 skipped.

- **Owner: "interactive design, not ppt".** Replaced the station tour with an original Obsidian-style hero (3D obsidian rack,
  chrome ribbon, drag, empty slot → demo case) plus the live verification. MotionSites' Obsidian is a paid prompt, so it was
  used as a visual reference only. Hit KI-039 (stale CSS from the Turbopack cache). Final: tsc + lint clean, Playwright
  29 passed + 1 skipped, production build, browser checks at 375 and 1440 in both themes.

### S10 (laptop B, 2026-11-21): T-044 second witness + 2-of-3
- Pulled `b0ab9d2` (S09) fast-forward. Owner: "continue with the backend and push".
- T-044: identity/auth control-plane witness with its own key; policy v2 (2 of 3: host, gateway, identity);
  `CONFLICTING_ATTESTATIONS` when only one witness attests; one vote per role per session; registered role must
  match the claim; host-agent keys no longer vote. Dispute packages carry the corroborating observation.
- Checks: backend 110 passed, tsc + lint clean, Playwright 29 passed, 1 skipped. The demo stack was stopped for e2e and restarted.
- S10 continued on branch `backend/witness-audit` (owner: "continue with the backend on your branch"): T-046, the
  stdlib auditor CLI recovers secp256k1 signatures and applies the 2-of-3 rule offline, never accusing the host on
  incomplete evidence; witness identities pinnable with `--witness`; full bundles carry the signed observations.
  Backend 116 passed, tsc + lint clean, Playwright 29 passed, 1 skipped. Not merged into `main`.
- Owner approved the merge: `main` fast-forwarded to `backend/witness-audit` (main had not moved, so the tested tree
  is unchanged).
- Docs: duplicate KI-039 renumbered (verifier speed is KI-040), stale "next: T-054" lines fixed, T-050 closed.
- Owner: "Merge it, then build". Merged laptop A's `frontend/obsidian` into `main` (`--no-ff`, clean). Contract 11,
  tsc + lint clean, Playwright 29 passed + 1 skipped, production build; backend unchanged since the 116-pass run.
- Branch `frontend/judge-path` (owner: livelier, less generic judge path): `/demo` console with a live log terminal
  and chain panel, homepage Merkle proof ladder, denser Attack Lab rows; demo reset now empties stores in place
  (WinError 32 fix). Backend 117, tsc + lint clean, Playwright 29 passed + 1 skipped. Not merged into `main`.
