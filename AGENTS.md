# AGENTS.md — repository instructions for coding assistants

LEASH BLACKBOX: tamper-evident security evidence. Events are canonicalized,
hashed, hash-chained, batched into Merkle trees and the roots are anchored on an
EVM chain. A verifier detects modified / deleted / injected host records.

## Start of every session
1. `git status`, `git fetch origin`, compare `main` with `origin/main`; pull **fast-forward only**.
2. Read `docs/handoff/CURRENT_STATE.md`, then `NEXT_TASKS.md` and `KNOWN_ISSUES.md`.
3. Continue the highest-priority TODO. Do not re-implement features marked DONE.

## Hard rules
- Commit author must be the contributor's own GitHub-associated identity, set repo-locally (`user.name`/`user.email`);
  never commit under someone else's identity.
  Never add `Co-Authored-By` trailers for AI tools, never add "generated with/by" lines, never credit an
  assistant in code, docs or metadata. Enable the guard hook once per clone: `git config core.hooksPath .githooks`.
- Never force-push, never reset/discard uncommitted work, never auto-resolve conflicts by dropping a side.
- Never commit `.env`, keys, tokens, databases (`data/`), `node_modules/`, build output.
- Do not claim something works unless a test or command proved it in this session.
- Only one laptop writes to `main` at a time; the GitHub repo is the source of truth.

## Layout
- `blockchain/` Hardhat 2 project — `contracts/LeashAnchor.sol`, tests in `test/`.
- `shared/LeashAnchor.json` ABI + bytecode exported from Hardhat (regenerate with `npm run export-abi`).
- `backend/app/` FastAPI + SQLAlchemy. Key modules: `service.py` (collector, host agent, anchoring),
  `verify.py` (verification engine), `attack.py` (attack lab), `export.py` (evidence bundles).
- `verifier/leash_verify.py` standalone stdlib-only auditor CLI. Must not import backend code.
- `agent/tail_agent.py` stdlib-only log-file agent (`ingest`, `check`); it imports only `verifier/leash_verify.py`, never backend code.
- `scripts/start-all.ps1` (+ `.cmd`) one-command local start; `-Stop` stops only the processes it started.
- `docs/handoff/` relay documentation. Update `CURRENT_STATE.md` and `SESSION_HISTORY.md` at each checkpoint.

## Checks
- Contract: `cd blockchain && npx hardhat test`
- Backend + verifier: `cd backend && .venv/Scripts/python -m pytest` (starts its own Hardhat node)

## Relay commands from the owner
- `CHECKPOINT` → test, update handoff docs, commit, push, verify remote.
- `HANDOFF NOW` → stop new work, then run the procedure in `docs/handoff/HANDOFF_PROMPT.md`.
- `RESUME` → read handoff docs and continue from the latest verified state.
