# Design reference and specification (v2, S03)

## Source actually inspected
Instagram reel `DfFzpXTR9AY` (samanastudios, caption "FUTURE of web design"): a 23.47 s, 1080×1920 phone recording
of a website on a laptop.
- **How it was read (S03, 2026-11-20).** I opened it in the browser and drew genuine video frames onto a canvas
  overlay; nothing was saved or copied. Sampled frames:
  - single frames at 0.3, 2, 3.5, 5, 6.5, 8, 9.5, 11, 12, 13.5, 15, 16.5, 18, 19.5, 21 and 22.9 s;
  - two dense sequences: 3.4–5.0 s and 12.6–14.2 s, every 0.2 s.
- **Limits.**
  - Small UI text is not legible, so labels are described by shape and position only.
  - Motion is filmed off a screen and driven by the visitor's scrolling or holding, so durations below are
    approximate and frame-limited.
  - Hover states are not visible in the footage.

## Verifying the S02 spec
Correct: the three-colour print palette (red, ink, white), spot colours on objects (blue, green and yellow vials),
manga/ink line illustration, the small white tag button top-right, small white caption cards, the small circle that
follows the pointer, the speed lines, and the big red disc.

Missed or overstated (and the cause of the rejected "newspaper" look):
- **Frames.** The reference has almost no frames around UI. Scenes are full-bleed fields, and the only outlined
  elements are the small tag and the caption cards (thin line).
- **Display type.** Display type is rare; most of the experience has none. S02 put heavy 2 px frames on every panel
  and a huge serif headline on every page.
- **Hold controls.** The circular control says "HOLD & DRAG" / "HOLD & POUR": it is a press-and-hold affordance,
  not just a cursor.
- **Transitions.** The next scene rises from the bottom edge, and the following scene "peeks" as a red band at the
  bottom.

## Observations → LEASH BLACKBOX
| Observed reference detail | Adaptation for LEASH BLACKBOX | How to check it in the browser |
|---|---|---|
| Each screen is one full-bleed scene with one focal subject: a hand at 0.3 s, a red disc in a white arch at 5 s, vials at 13.5 s | The Dashboard opens on one **verdict scene**. The focal subject is the **integrity seal**: a large paper disc carrying one tick per record, with the verdict in its centre. Nothing else competes in the first viewport. | 1440×900: the seal and verdict fill the first screen, and only small chrome sits at the corners |
| Field colour carries the mood: red scenes for drama, white scenes with ink hatching for calm (5 s, 13.5 s) | Field colour carries the **verdict**: white field with fine ink grain = CLEAN or not yet verified; full red field = TAMPERING DETECTED; amber band = chain unreachable. The field is the first thing a judge reads. | Verify → the field stays white. Attack, then verify → the field turns red. |
| Red disc framed by a white arch (5 s) | Seal = a white plate with a thin ink edge on the field. Ticks sit on the white plate so the status colours keep contrast even on a red field. | Red state: the ticks remain legible on white |
| Spot colours appear only on objects: blue, green and yellow vials (13.5 s) | Spot colours appear only on **record ticks**: green = intact, yellow = altered, blue = fabricated, red = erased. Each also has a shape (erased = hollow, fabricated = outside the ring) and a labelled count in the legend. | Legend shows icon + label + count; hovering a tick shows that record |
| Tiny UI chrome: a small white rectangular tag top-right; small white caption cards with thin black outlines and tiny uppercase text (0.3, 5, 12, 19.5 s) | Chrome reduced to a **slim bar**: brand left, nav as small text tags, chain status as the white tag top-right. Verification facts (run, time, duration, attestation) sit in one caption card beside the seal. No panel frames. | Header height ≤ 56 px; captions use 11–12 px uppercase with a 1 px ink outline |
| Circular white "HOLD & POUR" / "HOLD & DRAG" control triggers the scene's action (0.3 s, 16.5 s) | Circular **"Hold to verify"** control next to the seal. A progress ring fills while held (≈0.7 s); releasing early cancels. Completion runs the real `/api/verify`. A plain **"Verify now"** button sits beside it for keyboard, screen readers and reduced motion. | Hold the mouse → ring fills → the verify request fires (network panel). Click "Verify now" → same request. Tab reaches both. |
| Red ink blooms spread across the scene while holding, then the scene changes (3.4–4.0 s) | When a verification returns TAMPERING DETECTED, a red **bloom** expands from the seal to fill the field (≈0.7 s). It plays only after the real response and only on a state change. | Verify after an attack → bloom, then red field. Verify again → no bloom. |
| Next scene wipes up from the bottom edge over ≈0.6 s with ease-in-out (4.0 → 4.6 s) | Lower dashboard scenes reveal with a bottom-up clip wipe (0.6 s, ease-out) when scrolled into view. | Scroll: each band uncovers bottom-to-top once; reduced motion shows it at once |
| The next scene "peeks" as a red band along the bottom edge (13.2–14.2 s) | The verdict scene ends with a peek of the next band ("evidence lifecycle"), inviting scrolling. On mobile it flows naturally. | First viewport shows the top of the next band |
| Display type: one heavy red serif headline in capitals, rarely | One display word per scene: the verdict ("CLEAN", "TAMPERED", "NOT VERIFIED") in the seal's caption, plus band titles at a modest size. Everything else is small sans. | Exactly one display-size word in the first viewport |
| Speed lines behind action (19.5 s) | Reserved for the Attack Lab (unchanged until approved); not used on the Dashboard. | — |
| Small circle follows the pointer (5 s, 12 s, 16.5 s) | Kept from S02 (fine pointer, motion allowed only). | Desktop: the dot trails the pointer and the ring grows over buttons |

