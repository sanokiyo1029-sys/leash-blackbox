# Split handoff: frontend here (laptop A), backend there (laptop B)

_Written 2026-11-21 (S09, laptop A). Updated as laptop A works; the last section is filled in when A stops._

## Who writes where (so both laptops can work at once)
- **Laptop A (frontend):** branch **`frontend/obsidian`** only. Touches `frontend/` and docs; no backend, contract or
  verifier files.
- **Laptop B (backend):** branch **`main`** (or its own branch). Touches `backend/`, `blockchain/`, `verifier/`,
  `agent/`, `scripts/`; avoids `frontend/` except API types it needs (`frontend/lib/types.ts`), so merges stay easy.
- **Integration (laptop B, after A has stopped):** merge `frontend/obsidian` into `main`, rerun every check, push.

## Prompt for laptop B (paste as-is)

```text
You are continuing LEASH BLACKBOX (repo sanokiyo1029-sys/leash-blackbox). Two laptops are working in parallel:
laptop A did frontend on branch frontend/obsidian; you own the backend and the final integration on main.
Before any work: git status, git fetch origin, confirm main is not diverged, pull --ff-only. Stop and report on
uncommitted changes or divergence you did not make. Read AGENTS.md, docs/handoff/CURRENT_STATE.md, NEXT_TASKS.md,
KNOWN_ISSUES.md and docs/handoff/SPLIT_HANDOFF.md (this file, last section first).

1. Backend, highest priority first (only these files: backend/, blockchain/, verifier/, agent/, scripts/):
   - T-046: auditor CLI verifies witness signatures and the omission rule offline, or document it as hash-only
     if stdlib-only secp256k1 recovery is too risky; it must agree with the backend on the same bundle.
   - T-034: scripts/start-all.sh for macOS/Linux, matching start-all.ps1 (stops only its own processes).
   - T-049: research docs from executed experiments only (every number reproducible by a script).
   - T-047 / T-018 stay owner-blocked (funded keys in a local .env, never in git or chat).
2. Integrate: git merge --no-ff origin/frontend/obsidian into main. Resolve conflicts by keeping both sides
   (never drop one). If the frontend shows a new verdict or field you added, wire it in frontend/lib/types.ts and
   the Attack Lab only.
3. Checks (stop the demo stack first, KI-022; if the site looks unstyled after a build, delete
   frontend/.next/cache/turbopack and rebuild, KI-039): blockchain npx hardhat test; backend .venv python -m pytest;
   frontend npx tsc --noEmit -p . and npx eslint . and npx playwright test; a production build via scripts\start-all.cmd.
4. Update CURRENT_STATE + SESSION_HISTORY, commit with my repo-local identity (no AI credits), push main, and verify
   git ls-remote origin main equals git rev-parse HEAD.
Never force-push. Keep the e2e selectors in AGENTS.md working. Never fake verification results in the UI.
```

## Laptop A progress (frontend/obsidian)
- Started from `main` at `25467c6` (homepage rack hero + T-044).
- **Done:** the homepage's Obsidian look carried across every route through shared pieces only (no per-page redesigns;
  evidence screens stay precise):
  - palette: dark is neutral obsidian (`--paper #0b0c0f`, `--card #17191e`), light is pale marble; corners rounder
    (`--radius 0.75rem`);
  - display font: Instrument Serif, uppercase, weight 400 for every `font-display` heading (`app/globals.css`);
  - header: pill navigation with a sliding active pill; chain status and the theme control as pills
    (`components/app-shell.tsx`, `components/theme-control.tsx`); buttons are pills (`components/ui/button.tsx`);
  - fix: the hero rack now renders under reduced motion (it draws on demand; `components/monolith-scene.tsx`).
- **Checks on the branch's final code:** tsc + eslint clean; Playwright **29 passed, 1 skipped**; production build via
  `start-all.cmd`; every route captured at 1440 and 375 in both themes: no horizontal overflow, no page errors.

## When laptop A stopped
- Branch **`frontend/obsidian`** is pushed; its last commit is the one that added this section.
- `git merge-tree` preview against `main` at `acad9ab` (laptop B's T-046): **merges cleanly, no conflicts.**
  The only frontend file laptop B changed since `25467c6` is `frontend/app/auditor/page.tsx` (one line).
- Nothing on laptop A is uncommitted. Laptop A's demo stack may still be running at :3000; it does not affect git.
- Not done on laptop A: a real-phone check of the rack hero, frame rate of the rack on a weak GPU.
- **Laptop B: follow the prompt above** (backend first, then `git merge --no-ff origin/frontend/obsidian`, rerun every
  check with the stack stopped, push `main`, verify `git ls-remote origin main` = HEAD).
