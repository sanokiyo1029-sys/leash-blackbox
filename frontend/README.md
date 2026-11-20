# LEASH BLACKBOX — web console

Next.js 16 (App Router) + TypeScript + Tailwind CSS 4 + shadcn/ui + Recharts + Lucide.

All data comes from the FastAPI backend (`NEXT_PUBLIC_LEASH_API_URL`, default `http://127.0.0.1:8000`).
The Auditor Portal and the proof views also talk **directly** to the chain over JSON-RPC and
recompute hashes with WebCrypto (`lib/verify.ts`), so those results do not depend on the backend.

```powershell
npm install
npm run dev        # http://localhost:3000 (needs the backend + Hardhat node running)
npm run build      # type-check + production build
npm run lint
```

| Route | Screen |
|---|---|
| `/` | Security Dashboard |
| `/evidence` | Evidence Explorer (status filter, field diff, Merkle proof, in-browser proof check) |
| `/proofs` | Blockchain Proof Explorer (vault vs on-chain values read directly from the contract) |
| `/attack` | Live Attack Simulation (scenarios, verify, ground-truth score) |
| `/auditor` | Independent Auditor Portal (bundle export/upload, in-browser + reference verification) |
| `/validation` | Randomized detection trials (recall, precision, latency, gas) |
| `/architecture` | Trust boundaries, guarantees, limitations |
