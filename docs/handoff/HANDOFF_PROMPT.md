# Continuation guide (send this to whoever continues)

**State at handoff (2026-11-21, S08, laptop B):** the data-hall homepage tour is on **`main`** (fast-forwarded
from `redesign/castle` with the owner's approval).
- Get it: `git fetch origin`, then `git switch main` and `git pull --ff-only`.
- Read `docs/handoff/CURRENT_STATE.md` → "S08 status".
- **Next:** T-054 (walk the data hall on a real phone, measure frame rate on a mid-range GPU), then the backlog in
  `docs/handoff/NEXT_TASKS.md`.

## 1. Fresh machine (once)
Requirements: Git, Node.js 20+, Python 3.11+ (3.12 used on Windows), optionally GitHub CLI.

Windows (PowerShell). Keep the clone at a short path, because pip fails in very deep folders:
```powershell
git clone https://github.com/sanokiyo1029-sys/leash-blackbox.git C:\Users\<you>\leash-blackbox
cd C:\Users\<you>\leash-blackbox
git config core.hooksPath .githooks
git config user.name  "<your name>"
git config user.email "<your GitHub noreply address, from github.com/settings/emails>"
cd blockchain; npm install; cd ..
python -m venv backend\.venv
backend\.venv\Scripts\python -m pip install -r backend\requirements.txt
cd frontend; npm install; cd ..
scripts\start-all.cmd
```
Then open http://localhost:3000/demo and press **Run the full story**. Ctrl+C in that window stops everything.

macOS/Linux: the same steps with `backend/.venv/bin/python`. There is no `start-all.sh` yet (T-034), so run the three
terminals listed in the README "Setup" section.

**To push:** ask the owner (`sanokiyo1029-sys`) to add your GitHub account as a collaborator with Write access, accept
the invitation, then `gh auth login`. If a `GH_TOKEN` variable is set on your machine it overrides that login; clear it
in the shell you push from.

## 2. Prompt for your coding assistant (copy as-is)
```
You are continuing LEASH BLACKBOX (repo: sanokiyo1029-sys/leash-blackbox, branch main). Before any work:
1. Run git status, git fetch origin, and confirm main is not behind/diverged; pull --ff-only if safe.
   Stop and report if there are uncommitted changes or divergence you did not make.
2. Read AGENTS.md, docs/handoff/CURRENT_STATE.md, NEXT_TASKS.md, KNOWN_ISSUES.md, and
   docs/design/REFERENCE_SPEC.md before touching the UI (for the homepage also ADR-008).
3. Re-run the checks listed in CURRENT_STATE.md ("Working commands") to confirm the recorded test status.
4. Continue from the highest-priority TODO task. Do not reimplement DONE features. Do not change the backend,
   contract or verification code unless a task needs it; never fake verification results in the UI.
Rules: commit with my own repo-local git identity only; no AI co-author trailers or AI credits anywhere;
never force-push; never commit secrets, .env files or data/. Keep the e2e selectors working ("Run the full story",
"Load protected vault evidence", "Verify in my browser", "status 1 · 1 log", "Protected evidence").
Checkpoint after each milestone: test → update CURRENT_STATE + SESSION_HISTORY → commit → push → verify that
git ls-remote origin main equals git rev-parse HEAD. Commands from me: CHECKPOINT, HANDOFF NOW, RESUME.
```

## Handoff procedure (for `HANDOFF NOW`)
1. Stop starting new features.
2. `git status`, branch, latest commit, changed/untracked files, current errors.
3. Run the relevant tests.
4. Update CURRENT_STATE.md, SESSION_HISTORY.md, NEXT_TASKS.md, KNOWN_ISSUES.md.
5. Commit coherent progress with your own identity (never discard work; label partial work honestly).
6. `git push origin main`, then confirm `git ls-remote origin main` equals `git rev-parse HEAD`.
7. Print the handoff report with the actual state only.
