# Architecture decisions

## ADR-001 Threat model and trust boundaries

**Attacker:** root on the monitored host (`web-prod-01`). Can read, rewrite, delete, insert and
reorder anything in the host's local log store, change timestamps, and wipe it entirely.

**Outside the attacker's reach (assumed):**
| Zone | Prototype implementation | Production equivalent |
|---|---|---|
| Collector + evidence vault | `data/vault/evidence.db`, append-only via SQLite triggers | Separate log collector with WORM / object-lock storage |
| Anchor signer | Node-managed account or `LEASH_ANCHOR_PRIVATE_KEY` held by the anchor service | HSM/KMS key in a separate service |
| Blockchain | Local Hardhat EVM node (chain id 31337) | Public L1/L2 or a consortium chain the defender does not control alone |
| Auditor | `verifier/leash_verify.py` + their own RPC endpoint | Same |

**What we claim:** for any event that reached the collector, later modification, deletion or
injection on the host is detected; for any event in an anchored batch, the original content is
provable to a third party against an on-chain commitment fixed at anchoring time.

**What we do not claim:**
- Events generated *after* compromise can be forged at the source (garbage in).
- Events the attacker suppresses *before* forwarding never reach the collector. Forwarding at ingest
  time keeps that window to the forwarding latency.
- Events in the vault but not yet anchored are protected only by storage separation, not by the chain.
  The UI and reports label them `vault_only`.
- The prototype runs every zone on one machine in one process. Separation is enforced by separate
  store files and by the attack lab receiving only a host-store session, not by OS isolation.

## ADR-002 Why a blockchain (and not just the vault)

The vault alone lets us *recover* deleted records, but whoever operates the vault could rewrite it
together with the host, and an outside auditor would have to trust us. The chain gives an
independently held, append-only, timestamped commitment. After anchoring, a coordinated rewrite of
host and vault is still detected (`test_out_of_model_vault_tampering_is_caught_by_chain`). The
auditor needs only the bundle and an RPC endpoint; they do not trust our backend at all.

## ADR-003 Hashing strategy

- **Canonical JSON:** sorted keys, compact separators, UTF-8, values limited to strings, integers
  (|n| ≤ 2^53−1), lists, objects and null. Floats and booleans are rejected so every implementation
  produces identical bytes without full RFC 8785 number formatting. Schema version `v: 1` is inside
  every record.
- **Leaf:** `SHA256(0x00 ‖ canonical)`. **Node:** `SHA256(0x01 ‖ L ‖ R)`. The domain prefixes stop a
  leaf being passed off as an interior node (second-preimage attacks).
- **Odd nodes** are promoted unchanged rather than duplicated (avoids the CVE-2012-2459 class).
- **Hash chain:** `chain_n = SHA256(0x02 ‖ chain_{n-1} ‖ leaf_n)`, genesis = 32 zero bytes. The chain
  head after each batch is anchored, so ordering and continuity are committed as well as membership.
- **Manifest:** batch metadata + all leaf hashes, canonicalized; its SHA-256 is anchored too.
- SHA-256 rather than Keccak for evidence hashing: it is the standard forensic and court-familiar
  digest, and auditors can recompute it with any tool. Keccak appears only for ABI selectors.

## ADR-004 Contract design (`LeashAnchor.sol`)

- Append-only array of batches. The only state-changing functions are `anchorBatch`, `setAnchorer`
  and `transferOwnership`. No update or delete path exists (asserted by a test over the ABI).
- Enforces `firstSeq == previous lastSeq + 1` (first batch starts at 1) and
  `eventCount == lastSeq − firstSeq + 1`. Gaps, overlaps or re-anchoring a range revert.
- Stores the root, chain head, manifest hash, range, `block.timestamp`, block number and submitter.
  It emits `BatchAnchored` with batch id, root and submitter indexed.
- Access control: owner-managed anchorer allowlist. A compromised anchorer key could append bogus
  *future* batches but could never alter past ones.
- Solidity 0.8.24, optimizer on, custom errors.

## ADR-005 Storage separation

Three SQLite files: host (attackable), vault (evidence, batches, deployments, verification runs) and
lab (attack ground truth, used only for scoring, never read by the verifier). SQLite was chosen for
the prototype: zero setup, single file per trust zone, real transactions. The vault uses
`BEFORE UPDATE/DELETE` triggers. Assigning a batch id to an event is the only permitted mutation,
and anchored batch rows are frozen.

## ADR-006 Toolchain

- Hardhat 2.29 (npm) instead of Foundry: Foundry was not installed, and its Windows binary would need
  a separate download. Hardhat gives compile, tests and a real local JSON-RPC EVM node.
- Python web3.py v7 for anchoring. The **auditor verifier is stdlib-only** and re-implements
  canonicalization, Merkle, chain, Keccak-256 (validated against ethers.js) and ABI decoding. That
  gives two independent implementations; a test checks they agree.
- Demo reset deploys a **new contract** rather than reusing one, because sequence continuity is
  enforced on-chain and the vault restarts at seq 1.

## ADR-007 Rejected alternatives

- *Storing full events on-chain:* cost, privacy (logs contain PII) and no extra security over a root.
- *One transaction per event:* too slow and costly; batching plus inclusion proofs gives the same
  guarantees per event.
- *A database posing as a ledger:* rejected by the problem statement and by the threat model.
- *Bitcoin-style odd-leaf duplication:* ambiguous trees. Promotion is used instead.
- *Host-side signing keys:* the attacker owns the host, so any key there is theirs.

## ADR-008 Homepage 3D tour (S08)

- **What:** `/` walks a judge through one case in a data hall (`components/datacenter-scene.tsx`): entrance, host
  rack `web-prod-01`, the network tap as the independent witness, the evidence vault, the verification wall.
- **Stack:** `three` 0.187 + `@react-three/fiber` 9.8, loaded with `next/dynamic` (`ssr: false`) on `/` only, so no
  other route ships three.js. `frameloop="demand"`: the scene renders only when scroll or state changes. Bloom uses
  three's own `EffectComposer` / `UnrealBloomPass`; no drei or postprocessing package was added.
- **Assets:** procedural geometry; server fronts, LEDs and screens are canvas textures drawn at runtime. Surfaces use
  CC0 Poly Haven 1K maps and one HDRI (6.8 MB, listed in `frontend/public/tour/SOURCES.md`). No photographs.
- **Fallback:** the 3D scene runs only with WebGL2 and without reduced motion. Otherwise, and while it loads, the page
  shows `public/tour/poster-{dark,light}.jpg` and the same steps still reach the verdict (e2e covers both paths).
- **What is real:** only the Verify step. The browser recomputes the leaf hash and Merkle root from the
  `/api/events/{seq}` proof (`lib/verify.ts`) and reads the anchored root from the chain over JSON-RPC itself; if it
  cannot, it uses the API's chain read and says so. The host log, the witness and the vault before that step are a
  labelled demo fixture. Page, scene and Wick share one store (`lib/case-state.ts`).
- **Rejected:** the medieval castle (S07) and the procedural fortress (S08 first pass), because the owner found them
  too cartoonish for a cybersecurity product; the knight art for Wick, for the same reason.
- **Open cost:** soft shadows and bloom are the expensive parts; not yet profiled on a mid-range GPU or a real phone
  (KI-035, T-054).
