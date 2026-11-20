# BRIEF: LEASH BLACKBOX story (`/story`)

Interviewed. The owner answered all eight questions on 2026-11-20. Their answers are reproduced verbatim at the end
of this file. The sections before them are the decisions derived from those answers.

## Scope (owner accepted the recommendation by not changing it)
- A new route, `/story`, inside the existing Next.js console. It has its own full-bleed chrome; the console routes,
  their tests and their selectors are untouched.
- The story is a labelled simulation built from 16 sample records. Every hash on screen is real: SHA-256 computed in
  the visitor's browser with `frontend/lib/verify.ts`, the same code the Auditor's browser check uses, following the
  backend's Merkle rules (`backend/app/merkle.py`).
- The close hands off to the working product: **Enter live Attack Lab** (`/attack`). When the API is reachable, the
  close also shows live local-chain status.
- Assets: none generated, nothing paid. Typography, SVG, a canvas particle field, and one real product screenshot
  (`docs/img/rollout-v2/attack-1440x900.png`).

## Grammar: continuous world (uniqueness.md §2.4)
The owner asked for "ONE UNBROKEN CINEMATIC WORLD" where the camera travels Server → Event stream → Compromised
host → Protected vault → Blockchain → Verification → Live demo. That is literally travel through a place with
geography, so this grammar was chosen.
- Filmic one-shot lost because it forbids the chapter indicators and skip control the owner asked for.
- Chaptered editorial lost because it requires hard cuts.
- Live surface lost because it bans display type, and the peak is "TAMPERING DETECTED fills the screen".
- Typographic poster, gallery, split stage and cutlist each fail the one-world requirement.

**Adaptation.** The engine's worldflight mode is built for video legs, and this world is procedural. So it is a
bespoke fixed stage driven by page-local code.
- One `position: fixed` world, one fixed copy layer, and nothing in document flow except an invisible scroll track.
  The track is split into seven empty `flow` markers so the harness can sample per chapter.
- The camera is a projection (x, y, zoom) over a single world. The host, vault, Merkle tree, chain and console plate
  are all mounted at once at fixed world positions; nothing cuts and nothing un-pins.
- The stage reports its painted state through `data-sc-verify-state`, as verify.md prescribes for bespoke stages.

**Nav = map.** A rail of seven named waypoints that you can click and Tab to, plus one persistent "Enter live Attack
Lab" control. There are no numeric counters.

## Signature move: the scroll is the attack
In chapter 3 the visitor's own scroll performs the cover-up.
- Each log line the visitor scrolls past is selected by a red sweep, cut out of the paper log, and the lines below
  close the gap.
- The attacker's command types itself one character per increment of scroll.
- Scrolling back un-erases, because scroll is time.

In chapter 6 the same lines fly back from the vault along the wire they originally left by, and drop into their
holes, each marked with a verified Merkle proof.

## Journey
1. **Normal.** The host's paper log writes itself, one line per stretch of scroll; each line quietly leaves along a
   wire.
2. **Intrusion.** Failed passwords from one address, then one that works, then root.
3. **Cover-up.** The visitor erases the trail. The log looks clean, and the screen goes still.
4. **The evidence already left.** The camera follows the intruder's login line along the wire it left by, into the
   vault, where every original line still is.
5. **The seal.** The vault records hash up into a Merkle root, and the root drops into a block that locks.
6. **The verdict.** The verifier recomputes the root from what the host still holds; it does not match. TAMPERING
   DETECTED fills the screen, and the erased lines return.
7. **Prove it yourself.** The world calms at the real Attack Lab, with one button.

## Feeling curve (written before the score)
| # | Emotion | What on screen causes it |
|---|---|---|
| 1 | Curiosity, comfort | A warm paper log writing itself in a dark, quiet room; slow motes; generous space |
| 2 | Unease | The camera closes in and tilts a hair; three red gutter marks arrive fast; one word: root |
| 3 | Complicity, then loss | "You have root now." The visitor's scroll cuts lines out; then silence, a small clean log alone in the dark |
| 4 | Surprise | A thin light along a wire nobody noticed, and the camera follows it into a vault where everything still is |
| 5 | Intrigue | Precise motion: hashes fold upward into one root; the root drops into a block that locks |
| 6 | Discovery, power (**PEAK**) | Two roots meet and differ, the red field blooms, TAMPERING DETECTED, the erased lines fly home |
| 7 | Calm confidence | The world settles at the real product; one line and one button |

No two adjacent rows share a feeling.

