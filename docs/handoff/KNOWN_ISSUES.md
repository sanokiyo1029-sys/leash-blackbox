# Known issues

| ID | Area | Description | Severity | Status |
|---|---|---|---|---|
| KI-001 | Environment | On Windows with long paths disabled, Python venv/pip fails in deeply nested folders. Keep the clone at a short, non-OneDrive path. | Medium | Workaround documented |
| KI-002 | Chain | Hardhat node state is in memory; restarting it orphans the active deployment. The backend reports "contract not found"; recover with `POST /api/demo/reset`. | Low (demo) | By design for the prototype |
| KI-003 | Architecture | All trust zones run on one machine in one process; separation is by store files and code boundaries, not OS isolation. | Info | Documented limitation |
| KI-004 | Threat model | Events not yet anchored are protected only by vault separation (labelled `vault_only`). | Info | Documented limitation |
| KI-009 | Security | `/api/events/ingest` uses one shared bearer token (`LEASH_INGEST_TOKEN`), not per-host credentials. A host holding the token could submit events that claim another host's name. Lab endpoints can be disabled with `LEASH_DEMO_MODE=0`. S02: per-host tokens (`LEASH_HOST_TOKENS`) bind each token to one host name; the shared token still allows any host if it is set. No mTLS, rate limits or audit log of API calls. | Low | Mitigated (T-021) |
| KI-005 | Performance | `/api/events` recomputes the full classification per request (fine for demo scale, O(n) per call). | Low | Open |
| KI-006 | Frontend | The Validation page's trial runner resets demo data and redeploys the contract on every trial (by design; there is a warning on the page). | Info | Documented |
| KI-007 | Frontend | In-browser verification calls the RPC endpoint directly; it works with Hardhat (CORS `*`). Other nodes may need CORS enabled. | Low | Open |
| KI-008 | Frontend | Playwright smoke tests cover the 5 core screens only (not Validation/Architecture). On machines without Edge, set `PW_CHANNEL=chromium` and run `npx playwright install chromium`. | Low | Open |
| KI-010 | Frontend | Proofs, Validation, Guided Demo, Architecture and the lower Auditor section used the first-generation styling. Restyled on the kit in S02. | Low | Resolved (T-029) |
| KI-012 | Tooling | `backend/pytest.ini` already sets `addopts = -q`; running `pytest -q` on top makes it `-qq`, which hides the "N passed" summary line. Run `python -m pytest` without `-q`. | Info | Documented |
| KI-014 | File agent | `tail_agent.py`: edits to a forwarded file are detected by `check`, not by `/api/verify` (which compares the simulated `host_logs.db`). Records are matched to the file by basename (two hosts with the same file name would mix). RFC 3164 lines get the current year and UTC. Each poll re-reads the whole file to hash the sent prefix. A legitimate rotation needs a new `--state` file. Adjacent edits inside one diff block may be attributed as ALTERED/ERASED in a different pairing (still TAMPERING_DETECTED). | Low | Documented |
| KI-013 | Environment | The start script refuses to run if 8545, 8000 or 3000 is in use (it never kills foreign processes). The API PID it records is the venv launcher; the real interpreter is a child, so `-Stop` uses a tree kill. | Info | By design |
| KI-011 | Frontend | The Attack Lab's attack highlights (amber/crimson before verification) come from this browser session's own actions; after a reload only the verifier's verdicts (from a new verification) are shown. | Info | By design |
