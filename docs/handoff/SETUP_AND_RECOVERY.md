# Setup and recovery

## Required software
- Git 2.40+, GitHub CLI (`gh`) logged in to the repository owner's account
- Node.js 20+ (tested: 24.20) and npm
- Python 3.11+ (tested: 3.13)
- No Docker or Foundry needed

**Windows path-length note:** keep the clone at a short path such as `C:\Users\<you>\leash-blackbox`.
With Windows long paths disabled, pip fails inside deeply nested folders. Avoid OneDrive-synced folders,
because node_modules and SQLite files do not sync well.

## First-time setup
```powershell
git clone https://github.com/<owner>/leash-blackbox.git
cd leash-blackbox
git config core.hooksPath .githooks          # strips AI co-author trailers
git config user.name  "<owner name>"         # repo-local identity of the owner
git config user.email "<owner verified email or GitHub noreply>"
cd blockchain; npm install; cd ..
python -m venv backend\.venv
backend\.venv\Scripts\python -m pip install -r backend\requirements.txt
```
macOS/Linux: use `backend/.venv/bin/python` instead of `backend\.venv\Scripts\python`.

## Environment variables (names only, see `.env.example`)
`LEASH_RPC_URL`, `LEASH_ANCHOR_PRIVATE_KEY`, `LEASH_DATA_DIR`, `LEASH_MAX_BATCH_SIZE`,
`LEASH_CORS_ORIGINS`, `LEASH_DEMO_MODE` (1 = lab endpoints on), `LEASH_INGEST_TOKEN` (bearer token for ingest), `NEXT_PUBLIC_LEASH_API_URL`,
`LEASH_TEST_RPC_URL` (tests only), `LEASH_PYTHON` / `PW_CHANNEL` (Playwright only).
All are optional for local development.

## Run
1. **Blockchain:** `cd blockchain; npx hardhat node` (127.0.0.1:8545, chain id 31337). State is in
   memory and is lost on restart.
2. **Contract deployment:** automatic. The backend deploys on first use (`POST /api/system/deploy` or
   `POST /api/demo/reset`). Manual option: `npx hardhat run scripts/deploy.js --network localhost`.
3. **Backend:** `cd backend; .venv\Scripts\python -m uvicorn app.main:create_app --factory --port 8000`
   (OpenAPI UI at http://127.0.0.1:8000/docs)
4. **Frontend:** `cd frontend; npm install; npm run dev` → http://localhost:3000 (API URL from
   `NEXT_PUBLIC_LEASH_API_URL`, default http://127.0.0.1:8000). Production check: `npm run build`.

## Demo seed / reset
`POST /api/demo/reset` wipes all three stores and deploys a fresh contract. Then:
`POST /api/simulate/traffic {"count":200,"include_intrusion":true}`. That ingests and anchors.

## Verification commands
- `npx hardhat test` (in `blockchain/`)
- `.venv\Scripts\python -m pytest` (in `backend/`). It starts a private Hardhat node on a free port.
  Set `LEASH_TEST_RPC_URL` to use a running node instead.
- Auditor: `python verifier\leash_verify.py bundle.json --rpc http://127.0.0.1:8545 --contract 0x...`
- Frontend: `cd frontend; npx tsc --noEmit; npm run lint; npm run build`
- End-to-end: `cd frontend; npm run test:e2e` (needs backend venv + blockchain node_modules; starts everything itself)
- Validation metrics: `backend\.venv\Scripts\python scripts\run_validation.py --trials 30` (rewrites docs/validation/)

## Regenerating the ABI
After changing the contract: `cd blockchain; npm run export-abi`. This rewrites `shared/LeashAnchor.json`.
Commit it.

## Troubleshooting
- *"anchor contract ... not found on chain"*: the Hardhat node was restarted. Run `POST /api/demo/reset`.
- *Batches stuck `failed`*: the chain was unreachable. Start the node and call `POST /api/batches/seal`,
  which retries failed batches first.
- *pip `ModuleNotFoundError: pip._internal...` during venv creation*: the path is too long. Move the clone.
- *Push goes to the wrong GitHub account*: this repo pins the credential helper locally:
  `git config --local credential.https://github.com.helper ""` followed by
  `git config --local --add credential.https://github.com.helper "!gh auth git-credential"`.
