# Design reference and specification

## Reference that was actually inspected
Instagram reel `DfFzpXTR9AY` (samanastudios, "FUTURE of web design"): a 23.5 s, 1080×1920 phone recording of a
website played on a laptop. Inspected on 2026-11-20 in the browser by pausing the video and sampling frames at
0.3, 2, 4, 6, 8, 10, 11.5, 12, 14, 16, 18, 20, 20.5, 22.5 and 22.9 s. Small UI text on the laptop screen is not
legible at that resolution, so it is not described here.

## What is visible
| Aspect | Observation |
|---|---|
| Palette | Three print colours: flat saturated **red**, pure **ink black**, **paper white**. Small spot colours (**blue, green, yellow**) only on objects (three vials, poured liquid, a yellow-clad figure). No gradients, glow, glass or blur. |
| Imagery | Hand-drawn **manga / ink illustration**: hatching, wavy wood-grain line textures, radiating **speed lines**, high-contrast black-and-white panels. Red is used as flat backgrounds and as a silhouette disc. Everything is 2D drawing, not 3D rendering. |
| Composition | Each screen is one full-bleed **scene** with one focal illustration. Horizontal **bands** (a red band across white, a white band across red). A wide rectangular **panel** framing a close-up (eyes), like a comic panel. |
| UI chrome | Minimal and small: a little white rectangular **tag button** fixed top-right on every scene; a small white **info card** top-left on some scenes; a small white **circle** near the centre that follows the pointer. Labels are tiny, black, uppercase. |
| Typography | One large **display headline**: heavy, high-contrast **red serif in capitals** ("EXPERIENCE") laid over the illustration. Everything else is small sans labels. |
| Motion | Scroll-driven sequence of scenes. Elements enter from the edges (a hand reaching in, columns rising from below), a red **ink bloom** spreads to change scene, speed lines for action, the circle cursor trails the pointer. |
| Not present | Dark dashboards, sidebars, neon, glassmorphism, rounded "cards with soft shadows", 3D renders. |

## Translation for LEASH BLACKBOX (about 75–80 % of the reference's complexity)
Keep the product's content and every working feature; take the reference's visual language.

- **Colour:** paper `#F3EEE4`-like background, ink near-black text and frames, one brand **red**. Spot colours carry
  status, as on the vials: **green** = intact/verified, **yellow** = warning/uncommitted, **blue** = info. Red is
  both the brand and the alarm colour (tampering), as it is the drama colour in the reference.
- **Surfaces:** "comic panels": paper fill, 2 px ink frame, square corners, no blur or soft shadow. Hover/press:
  a hard offset ink shadow (print feel, cheap to render).
- **Textures (original, CSS/SVG only):** ink grain lines on red scene bands, diagonal hatching for muted areas,
  radial speed lines for the Attack Lab. No images copied from the reference; no canvas or shaders.
- **Type:** heavy high-contrast serif (Playfair Display 900) for page titles and big numbers; small uppercase
  tracked sans for labels; monospace for hashes.
- **Navigation:** the dark sidebar becomes a paper top bar: brand left, small uppercase tabs (active tab = red
  block), chain status as the small white **tag** top-right. Mobile keeps a drawer, restyled as a paper panel.
- **Scenes:** each page opens with a full-bleed red **scene band** (grain texture, big serif title) instead of a plain
  heading. Route changes get a short red ink-wipe.
- **Cursor:** a small circle that trails the pointer and grows over interactive elements (desktop, fine pointer only).
- **Simplified on purpose:** no scroll-jacking sequences, no hand-drawn character art (replaced by abstract ink
  textures), no shaders/3D; decorative motion is off under `prefers-reduced-motion` and the UI still works without it.
- **Strongest treatment:** Attack Lab (speed-line scene, host vs chain as two comic panels) and Guided Demo
  (numbered comic-panel steps, verdicts as bold red / green blocks).