## The peak
> "I deleted the logs myself, the screen went empty, then it turned red and every line I deleted flew back in."

The peak is chapter 6. It gets the most scroll room (2.8 viewport-heights against at most 2.0 elsewhere), the only
full-screen colour change on the page, and the quiet that precedes it (the end of chapter 3, and the precise, calm
chapters 4 and 5).

## Tell-someone sentence
It's the site where **you erase an attacker's tracks yourself by scrolling, and then watch the blockchain bring
every line back**.

## Authored silence
- **Track 4.45–5.0 (end of chapter 3).** A deliberately near-empty frame: a small, clean log in darkness. The only
  motion is a slow camera pull-back and the copy line "Looking at the server alone, nothing happened."
- **The first half-viewport of chapter 6** is also quiet: a wide shot before the scan.
- Neither is dead scroll: the camera keeps moving and the stage state changes. The harness reads both through
  `data-sc-verify-state`.

## Score (one world, seven waypoints; spans in viewport-heights)
| Chapter | Span | What carries it | Why |
|---|---|---|---|
| 1 Normal | 1.5 | Lines writing themselves under scroll, a slow push-in | Recognition needs a live but calm subject |
| 2 Intrusion | 1.5 | Camera closes in, faster line cadence, red gutter marks, one-word kinetic "Root." | Tension from tighter framing and tempo |
| 3 Cover-up | 2.0 | **Signature:** scroll-driven erase sweeps, gap closing, a typed command, then the silent pull-back | The visitor performs it |
| 4 Evidence | 1.5 | Camera travels along the wire with one packet into the vault; the vault lights row by row | A reveal by travel, not by a cut |
| 5 Seal | 1.6 | Merkle tree strokes draw upward; root descends into a locking block | Precision, so trust |
| 6 Verdict | 2.8 | Root comparison, red iris bloom, full-screen verdict, lines flying home, proof ticks | **The peak:** largest span |
| 7 Prove it | 1.1 | Camera lands on the real Attack Lab plate; type at its quietest; one button | Resolution that holds |

**Total: 12.0 viewport-heights of travel over seven waypoints** (one world, so not 6–7 acts in the 13.6–13.8 band).
Under reduced motion the camera holds one shot per chapter and changes by crossfade, with no travel, sweeps or drift.
Every state still reads.

## Fingerprint gate
The registry (`scrollcraft/FINGERPRINTS.md`) was empty, so there was no row to clear. This build's row is appended
after verification.

