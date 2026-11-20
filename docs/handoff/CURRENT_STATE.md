# CURRENT STATE — LEASH BLACKBOX

_Last updated: 2026-11-21, session S07 (laptop A), redesign on branch `redesign/castle`_

## S07 status: redesign (laptop A, branch `redesign/castle`, NOT merged into `main`), read first
- **Branch `redesign/castle`** holds S07's work; `main` is still `bed98ce` (GHOST, all green). Continue on the
  branch, run the checks, then fast-forward `main` when the owner approves.
- **Owner's latest direction (overrides parts of `docs/design/REDESIGN_BRIEF.md`):** no photos on the site; the
  whole site should feel like an animated medieval castle; UI first, then backend; "the castle is the data inside a
  server". Read **`docs/design/CASTLE_DIRECTION.md`** (honest metaphor mapping and build plan). Mood references:
  `docs/design/references/` (owner's images, reference only, never ship them).
- **Done in S07 (verified):**
  - **Themes.** Midnight Archive (dark) and Archive at Dawn (light) as shared tokens in `app/globals.css`
    (`--ink` is always text, `--paper` the page, status colours flip so `bg-bad text-paper` works in both).
    System/Light/Dark radio group in the desktop header and the mobile menu (`components/theme-control.tsx`,
    `lib/theme.ts`); pre-paint script `lib/theme-script.ts` in `<head>`, so there is no flash.
  - **Fonts.** Cormorant Garamond 600 (headlines), Inter (UI), IBM Plex Mono (evidence, `.font-hash`).
  - **Routes.** Dashboard moved to `/dashboard`; `/story` retired (route, components, assets, spec, nav link).
    The cursor dot was removed.
  - **Homepage `/`.** Hero copy and CTA "Inspect the missing session."; the sample case ("Sample case" label, server
    timeline, Compare records, aligned table on desktop and stacked records on phones, the discrepancy marked
    with a word and an icon, the one-sentence result, "How was this verified?" separating "records differ" from
    "who or why"); "How LEASH keeps the second record"; next step = Attack Lab (Go silent) and Guided Demo.
    **The castle art is a plain sky placeholder** pending the castle UI (the photo version was built, then
    removed at the owner's request).
  - **Wick** (`components/wick.tsx`, `lib/wick-kb.ts`): "Ask Wick" launcher at the lower right; desktop panel,
    phone bottom sheet (lifts above the iOS keyboard); Enter submits, Escape closes and returns focus, replies
    announced through one polite live region; conversation and draft survive minimise, navigation and theme switches;
    the owner's pixel knights trimmed and bottom-aligned at one scale (`scripts/trim-wick.mjs` →
    `public/wick/*-216.png`), dark/light swapped by CSS; nod on open, settle on reply, still under reduced motion.
    Answers come from a local knowledge base (no API key) with aliases and paraphrase matching; page- and
    case-aware; "what was verified / what does this mean" read the real `/api/status`; honest fallback for unknown
    questions; pricing questions say there is no pricing or contact destination (KI-031).
- **Checks run in S07:**
  - backend `pytest` **107 passed**;
  - Playwright **28 passed, 1 skipped** (adds `e2e/home.spec.ts`: matcher paraphrases, one-click case, compare,
    explanation, Wick keyboard/escape/unsupported/theme switch keeps draft/reload persists/action navigates);
  - `tsc` and eslint clean after the photo removal;
  - production build through `scripts\start-all.cmd` succeeded.
- **Not done / not verified:** the e2e run was on the photo version (the text-only version passed tsc/lint only);
  browser checks of the six brief scenarios at 390/768/1440 were partly done on the dev server (1440 dark hero,
  375 light hero + Wick sheet), not the full set; no handoff screenshots (the owner dropped the photo look);
  the castle UI and its backend support (CASTLE_DIRECTION.md).

## S06 status: GHOST PROTOCOL P0 (laptop A, read first)
- **Merged into `main` (fast-forward, owner approved, T-048).** It was built on `feature/ghost-protocol` while
  `main` was moving on the other laptop. `main` had not moved since, so the merged tree is exactly the tested one.
- **What exists: the first independent witness and the first evidence-of-silence rule.**
  - **The witness (`backend/app/witness.py`).** A gateway witness signs every SSH session it observes. The signature
    is secp256k1 ECDSA over EIP-191 of the canonical claim, made with `eth_account`, which was already installed.
  - **Separation.** The witness has its own key (`data/witness/gateway.key`) and its own append-only store
    (`data/witness/witness.db`). Its identity is registered in the vault (`witness_registry`), not in its own store.
  - **Rule: `ssh-session-corroboration` v1.** Every witnessed session must match one host-forwarded `sshd
    login_success` in the vault with the same host, user and source IP, within ±120 s. Matching is 1:1.
  - **Verdicts.** A session that was witnessed but never reported gives the new verdict `OBSERVED_OMISSION`, which
    ranks below `TAMPERING_DETECTED` and above `INCONCLUSIVE`. Unregistered or invalid signatures are rejected and
    make the run `INCONCLUSIVE`, never `CLEAN`.
  - **Reporting.** `report.witness` carries the policy, the signature scheme, the trust assumptions, corroborated
    observations, rejected observations and omissions.
  - **Attack and API.** A new attack, `silent_login`, kills the host logger and logs in from the attacker's IP: the
    host writes nothing, and the witness records the session. `GET /api/witness` lists observations. Seeded traffic
    (`/api/simulate/traffic`) is observed by the witness too, so the clean baseline shows corroboration.
  - **UI.** Attack Lab gains a "Go silent" button and an amber "Observed omission" banner (who, from where, when,
    signer, signature valid, policy). The clean banner states how many sessions the witness corroborated. The
    Dashboard has an amber "Silent" view.
- **Verified in S06:**
  - backend `pytest` **95 passed** (90 existing + 5 new in `tests/test_witness.py`);
  - Playwright **27 passed, 1 skipped**;
  - frontend `tsc` and lint clean;
  - **live on the real stack** (`start-all.cmd`, this branch): baseline verify CLEAN ("witness signed 21 SSH
    sessions; the host reported every one"), then Go silent, then verify gave Observed omission (deploy from
    203.0.113.45, signature valid, host still 132 lines).
  - One copy tweak (stale-banner title after a silent attack) came after the e2e run; `tsc` and lint were rerun.
- **T-043 signed heartbeats + REPORTING_GAP (S06, on `main`).**
  - **How it works (`backend/app/heartbeat.py`).** The simulated host agent signs a heartbeat every 15 s with
    `{host, signer, boot_id, seq, prev hash, sent_at}`. Its key is in the host's trust zone (`data/host/agent.key`),
    on purpose. The collector stores each heartbeat with its own `received_at` in the vault (append-only).
  - **Rule: `heartbeat-continuity` v1.** Deadlines are judged by the collector's clock only: interval + grace
    (15 + 10 s, set with `LEASH_HEARTBEAT_INTERVAL` and `LEASH_HEARTBEAT_GRACE`). Within a boot, seq must be
    consecutive and each heartbeat must name the previous hash. A new boot starts a new chain (a benign restart is
    recorded, not a gap).
  - **Gap kinds:** `silent` (still nothing), `late`, `sequence`, `chain_break`.
  - **Verdict `REPORTING_GAP`** ranks below OBSERVED_OMISSION and above INCONCLUSIVE, and is explicitly not called
    an intrusion. A heartbeat from an unregistered signer, or with a bad signature, is rejected (INCONCLUSIVE). The
    first key for a host is registered on first use.
  - **Driving it.** The heartbeat sender runs in the API lifespan (demo mode only). `stop_agent` (API only) and
    `silent_login` stop it; a lab reset restarts it. The Attack Lab shows a "Reporting gap" banner; the Dashboard
    has an amber "Gap" view.
  - **Verified:** backend **103 passed** (8 new in `tests/test_heartbeat.py`: on time, silent, late, host clock
    skew, benign restart, dropped heartbeat, forged signer, and stop_agent through the API); Playwright **27
    passed, 1 skipped**; `tsc` and lint clean.
  - **Live:** baseline CLEAN with heartbeats arriving → Go silent → after 30 s, verify showed both Observed
    omission and Reporting gap ("silent since 21:02:24Z (36 s)").
- **T-045 dispute packages committed on-chain (S06, on `main`).**
  - **Contract.** `LeashAnchor.commitDispute(bytes32 digest)` is anchorer-only and append-only. It stores digest,
    time, block, the number of anchored batches at commit (tying the dispute to that evidence state) and the
    submitter. It also adds `disputeCount`, `getDispute` and a `DisputeCommitted` event. The ABI is re-exported to
    `shared/LeashAnchor.json`; the batch selectors and topics the auditor CLI and browser verifier use are unchanged.
  - **Backend (`backend/app/dispute.py`).** The latest verification's omissions (signed observations and policy)
    and/or reporting gaps (heartbeat policy) are frozen into a canonical package. Seconds become integer
    milliseconds, because canonical JSON allows strings, integers and null only. The package also carries the
    anchored batches and the trust assumptions.
  - **Digest = `sha256(canonical_json(package))`.** Only the digest goes on-chain; the package stays in the vault
    (`disputes` table, append-only).
  - **API.** `POST /api/disputes` (demo mode only: it spends gas and has no operator auth yet; 409 when there is
    nothing to dispute). `GET /api/disputes/{id}` re-derives the digest from the stored package and compares it with
    `getDispute` on-chain (`matches`).
  - **UI.** The Attack Lab shows "Commit dispute on-chain" under the omission/gap banners, then the receipt line.
  - **Verified:**
    - contract **11 passing** (2 new; the "no alter/remove" guard list now includes the append-only `commitDispute`);
    - backend **107 passed** (4 new in `tests/test_dispute.py`: commit + independent recompute + receipt status,
      edited package mismatch, nothing-to-dispute 409, append-only, gap-only package);
    - Playwright **27 passed, 1 skipped**; `tsc` and lint clean.
  - **Live:** Go silent → Observed omission → Commit → "Dispute #0 … block 5 … 117,268 gas … chain read-back
    matches the package"; `GET /api/disputes/0` matches = true.
- **Trust boundary (be honest in the pitch).** The witness is logically isolated (separate key, store and
  registry), not physically independent: it runs in the same process on the same laptop. A valid signature proves
  the witness made the claim, not that the claim is true. An omission shows the host stayed silent, not why.

## S05 status (read first)
- Laptop B pulled `60fb9a7` (fast-forward, clean) and took over `main`.
- T-040 steps 1–3 done: `frontend/e2e/story.spec.ts` (page reaches `html.sc-ready`; the browser-computed root equals
  `916a1113…fa390`; CTA href `/attack`; live line "Live now: local chain 31337 · block N · M events anchored" on the
  e2e stack; no console errors; "Story" link in the desktop header) and `/story` added to the responsive routes.
- `npm run test:e2e` → **27 passed, 1 skipped** (run with the demo stack stopped).
- T-040 steps 4–5 done: `start-all.cmd` (production build, 132 events, 1 batch) → `/story` at :3000 reaches `sc-ready`,
  root `916a1113…`, CTA `/attack`, no overflow, and the close shows "Live now: local chain 31337 · block 2 · 132 events
  anchored". Feel-check diff written into BRIEF.md (not cold; 4 chapters match, 3 drift: louder ch2, softer ch4, dense ch5).
- T-041 done: chapter 2's stamp seeps in instead of slamming, the wire and vault stay unseen until chapter 4, chapter 5
  shows the tree then the block, and the vault leaves the close. Checked at 1630×845 and 375×812 on the dev server;
  lint and tsc clean; e2e 27 passed + 1 skipped. Details in BRIEF.md "What changed". KI-025 (phone header overlap) is new.
- API proxy (KI-026): the browser calls `/api/*` on :3000 and `next.config.ts` rewrites it to `LEASH_API_PROXY`
  (default http://127.0.0.1:8000). Verified: e2e 27 passed + 1 skipped through the proxy; Edge with every direct
  request to :8000 blocked still shows live chain status on `/` and `/story`.
- **Next: T-033** (owner rehearsal, ideally including a cold run of `/story` by someone who has not read the brief).

## S04 status
- **HANDOFF NOW from laptop A at the end of S04.** The other laptop continues with T-040. Laptop A may still have
  the demo stack (:8545/:8000/:3000) and the dev server (:3100) running locally; that does not affect git.
- **New route `/story`**: a ScrollCraft scroll story with seven chapters in one continuous world. The visitor's
  scroll performs the cover-up (log lines are erased as you scroll), and the verdict brings them back.
  - Brief, feeling curve, structure and score: `scrollcraft/builds/story/BRIEF.md` (the owner's answers verbatim).
  - Code: `frontend/app/story/` (page + scoped CSS) and `frontend/components/story/` (`story-data.ts`,
    `story-world.tsx`). The app shell renders `/story` without its header or footer.
  - Every hash on the page is real. It is computed in the browser with `lib/verify.ts` (S04: root `916a1113…`,
    server root `3aea88bd…`), and both match the backend's own Python canonical/Merkle code exactly.
  - Linked from the header ("Story", shown at ≥1360 px and in the menu) and from the Dashboard's red band
    ("Watch the story first").
- **Verified in S04, on the dev server (:3100):**
  - ScrollCraft harness at desktop, 390×844 and reduced motion: no dead scroll, every copy block peaks, and contrast
    clears 4.5:1 at the worst frame.
  - No horizontal overflow at 390, 360, 768 or 1280 px.
  - Tab order is logical; the chapter map works by keyboard; focusing the final CTA brings the close on screen.
  - No page errors.
  - Contact sheets: `scrollcraft/builds/story/lab/{desktop,mobile,reduced}/sheet.png`.
- **Not yet verified:** the e2e suite with these changes, and `/story` on the production build at :3000 (the
  running demo stack predates `/story`). See T-040.

## S03 status
- **v2 design APPROVED by the owner and rolled out on every route** (on `main`).
  - Rejected directions, so don't return to them: the flat black dashboard of cards (S01) and the red-and-cream
    newspaper (S02).
  - The rollout applies v2 to global tokens, `.surface`, `PageTitle`, `AlertBanner`, the shell, buttons, the Attack
    Lab and the Guided Demo.
  - The Attack Lab gained hold-to-verify, and each finding opens an "Inspect proof" drawer (the `EvidenceDetail`
    record, Merkle proof and on-chain root).
  - Screenshots of every route at 1440×900 and 390×844: `docs/img/rollout-v2/`. Dashboard review set:
    `docs/img/dashboard-v2/`.
- **Spec:** `docs/design/REFERENCE_SPEC.md` (v2, on the branch). It was re-verified against genuine reel frames; it
  maps each observation to an adaptation and a browser check, lists interactions with timings and reduced-motion
  equivalents, and defines scoped tokens.
- **Baseline at S03 start (`a1ae30a`, fresh fast-forward from laptop B's 12 commits):**
  - backend pytest 90 passed
  - hardhat 9 passing
  - `tsc` and lint clean; `next build` compiled
- **On the branch after Dashboard v2:**
  - Playwright 23 passed, 1 skipped (screenshot spec, CAPTURE only); `tsc` and lint clean
  - Screenshots at 1440×900, 1280×800, 768×1024 and 390×844, clean and tampered: `docs/img/dashboard-v2/`
- **Still open from the S03 brief:**
  - pitch rewrite (90-second + 3-minute + judge Q&A)
  - live judge-demo verification with `scripts\start-all.cmd`, including reset and restart
  - KI-014 wording in the UI, demo and pitch


## Start here (new teammate on a fresh machine)
Follow `docs/handoff/HANDOFF_PROMPT.md` → "Fresh machine": clone, install, set your own repo-local git identity,
then `scripts\start-all.cmd` (Windows) to see the product running. Everything below is the verified state at handoff.

## Project goal
Tamper-evident, independently verifiable security evidence: canonical SHA-256 event hashing, hash
chain, Merkle batches anchored to an append-only EVM contract, a protected evidence vault outside the
compromised host, an attack lab, and a standalone auditor verifier. Hackathon: The Big Hack 2.0, B3.

## Git
- Repo: **public** `sanokiyo1029-sys/leash-blackbox` (made public 2026-11-20 after a secret audit), branch `main`
- Collaborators with write access: `rohanshahare` (accepted, pushed in S02). Anyone else must be invited by the owner
  `sanokiyo1029-sys` (Settings → Collaborators) before they can push.
- **Latest verified code commit: `94a0446`** (redesign). At handoff all suites were re-run on it (results below) and
  `origin/main` matched local; the handoff docs commit that follows changes docs only.
- Commit identity: each contributor uses **their own** GitHub-associated identity, set repo-locally (laptop A:
  `Rohan <…+sanokiyo1029-sys@users.noreply.github.com>`, laptop B: `Rohan R Shahare <258174768+rohanshahare@users.noreply.github.com>`).
- Uncommitted / unpushed state: none at handoff time (verify with `git status`). Local services were stopped.
- **Laptop B (S02):** clone at `C:\Users\<user>\leash-blackbox`, `core.hooksPath .githooks` set. On arrival `gh` was
  authenticated as `lector-sys` (via a `GH_TOKEN` environment variable, READ access only), not `rohanshahare`, and the
  global git identity belonged to neither project account. See "Current blocker". Owner's decision for laptop B:
  repo-local identity `Rohan R Shahare <258174768+rohanshahare@users.noreply.github.com>`; push as `rohanshahare`.

## Phase
Phases 1–4 complete and tested. Phase 6 core (auditor CLI, export, negative tests) done.
Phase 5 web console built and checked manually in a browser; Playwright smoke tests (6) pass.
Phase 7 started: guided presentation mode at `/demo` (T-017) done.
Validation experiments (T-015) done; results committed in `docs/validation/RESULTS.md`.
Pitch script (`docs/PITCH.md`) and real screenshots (`docs/img/`) done (T-019).
Hardening T-020 done (lab gating + ingest token).
**Premium UI transformation (T-024..T-028) done:** design system, Attack Lab split-screen centerpiece,
dashboard, evidence verification panel and auditor batch audit.
**S02:** the remaining screens (Proofs, Validation, Guided Demo, Architecture, auditor full-bundle section) are on the kit
(T-029). The guided demo re-reads the anchored roots from the contract after the attack. One-command start (T-023) done.
Real log-file agent (T-022) done: `agent/tail_agent.py ingest|check`; editing the forwarded file is detected by `check`.
Per-host ingest credentials (T-021) done: `LEASH_HOST_TOKENS` (hashes only); a host token cannot submit another host's events.
Responsive checks (T-030) are automated: no overflow and no console errors at 375/768px on every route.
Reference-driven print/manga redesign (T-032) done: spec in `docs/design/REFERENCE_SPEC.md`.
**Next: presentation rehearsal (owner), `start-all.sh` for macOS/Linux teammates (T-034), optional T-018 testnet.**

## Completed and verified (2026-11-20)
- `LeashAnchor.sol`: append-only batches, on-chain sequence continuity, anchorer allowlist.
  `npx hardhat test` → **9 passing**.
- Backend pipeline: ingest → canonicalize → SHA-256 leaf → hash chain → Merkle batch → real
  transaction on Hardhat → receipt and event checked → verification (host vs vault vs chain).
- Attack lab: cover_tracks, alter_evidence, fabricate_alibi, timestomp, truncate_tail, wipe_all, random_tamper.
- Evidence export (vault/host, full/selective) and `verifier/leash_verify.py` (stdlib only, own Keccak).
- `backend/.venv/Scripts/python -m pytest` → **81 passed** (re-run at handoff).
- `cd blockchain; npx hardhat test` → **9 passing** (re-run at handoff); `npx tsc --noEmit` and `npm run lint` clean.
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
Optional public testnet anchoring
(T-018, needs the owner's key).

## Working commands (verified)
- **Demo day, one command (S02):** `scripts\start-all.cmd` (= `powershell -ExecutionPolicy Bypass -File scripts\start-all.ps1`).
  Starts chain :8545, API :8000, production web :3000, resets the stores for the fresh chain and seeds 120 events.
  Ctrl+C stops all three; `-Stop` cleans up after a closed window; `-Dev` skips the build; `-NoSeed` starts empty.
- `cd blockchain; npm install; npx hardhat test`
- `cd blockchain; npx hardhat node --hostname 127.0.0.1 --port 8545`
- `cd backend; .venv\Scripts\python -m pytest` → **90 passed** (S02, incl. file-agent and per-host token tests; do not add `-q`, see KI-012)
- File agent (stack running): `python agent\tail_agent.py ingest data\demo-auth.log --seal`, then
  `python agent\tail_agent.py check data\demo-auth.log` → MATCHES (exit 0); after deleting/editing a line → TAMPERING_DETECTED (exit 2)
- `cd backend; .venv\Scripts\python -m uvicorn app.main:create_app --factory --port 8000`
- `python verifier\leash_verify.py BUNDLE.json --rpc http://127.0.0.1:8545`
- `cd frontend; npm install; npm run dev` (http://localhost:3000), `npm run build`, `npm run lint`
- `cd frontend; npm run test:e2e` → **27 passed, 1 skipped** (S05: 7 smoke + 2 story + 18 responsive; the screenshot spec is skipped unless CAPTURE=1) (starts its own Hardhat :8546, API :8011, Next :3011;
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
None in the code. For a new teammate: pushing needs a GitHub account with write access (owner invite). If a
`GH_TOKEN` environment variable is set on your machine it overrides `gh auth login`; clear it in that shell
(`$env:GH_TOKEN=''` in PowerShell, `env -u GH_TOKEN` in bash) before pushing.

## Exact next task
**S06 (GHOST, merged):** T-043 and T-045 are done. GHOST P1 next: dispute package committed on-chain, T-044 second witness and 2-of-3 quorum.
T-047 (Quai) is blocked on the owner: confirm the organizer requirement and provide a funded key in a local `.env`.

**S04: T-040 first** (see NEXT_TASKS). Stop the demo stack, run e2e (add the `/story` smoke test), restart
`scripts\start-all.cmd`, check `/story` at :3000 including the live-status line, then write the feel-check diff in
BRIEF.md. After that: T-033 (owner rehearsal).

**S03:** the design is approved and rolled out.
- T-037 (pitch) is done: `docs/PITCH.md` has the 90-second script, the 3-minute walkthrough, the judge Q&A and the
  updated checklist.
- T-038 (live judge demo via `scripts\start-all.cmd`) is verified end to end, including reset/replay and stop/restart.
- **Next: T-033, the owner's spoken rehearsal.** After that the optional items: T-034 (`start-all.sh`) and T-018 (testnet).

S02 notes (still valid):
1. Run the product once: `scripts\start-all.cmd`, open http://localhost:3000/demo, press **Run the full story**.
2. T-034: `scripts/start-all.sh` for macOS/Linux (same behaviour as the `.ps1`: prerequisite + port checks, readiness
   probes, reset + seed, stop only its own PIDs), only if a teammate is not on Windows.
3. Presentation: rehearse with the demo-day checklist at the end of `docs/PITCH.md`; keep the final hours for submission.
4. Optional: T-018 (public testnet; needs the owner's funded key in a local `.env`, never in chat or git).
Keep the e2e selectors working whenever the UI changes: "Run the full story", "Load protected vault evidence",
"Verify in my browser", "status 1 · 1 log", "Protected evidence".

## UI architecture notes (for the next session)
- **Design language (S02): print/manga, from the inspected reference reel.** Spec and what was actually seen:
  `docs/design/REFERENCE_SPEC.md`. Paper background, ink frames, one red, spot colours for status; no gradients, blur
  or glass. The previous dark/glass look is gone (no `.dark` class on `<html>` any more).
- Tokens: `frontend/app/globals.css` `:root` (`--paper`, `--ink`, `--primary` red, `--ok/--warn/--info` spot colours,
  `--spot-yellow`, radius 0.25rem, hard ink offset shadows). Utilities: `.surface` (2px ink frame; use `bg-…!` to
  override its background), `.surface-hover` (hard offset shadow), `.label-caps`, `.ink-grain`, `.hatch`,
  `.speed-lines` (+ `.speed-lines-right`), `.font-hash`, `.tabular`. Display font: Playfair Display (`font-display`).
- Motion: `frontend/lib/motion.ts` (ease, dur, spring, fadeUp, stagger). `MotionConfig reducedMotion="user"` lives in
  `AppShell`, which also renders the pointer-trailing cursor (fine pointer + no reduced motion only).
- Shell: paper top bar with uppercase tabs (red active block) from `xl`, a serif drawer menu below `xl`, chain status
  as a white tag (keeps the "Chain 31337 · block N" text the e2e test reads), ink footer band.
- Components: `frontend/components/kit.tsx` (Panel, PageTitle with `variant="scene"` red band + ink disc or
  `variant="action"` paper + speed lines, MetricCard with serif numbers, AlertBanner print blocks, EmptyState,
  Skeleton/LoadingRows, Spinner, Modal, Reveal, HashChip). Legacy badges remain in `components/status.tsx`.
- Screenshots: `CAPTURE=1 npx playwright test screenshots` (runs with reduced motion so frames are settled).
- Attack Lab: `frontend/app/attack/page.tsx`. Rows are a single 3-column grid on desktop (`lg:contents` wrapper);
  verdicts come only from the explicit `/api/verify` report (never from live diffing), and the on-chain root is
  read directly via `lib/verify.ts readBatch`.
- New API: `POST /api/attacks/erase_record` and `rewrite_record` with `{"params": {"seq": N}}`
  (`GET /api/attacks/scenarios` lists them under `targeted`).
