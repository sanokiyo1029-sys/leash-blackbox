# Continuation prompt (copy into the next session)

```
You are continuing LEASH BLACKBOX (repo: leash-blackbox, branch main). Before any work:
1. Run git status, git fetch origin, and confirm main is not behind/diverged; pull --ff-only if safe.
   Stop and report if there are uncommitted changes or divergence you did not make.
2. Read AGENTS.md, docs/handoff/CURRENT_STATE.md, NEXT_TASKS.md, KNOWN_ISSUES.md.
3. Re-run the checks listed in CURRENT_STATE.md to confirm the recorded test status.
4. Continue from the highest-priority TODO/IN_PROGRESS task. Do not reimplement DONE features.
Rules: commit as the repo-local git identity only, no AI co-author trailers or AI credits anywhere,
never force-push, never commit secrets. Checkpoint (test → update CURRENT_STATE + SESSION_HISTORY →
commit → push → verify remote) after each milestone. Commands from the owner: CHECKPOINT, HANDOFF NOW, RESUME.
```

## Handoff procedure (for `HANDOFF NOW`)
1. Stop starting new features.
2. `git status`, branch, latest commit, changed/untracked files, current errors.
3. Run the relevant tests.
4. Update CURRENT_STATE.md, SESSION_HISTORY.md, NEXT_TASKS.md, KNOWN_ISSUES.md.
5. Commit coherent progress with the owner's identity (never discard work; label partial work honestly).
6. `git push origin main`, then confirm `git ls-remote origin main` equals `git rev-parse HEAD`.
7. Print the handoff report in the agreed format, with actual state only.