## Palette and type
- **Colour roles.** Canvas `#0c0b0a` (off-black); surface `#171513`; paper `#ece6db` for log sheets; ink `#f1ece3`
  (warm off-white); ink-soft `#a8a197`; one accent, signal red `#d81e1e` (the console's red), with `#ff5148` for small
  red text on the dark ground.
- **Type.** Archivo for display and body (variable width; the condensed heavy cut for verdict-scale words). Geist
  Mono only for log data and hashes.


## Feel check (S05, production build on :3000)
**Not cold.** The checker had read this brief earlier in the session (to write the e2e test), so this pass is weaker
than feel.md §6 asks for. A cold pass by someone who has not read the brief is still worth doing (T-033 rehearsal).

Setup: `scripts\start-all.cmd` (production build), Chromium, 1630×845, motion on. Chapters
sampled by scroll position after the camera settled; the owner's own scroll in a second tab showed the erase sweep live.

| # | Intended (above) | Felt | Diff |
|---|---|---|---|
| 1 | Curiosity, comfort | Calm | Match |
| 2 | Unease | Alarm | Louder than intended: the red ROOT stamp lands as a shout, not a creeping unease |
| 3 | Complicity, then loss | Complicit, then quiet | Match. The silence frame (small clean log, "Looking at the server alone, nothing happened.") works |
| 4 | Surprise | Relief | Softer than intended: the wire has been visible since chapter 1, so the vault is expected rather than discovered |
| 5 | Intrigue | Dense | Off: at the seal frame the tree, five block cards and the vault list are all small on screen at once; the eye has no single subject |
| 6 | Discovery, power (PEAK) | Power | Match. Full red field + TAMPERING DETECTED is the largest change on the page; "Now verify." is a quiet wide frame before it; the return frame ("Every line you erased, back.") is close enough to read the restored rows |
| 7 | Calm confidence | Settled | Match, with one blemish: at 1630 px a fragment of the vault list sits at the top-right edge behind the skip button |

Specific checks: the peak reads as the peak (only full-screen colour change, 2.8 vh, the most scroll room); there is
silence in front of it; the end resolves (headline, CTA, live line "Live now: local chain 31337 · block 2 · 132 events
anchored" all hold on the last frame).

**What changed (T-041, S05).** The page was fixed, not the intended curve:
- Chapter 2: the ROOT stamp seeps in over 0.24 vh of scroll (was a 0.06 vh slam from 125% scale), at 56 px with a
  3 px rule (was 84 px / 5 px; phone 40 px), starting at 2.50 just after the root-shell line is written.
- Chapter 4: the wire, the outbound packets and the vault are unseen until chapter 4 starts (5.0); the wire then draws
  from the host to the vault with the followed login line. Each row's small "forwarded" tick still hints at it.
- Chapter 5: the chain appears only as the root rises to it (7.08); while the block locks, the tree, the vault and the
  root box step back to 25%, and the camera moves in on the block (z 0.74 → 0.9). Everything returns for "Now verify.".
- Close: the vault fades out with the rest of the system, so no fragment sits behind the skip button.

Re-check (dev server, 1630×845 and 375×812, motion on; again not cold): chapter 2 now reads as unease, chapter 4 as a
reveal, chapter 5 as the tree then the block, and the close stands alone. e2e 27 passed + 1 skipped afterwards. The
ScrollCraft harness was not re-run (its scripts were not executed on this laptop), so dead-scroll and contrast numbers
are still the S04 ones; a cold feel check by someone who has not read this brief is still open (T-033 rehearsal).

---

## Owner's answers (verbatim)

LEASH BLACKBOX — ScrollCraft Creative Direction
1. The look, in a few words, plus three references
Cinematic minimalism meets digital forensics. Mysterious, precise, tactile, and interactive.
I want an immersive experience with ink-black backgrounds, subtle paper textures, warm off-white typography, and one dominant signal-red accent.
No generic SaaS cards, oversized newspaper banners, unnecessary neon, or cluttered cybersecurity dashboards.
The interface should feel carefully art-directed, with sophisticated motion, dramatic typography, smooth transitions, and meaningful interactive graphics.
Creative references:

* Control (video game): Mysterious institutional atmosphere, graphic compositions, and restrained red accents.
* Mr. Robot (TV series): Authentic cybersecurity atmosphere, tension, isolation, and digital paranoia.
* Severance (opening title sequence): Surreal transitions, seamless visual storytelling, and precise cinematic motion.

The previously shared Instagram reel remains the primary interaction-quality reference, if its actual visuals are accessible.
Target around 80% of its visual complexity while keeping LEASH BLACKBOX original, faster, and easier to navigate.
2. The scroll journey
The website should tell one continuous story through seven stages.
CHAPTER 01 — EVERYTHING IS NORMAL
A quiet server environment. Security events appear one by one, forming a live timeline.
The user sees a system functioning normally.
CHAPTER 02 — THE INTRUSION
As the visitor scrolls, suspicious activity appears. A failed login becomes a successful intrusion. The attacker gains root access.
The atmosphere gradually becomes uncomfortable.
CHAPTER 03 — THE COVER-UP
The attacker begins modifying and deleting historical logs.
As the visitor scrolls, event lines visually disappear.
The screen becomes emptier.
It appears the evidence is gone.
CHAPTER 04 — BUT THE EVIDENCE ALREADY LEFT
The camera follows an event backward through the system.
We discover that the evidence was independently preserved before the compromise.
A protected evidence vault emerges.
CHAPTER 05 — THE BLOCKCHAIN SEAL
The system reveals how hashes and Merkle roots were committed to an independent blockchain.
The blockchain stores cryptographic proof, not full log contents.
The attacker cannot silently rewrite that previously confirmed commitment.
CHAPTER 06 — THE VERDICT
The verifier compares the altered local records, protected evidence, and blockchain commitments.
The screen reveals:
TAMPERING DETECTED.
The deleted event lines visually return from the independently preserved evidence vault.
The compromised host's verification result turns red while the previously secured blockchain commitment remains intact.
This is the emotional climax.
CHAPTER 07 — PROVE IT YOURSELF
The dramatic experience settles into a clean product interface.
The visitor sees:
"The attacker erased the trail. Not the proof."
A clear button appears:
ENTER LIVE ATTACK LAB
It opens the actual working LEASH BLACKBOX demo.
The scrolling story should be a visual narrative using genuine concepts and clearly labeled simulation states. Real cryptographic outcomes must come from the existing verification engine.
3. Where should it feel calm and where intense?
Opening — Calm, controlled, mysterious.
Slow motion, generous spacing, quiet details, and smooth scrolling.
Intrusion — Growing tension.
Subtle red indicators, tighter compositions, faster motion, increasing visual instability.
Cover-up — Intense and unsettling.
Logs disappearing, interface distortion, fragmented information, and deliberate moments of silence.
Blockchain reveal — Controlled and powerful.
Movement becomes precise again. Visual connections establish trust boundaries.
Tampering detection — Maximum intensity.
A decisive visual transition, verification animation, and large red integrity-failure verdict.
Ending — Calm certainty.
Everything settles. The independently preserved evidence is visible, the proof is understandable, and the user feels confident.
The experience should have emotional contrast instead of constant flashy animation.
4. How should someone feel, and what is the ONE memorable moment?
Normal operation: Curious and comfortable.
Intrusion: Uneasy.
Evidence deletion: Vulnerable, as if something important has been permanently lost.
Protected vault reveal: Surprised.
Blockchain anchoring: Intrigued by the engineering.
Verification: A powerful sense of discovery.
Ending: Confident and impressed.
THE ONE MOMENT THEY MUST REMEMBER:
The attacker deletes the server's security records.
The screen briefly appears empty.
Then the verification begins.
A cryptographic commitment remains fixed while the manipulated records fail verification.
TAMPERING DETECTED fills the screen.
The missing event lines reappear from the protected evidence vault.
The visitor understands the entire product without needing a technical explanation.
5. One thing this website should do that no other website does
SIGNATURE INTERACTION: "THE SCROLL IS THE ATTACK."
The visitor does not simply watch a cyberattack.
Their scrolling drives its visual progression.

* Scroll down: security events appear.
* Continue scrolling: the attacker gains control.
* Scroll further: records begin disappearing.
* Keep scrolling: the evidence trail appears erased.
* Continue: independently secured evidence is revealed.
* Scroll into verification: blockchain commitments expose the mismatch.
* Final scroll: missing records return from the protected vault.

The user should feel like they personally triggered the cover-up and discovered why it failed.
Use scroll-linked motion, pinning, scrubbing, layered transitions, and carefully controlled visual reveals.
This is a storytelling simulation, not a destructive operation against real security records.
The actual Attack Lab remains available through a separate button and performs real backend verification.
6. How far from premium-minimal?
80% premium-minimal, 15% cinematic editorial, 5% experimental.
Not maximalist.
Not brutalist.
Not a newspaper.
Not a typical cybersecurity dashboard.
I want:

* Strong typography
* Purposeful negative space
* Large meaningful visual elements
* Subtle textures
* Fluid motion
* High-quality visual composition
* Minimal but impactful color
* Exceptionally clear interactions

Every animation should communicate something about the story.
The website should look premium even when animations are disabled.
7. One unbroken world or distinct chapters?
ONE UNBROKEN CINEMATIC WORLD WITH SEVEN CONNECTED CHAPTERS.
I don't want seven disconnected pages.
The visitor should feel as though the camera is traveling through one living security system.
Transitions should connect naturally:
Server → Event stream → Compromised host → Protected vault → Blockchain → Verification → Live demo.
Use smooth camera-like movements, scaling, parallax, depth, and morphing transitions where appropriate.
Allow subtle chapter indicators and a visible skip-to-demo option.
The journey must remain navigable by keyboard and usable on mobile devices.
8. Images and video
Use the real LEASH BLACKBOX interface, original typography, custom vector graphics, and procedural animation. No paid external image generation is required.
Do not use kie.ai or require a paid API key.
Create original visual elements from:

* Server activity
* Log streams
* Cryptographic hashes
* Merkle trees
* Blockchain commitments
* Evidence vaults
* Security event timelines
* Verification states
* Abstract system architecture
* Actual product screenshots

Use CSS, SVG, Canvas, and efficient animation libraries where they materially improve the result.
Focus on high-quality motion design rather than unnecessary photorealistic imagery.
The entire site must remain functional, responsive, and performant.
FINAL CREATIVE OBJECTIVE:
Create an experience where visitors understand why tamper-evident evidence matters because they have personally experienced an interactive simulation of an attacker attempting to erase it.
The site should be memorable, visually impressive, technically accurate, and easy for hackathon judges to understand.
LEASH BLACKBOX
The attacker can erase the logs. They cannot erase the proof.
