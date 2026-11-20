# LEASH BLACKBOX — 3-minute pitch & demo script

> **The attacker can erase the logs. They cannot erase the proof.**

Run the stack with `scripts\start-all.cmd` (or Hardhat node → API → `npm run dev` by hand), open **Live Demo** (`/demo`),
press **Next step** while talking.
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
  - The batch roots are re-read from the contract and still equal the roots anchored before the attack
    ("On-chain commitment unchanged").
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
- 90 backend tests (pipeline, verifier, file agent, per-host auth), 9 contract tests and 23 Playwright end-to-end
  tests (including phone and tablet layouts), all reproducible from the repo.

## 2:50 – 3:00 · Honest limits and next steps
- Events forged at the source after compromise, or suppressed before forwarding, are out of scope. Anchoring
  narrows the window; it cannot close it.
- Already beyond the simulation: a file agent forwards a real syslog/auth.log, and per-host tokens stop one host from
  writing under another host's name.
- Next: public L2 anchoring, mTLS and rate limits on ingest, and SIEM connectors.

## Likely judge questions
| Question | Answer |
|---|---|
| Why a blockchain and not a database? | Whoever runs the vault could rewrite it together with the host. An independent append-only chain lets a third party verify without trusting anyone. We test the "host + vault rewritten" case: it is caught as VAULT_MISMATCH. |
| Is the blockchain real? | Yes. These are real EVM transactions with receipts and `BatchAnchored` events on a local Hardhat chain. Only the network is local; the contract is deployable to any EVM chain. |
| What if the chain is down? | Events stay in the vault and are labelled "vault only", and verification says INCONCLUSIVE, never CLEAN. Batches retry later without gaps (tested). |
| Privacy? | Only 32-byte hashes go on-chain. Bundles can disclose selected records with inclusion proofs. |
| Cost? | One transaction per batch: about 145 gas per event at 1,024 events per batch. |
| Does it work on real log files? | Yes. `agent/tail_agent.py` forwards an auth.log/syslog or JSON-lines file without duplicates. `check` proves the stored evidence on-chain, then lists every erased, altered or injected line of the file. |
| Can a compromised host write logs for another host? | Not with per-host tokens (`LEASH_HOST_TOKENS`, stored as hashes): a token can only submit its own host's events. A compromised host can still lie about itself from then on; that is the "garbage in" limit above. |

## Demo-day checklist
1. **Start:** run `scripts\start-all.cmd` and wait for `LEASH BLACKBOX is running`. If it names a busy port, close
   that program; the script never kills it for you.
2. **Screen:** open http://localhost:3000/demo full-screen and check that the header shows `Chain 31337 · block …`.
3. **Warm-up:** press **Run the full story** once before the judges arrive. It finishes in under 10 s; 7.9 s was
   measured in the e2e run. Step 1 resets everything, so you can rerun it at any time.
4. **Live:** press **Next step** as you talk. Step 6 is the punchline: TAMPERING DETECTED, the 12 erased lines
   recovered, and "On-chain commitment unchanged".
5. **If something breaks mid-demo:** press **Run the full story**. It redeploys the contract and replays all seven
   steps. As a last resort, use the screenshots in `docs/img/`.
6. **Optional terminal moment (real file):** run the four commands in the README's "Forward a real log file"
   section: ingest, check (MATCHES), edit a line, check (TAMPERING_DETECTED).
7. **Stop:** press Ctrl+C in the start window, or run `scripts\start-all.cmd -Stop` if the window was closed.