## Interactions (trigger → element → timing → reduced-motion equivalent)
| Trigger | Element that moves | Timing / easing | Reduced motion |
|---|---|---|---|
| Page load | Seal plate scales 0.94→1 and fades in; ticks appear clockwise | 0.45 s ease-out; ticks staggered over ≤0.6 s | Seal and ticks shown at once |
| Press and hold "Hold to verify" | Progress ring stroke | 0.7 s linear while held; snaps back in 0.2 s on early release | The control acts on click; "Verify now" is always present |
| Verification response arrives | Ticks recolour in a clockwise sweep; caption card updates; verdict word swaps with a vertical mask | Sweep ≤0.6 s; swap 0.3 s ease-out | Instant recolour and swap |
| Response flips CLEAN → TAMPERED | Red bloom from the seal centre to cover the field | 0.7 s ease-out (clip-path circle) | Field colour changes without a bloom |
| Scroll a lower band into view | Band uncovers bottom→top | 0.6 s ease-out, once | Visible immediately |
| New live events arrive (polling) | Timeline row slides down from the top | 0.28 s ease-out | Row appears |

## Tokens (scoped to the Dashboard until the direction is approved)
- **Colour:**
  - paper `#FFFFFF`; field white `#FBFAF7` with ink grain at 6 % opacity; ink `#111111`; red field `#D81E1E`
  - status spot colours: green `#1F9D55`, yellow `#E8A400`, blue `#2F6FDE`, red `#D81E1E`
  - The validator passes them (worst CVD ΔE 10.0). Yellow is below 3:1 on white, so it always ships with labels,
    counts and shape.
- **Type:**
  - display: Playfair Display 900, uppercase, used only for the verdict word (clamp 44–96 px) and band titles (28–36 px)
  - labels: 11 px / 600 / tracking 0.16 em uppercase
  - body: 14 px Geist
  - hashes: Geist Mono
- **Spacing:** 8 px grid; scene padding clamp(20 px, 4 vw, 56 px); band spacing 0 (bands abut like scenes).
- **Surfaces:**
  - fields: full-bleed colour, no frame
  - caption cards: white, 1 px ink outline, 2 px radius
  - the seal: a white disc with a 1.5 px ink edge
  - no shadows except the 3 px hard ink offset on a pressed control
- **Controls:**
  - the circular hold control: 96 px desktop, 80 px mobile
  - text buttons in caption style (1 px outline, uppercase 12 px)
  - focus: a 2 px ink ring offset 2 px
- **Motion:** `--dur-quick 0.18s`, `--dur-base 0.28s`, `--dur-scene 0.6s`, `--dur-hold 0.7s`; ease-out `cubic-bezier(.22,1,.36,1)`,
  ease-in-out `cubic-bezier(.65,0,.35,1)`.

## Why this helps someone read a verdict or follow the live demo
- **The verdict is visible from across a room.** The field colour plus one word carries it: white = clean,
  red = tampered.
- **The seal makes the evidence concrete.** Every record is a tick, and gaps or colours show exactly which records
  diverged and how many. The legend and caption give the precise numbers and the run that produced them.
- **The hold-to-verify control makes the key action deliberate and visible on stage.** The bloom ties the alarm to
  the verification that produced it, never to a timer.

## Simplified on purpose (≈75–80 % of the reference)
- No illustrated characters, hands or architecture; the seal and record ticks are our focal art.
- No scroll-jacking or pinned scene sequences: normal scrolling with bottom-up reveals.
- No shaders, canvas, 3D or video; everything is SVG and CSS transforms, opacity and clip-path.
- No speed lines or ink splatter on the Dashboard; one bloom only, on a real state change.
