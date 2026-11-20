# LEASH BLACKBOX — pitch and demo script

> **The attacker can erase the logs. They cannot erase the proof.**

The Big Hack 2.0 · Track 02, Cybersecurity and Blockchain · Problem B3, Logs the Attacker Can't Erase

**Sources and evidence.** Every number below comes either from a live demo action (marked ▶) or from
[`validation/RESULTS.md`](validation/RESULTS.md) (marked 📏). All 📏 figures were measured on a **local Hardhat EVM**
(chain id 31337, automine). On a public chain, add block time and confirmation depth; gas cost depends on that
chain's fees.

---

## A. The 90-second pitch (non-technical judges)
Screen: `http://localhost:3000/demo`, full screen, after one warm-up run. Press **Next step** on each cue.

| Time | Say | Do / show |
|---|---|---|
| 0:00–0:12 | "When attackers break into a server, the first thing they do is delete the logs that show what they did. Afterwards, everyone has to trust evidence the attacker controlled." | Title screen |
| 0:12–0:30 | "LEASH copies every security event off the server the moment it happens. It seals a fingerprint of those events on a blockchain that the attacker can't reach and nobody can edit." | ▶ Scene 1 (fresh server, contract deployed), then scene 2 (events collected and anchored; the real transaction hash shows) |
| 0:30–0:40 | "First we check the server against that seal: everything matches." | ▶ Scene 3, CLEAN |
| 0:40–0:58 | "Now I'm the attacker with full control. I delete every line that mentions me and add some fake 'normal' logins. Looking at the server alone, nothing happened." | ▶ Scenes 4–5 (12 lines erased, 3 fabricated) |
| 0:58–1:15 | "We check again. LEASH reports exactly which lines were erased, recovers the originals, and flags the fakes. The seal on the blockchain never changed." | ▶ Scene 6: TAMPERING DETECTED, 12 erased recovered, 3 fabricated |
| 1:15–1:30 | "And you don't have to trust us. Any auditor can recheck it in their own browser against the blockchain." | ▶ Scene 7: the server's logs come back TAMPERING DETECTED and the protected evidence VERIFIED |

**Close:** "Attackers can still erase the logs. They can't erase the proof." If time allows: in 30 randomized tests
it caught 476 of 476 tampered records, with no false alarms 📏.

## B. Three-minute technical walkthrough
1. **Threat model (0:00–0:25).**
   - The attacker has root on the monitored host and can edit, delete, insert or retime any local log line.
   - Outside their reach: the collector and evidence vault, the anchoring key, and the chain.
   - ▶ The Attack Lab's left column *is* that host log store; every toolkit action is a real write to it.
2. **Evidence lifecycle (0:25–0:50).**
   - The host agent forwards each event at ingest. The collector assigns a sequence number and canonicalizes the
     record (sorted-key JSON, strings and integers only).
   - Leaf = `SHA-256(0x00 ‖ record)`. Hash chain: `chain = SHA-256(0x02 ‖ prev ‖ leaf)`.
   - ▶ Dashboard "Evidence lifecycle" band: host / vault / chain counts side by side.
3. **Merkle batching and anchoring (0:50–1:20).**
   - Events are batched into a Merkle tree (node = `SHA-256(0x01 ‖ L ‖ R)`). The anchor service calls
     `LeashAnchor.anchorBatch(root, chainHead, manifestHash, firstSeq, lastSeq, count)`.
   - The contract has no update or delete function and rejects gaps or overlaps in sequence numbers.
   - ▶ Proof Explorer: vault values vs values read directly from the contract, with the receipt status and its log.
   - 📏 About 148.5k gas per batch whatever its size, which is about 145 gas per event at 1,024 events per batch.
4. **Protected storage (1:20–1:35).**
   - The vault is append-only (database triggers block UPDATE and DELETE), so an erased host line can be recovered.
   - The chain makes even the vault accountable: rewriting host and vault together is still caught, as a vault/chain
     mismatch (tested).
5. **Independent verification (1:35–2:15).**
   - The verifier recomputes leaves from what the host still holds and compares them with the vault and the on-chain
     roots. Every record comes out intact, altered (with a field diff), erased (original recovered and proven) or
     fabricated.
   - ▶ Attack Lab: hold to verify; each finding → **Inspect proof** opens the record, its leaf, the Merkle path and
     the on-chain root, and "Verify against chain" recomputes it in the browser.
   - Three independent implementations agree: the backend (Python), the stdlib-only auditor CLI, and the browser
     (WebCrypto).
