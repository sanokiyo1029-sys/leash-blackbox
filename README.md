# LEASH BLACKBOX

> **The attacker can erase the logs. They cannot erase the proof.**

The Big Hack 2.0 · Cybersecurity & Blockchain · Problem B3 — *Logs the attacker can't erase*

An attacker with root on a server can rewrite or delete its logs. LEASH BLACKBOX
makes that tampering **detectable and provable**, even to a third party who trusts neither the
server nor us:

1. Every security event is canonicalized, SHA-256 hashed and linked into a hash chain.
2. A collector outside the host keeps a protected, append-only copy (the evidence vault).
3. Events are batched into Merkle trees; each root is committed to an **append-only smart contract**
   on an independent EVM chain, signed by an anchor key the host never holds.
4. The verifier recomputes everything from what the host still has and compares it with the vault
   and the on-chain commitments. Each record comes out **intact**, **modified** (with a field diff),
   **deleted** (with the original recovered from the vault) or **injected**.
5. Auditors get an evidence bundle (records plus Merkle inclusion proofs) and check it with a
   single-file, dependency-free verifier against any RPC node they trust.

## Architecture

```
 ┌──────────── monitored host (attacker has root) ────────────┐
 │  synthetic telemetry ──► host agent ──► host_logs.db        │  ◄── attack lab edits / deletes / injects here
 └───────────────────────────┬────────────────────────────────┘
                             │ forward at ingest time
 ┌───────────── collector / evidence zone (outside host) ─────┐
 │  canonicalize → leaf = SHA256(00‖record) → chain           │
 │  evidence.db (append-only, SQLite triggers)                 │
 │  batcher → Merkle root ─► anchor service (holds signer key) │
 └───────────────────────────┬────────────────────────────────┘
                             │ anchorBatch(root, chainHead, manifestHash, firstSeq, lastSeq, count)
 ┌──────────────── independent EVM chain ─────────────────────┐
 │  LeashAnchor.sol — append-only, contiguous sequence ranges  │
 └───────────────────────────┬────────────────────────────────┘
                             │ eth_call / receipts
         verifier (backend) · leash_verify.py (auditor CLI, stdlib only)
```

## Quick start (Windows PowerShell; macOS/Linux equivalents in `docs/handoff/SETUP_AND_RECOVERY.md`)

```powershell
cd blockchain; npm install; npx hardhat test; cd ..
python -m venv backend\.venv; backend\.venv\Scripts\python -m pip install -r backend\requirements.txt
# terminal 1: local chain
cd blockchain; npx hardhat node
# terminal 2: API on http://127.0.0.1:8000/docs
cd backend; .venv\Scripts\python -m uvicorn app.main:create_app --factory --port 8000
```

Demo over HTTP (see `/docs` for all endpoints):

```powershell
curl.exe -X POST localhost:8000/api/demo/reset
curl.exe -X POST localhost:8000/api/simulate/traffic -H "content-type: application/json" -d '{\"count\":200,\"include_intrusion\":true}'
curl.exe -X POST localhost:8000/api/verify            # CLEAN
curl.exe -X POST localhost:8000/api/attacks/cover_tracks
curl.exe -X POST localhost:8000/api/verify            # TAMPERING_DETECTED, deleted records recovered
curl.exe "localhost:8000/api/export?source=host" -o host_bundle.json
python verifier\leash_verify.py host_bundle.json --rpc http://127.0.0.1:8545
```

## Tests

- `blockchain/`: `npx hardhat test` — contract behaviour (append-only, contiguity, access control).
- `backend/`: `.venv\Scripts\python -m pytest` — integrity primitives, end-to-end anchoring on a real
  local EVM node, every attack scenario, ground-truth scoring, API, auditor CLI exit codes.

## Measured results

`scripts/run_validation.py` runs on a real local EVM and writes `docs/validation/RESULTS.md`. Latest run:
30 randomized tampering trials (476 tampered records), 100% recall and 100% precision, 0 false alarms
on clean runs, and the independent auditor CLI agreed in 30/30 trials. Each batch costs about 148.5k gas
whatever its size (about 145 gas per event at 1,024 events per batch). Re-run it to reproduce.

## Threat model and limitations (summary)

The attacker fully controls the monitored host, including its log store, but not the collector,
evidence vault, anchor key or chain. Events produced *after* compromise can be forged at the source,
and events not yet forwarded can be suppressed; anchoring narrows but does not remove that window.
The prototype runs all zones on one machine with separate stores and a local Hardhat chain; a
production deployment would put them on separate infrastructure and anchor to a public network.
Full reasoning is in `docs/handoff/ARCHITECTURE_DECISIONS.md`.

## Licence

MIT, see `LICENSE`. Third-party packages keep their own licences.
