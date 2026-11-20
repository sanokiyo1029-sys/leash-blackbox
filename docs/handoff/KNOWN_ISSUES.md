# Known issues

| ID | Area | Description | Severity | Status |
|---|---|---|---|---|
| KI-001 | Environment | On Windows with long paths disabled, Python venv/pip fails in deeply nested folders. Keep the clone at a short, non-OneDrive path. | Medium | Workaround documented |
| KI-002 | Chain | Hardhat node state is in memory; restarting it orphans the active deployment. The backend reports "contract not found"; recover with `POST /api/demo/reset`. | Low (demo) | By design for the prototype |
| KI-003 | Architecture | All trust zones run on one machine in one process; separation is by store files and code boundaries, not OS isolation. | Info | Documented limitation |
| KI-004 | Threat model | Events not yet anchored are protected only by vault separation (labelled `vault_only`). | Info | Documented limitation |
| KI-009 | Security | `/api/events/ingest` uses one shared bearer token (`LEASH_INGEST_TOKEN`), not per-host credentials. A host holding the token could submit events that claim another host's name. Lab endpoints can be disabled with `LEASH_DEMO_MODE=0`. | Medium | Open (T-021) |
| KI-005 | Performance | `/api/events` recomputes the full classification per request (fine for demo scale, O(n) per call). | Low | Open |
| KI-006 | Frontend | The Validation page's trial runner resets demo data and redeploys the contract on every trial (by design; there is a warning on the page). | Info | Documented |
| KI-007 | Frontend | In-browser verification calls the RPC endpoint directly; it works with Hardhat (CORS `*`). Other nodes may need CORS enabled. | Low | Open |
| KI-008 | Frontend | Playwright smoke tests cover the 5 core screens only (not Validation/Architecture). On machines without Edge, set `PW_CHANNEL=chromium` and run `npx playwright install chromium`. | Low | Open |