6. **Measured results (2:15–2:40).**
   - 📏 30 randomized trials, 476 tampered records: 100% recall, 100% precision, 0 false alarms on clean runs;
     the CLI agreed in 30 of 30.
   - 📏 Verifying 5,000 events takes about 0.8 s. Every named scenario (cover tracks, alter, fabricate, timestomp,
     truncate, wipe) was detected exactly.
   - These numbers test implementation correctness. Detection is a deterministic hash comparison, not a statistical
     model.
7. **Limitations (2:40–3:00).** See the last Q&A rows: forging at the source, the pre-anchor window, everything on
   one machine in the prototype, and local-chain figures.

## C. Judge Q&A
| Question | Answer (and where to show it) |
|---|---|
| **Why a blockchain? Isn't a database enough?** | Whoever runs the database can rewrite it along with the host. An independently held, append-only chain fixes each batch's root at a known block, so a third party can verify without trusting us or the server owner. ▶ Proof Explorer shows the contract value; the test where host and vault are rewritten together reports a vault/chain mismatch. |
| **Why not just hash the logs locally?** | Hashes stored on the compromised host can be recomputed by the attacker after editing. Signing locally fails too, because the key is on the host. The commitment has to leave the host and land somewhere the attacker can't rewrite. |
| **What can a host compromise still affect?** | Events forged at the source after the compromise, and events suppressed before they are forwarded. Everything already forwarded and anchored is out of reach. ▶ Attack Lab: the attacker can rewrite the host column but not the commitment. |
| **What if the evidence itself is lost or erased?** | Erased host lines are recovered from the vault and proven against the anchored root (▶ "erased, original recovered"). If the vault were lost, the chain still proves *that* the host's data changed (the root can't be rebuilt), but not the original content, so the vault needs normal backups. |
| **What do you assume about the chain?** | That it is append-only and independently operated (a public L1/L2 or a consortium chain), and that auditors use an RPC endpoint and contract address they trust. The prototype uses a local Hardhat chain (📏 figures are local). Public testnet anchoring is optional work (T-018). |
| **The pre-anchor window?** | Events in the vault but not yet anchored are protected only by vault separation. The UI labels them "vault only / not verified yet". Batching more often shrinks the window; each batch costs one transaction (about 148.5k gas 📏). |
| **Chain or API outages?** | Verification reports INCONCLUSIVE, never CLEAN, when the chain can't be reached. Unanchored batches retry later without gaps, because the contract enforces sequence continuity (tested). |
| **How independent is the auditor?** | The auditor CLI is one stdlib-only Python file with its own Keccak-256. The browser check uses WebCrypto and direct JSON-RPC. Neither trusts our backend. ▶ Auditor page: "Verify in my browser" vs the reference CLI (they agreed on the same missing records in the live check). |
| **Which check covers what? (KI-014)** | The Dashboard and Attack Lab verify the **host's log database** that the lab simulates. For a **real log file** forwarded by `agent/tail_agent.py`, run `python agent/tail_agent.py check <file>`. Editing that file after forwarding is caught by `check` (exit 2), not by the Dashboard (verified live on 2026-11-20). |
| **Why does this matter for Indian organisations?** | CERT-In's April 2022 directions require service providers and organisations to keep ICT system logs for 180 days, within India, and to report incidents within 6 hours. Logs that can be tampered with undermine both. LEASH helps show that the logs handed to investigators are the logs that were written. It supports these obligations; it is not a compliance certification. |
| **Cost and privacy?** | Only 32-byte digests go on-chain, never log content. An auditor can be given a selective bundle with inclusion proofs for just the relevant records. |

## Demo-day checklist
1. **Start:** run `scripts\start-all.cmd` and wait for `LEASH BLACKBOX is running` (about 1–2 min, because it builds
   the production web console). If it names a busy port, close that program; the script never kills it for you.
2. **Screen:** open http://localhost:3000/demo full-screen and check that the header shows `Chain 31337 · block …`.
3. **Warm-up:** press **Run the full story** once before the judges arrive (under 10 s). Scene 1 resets everything, so
   you can rerun it any time; the S03 live check ran it twice back to back.
4. **Live:** press **Next step** as you talk (script A). Scene 6 is the punchline.
5. **Deeper questions:** Attack Lab → **Hold to verify** → pick a finding → **Inspect proof** → **Verify against
   chain**. Auditor → **Load host's current logs** → **Verify in my browser**.
6. **If something breaks mid-demo:** press **Run the full story** (it redeploys the contract and replays everything).
   As a last resort, use the screenshots in `docs/img/rollout-v2/`.
7. **Optional real-file moment:** use the README's "Forward a real log file" commands: ingest, check (MATCHES), edit a
   line, check (TAMPERING_DETECTED).
8. **Stop:** press Ctrl+C in the start window, then answer **Y** to "Terminate batch job (Y/N)?". If the window was
   closed instead, run `powershell -ExecutionPolicy Bypass -File scripts\start-all.ps1 -Stop`.
