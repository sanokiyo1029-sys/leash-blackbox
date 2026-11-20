# LEASH BLACKBOX — 3-minute pitch & demo script

> **The attacker can erase the logs. They cannot erase the proof.**

Run the stack (Hardhat node → API → `npm run dev`), open **Live Demo** (`/demo`), press **Next step** while talking.
Every number on screen is produced live; the figures below come from `docs/validation/RESULTS.md`.

## 0:00 – 0:25 · The problem (Impact)
- When an attacker gets root, the first thing they do is delete or rewrite the logs (MITRE ATT&CK T1070).
- Incident responders, insurers and regulators then have to trust logs the attacker controlled.
- Local log signing does not help: the signing key sits on the compromised machine.

## 0:25 – 1:00 · How it works (Innovation, Technical depth) — steps 1–3
- Each event is canonicalized and hashed (`SHA256(0x00 ‖ record)`), then linked into a hash chain.
- An independent collector forwards events immediately to an append-only evidence vault.
- Batches are rolled into Merkle trees. The root, the chain head and a manifest hash are anchored by the
  **LeashAnchor** contract.
  - The contract has no update or delete path and enforces contiguous sequence numbers on-chain.
  - The signing key never touches the host.
- *On screen:* the contract is deployed, events are anchored with a real transaction hash and gas, and the
  baseline verification is **CLEAN**.

## 1:00 – 1:45 · The attack (Presentation) — steps 4–6
- "We are root now." `sed -i '/203.0.113.45/d'` erases the whole kill chain, then fake admin logins are added.
- *On screen:* re-verification reports **TAMPERING DETECTED**.
  - All 12 erased records are recovered from the vault and proven against the anchored Merkle root.
  - The 3 fabricated records are exposed.
  - The evidence explorer shows field-level diffs and the Merkle inclusion proof for any record.

## 1:45 – 2:20 · Don't trust us: independent audit (Innovation, Evidence) — step 7
- The auditor's browser recomputes every hash with WebCrypto and reads the contract directly over JSON-RPC.
  Our backend is not involved.
- *On screen:* the server's logs come back **TAMPERING DETECTED** (12 missing, 3 uncommitted), while the
  protected evidence is **VERIFIED**.
- There are three independent implementations of the hashing spec (backend, stdlib-only CLI, browser), and
  they agree.
- Selective disclosure: share only the records that matter, each with its own inclusion proof.

## 2:20 – 2:50 · Evidence (Evidence)
- 30 randomized tampering trials, 476 tampered records: **100% recall and 100% precision**, and 0 false alarms
  on clean runs. The independent CLI agreed in **30/30** trials.
- Every attack scenario (cover tracks, alter, fabricate, timestomp, truncate, wipe) is detected exactly.
- On-chain cost is about 148.5k gas per batch, whatever its size, which is about **145 gas per event** at
  1,024 events per batch. Full verification of 5,000 events takes about 0.8 s.
- 78 backend tests, 9 contract tests and 6 Playwright end-to-end tests, all reproducible from the repo.

## 2:50 – 3:00 · Honest limits and next steps
- Events forged at the source after compromise, or suppressed before forwarding, are out of scope. Anchoring
  narrows the window; it cannot close it.
- Next: public L2 anchoring, per-host ingest authentication, and SIEM/syslog connectors.

## Likely judge questions
| Question | Answer |
|---|---|
| Why a blockchain and not a database? | Whoever runs the vault could rewrite it together with the host. An independent append-only chain lets a third party verify without trusting anyone. We test the "host + vault rewritten" case: it is caught as VAULT_MISMATCH. |
| Is the blockchain real? | Yes. These are real EVM transactions with receipts and `BatchAnchored` events on a local Hardhat chain. Only the network is local; the contract is deployable to any EVM chain. |
| What if the chain is down? | Events stay in the vault and are labelled "vault only", and verification says INCONCLUSIVE, never CLEAN. Batches retry later without gaps (tested). |
| Privacy? | Only 32-byte hashes go on-chain. Bundles can disclose selected records with inclusion proofs. |
| Cost? | One transaction per batch: about 145 gas per event at 1,024 events per batch. |
