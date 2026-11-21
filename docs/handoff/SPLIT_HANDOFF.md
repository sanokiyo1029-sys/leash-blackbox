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
- Started from `main` at `25467c6` (homepage rack hero + T-044 already merged).
- In progress: carrying the homepage's Obsidian look across every route through the shared components.

## When laptop A stopped
_(filled in at the end)_
