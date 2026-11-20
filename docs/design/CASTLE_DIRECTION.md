# Castle direction (owner, 2026-11-21, S07): read before touching the homepage

## What the owner asked for (their words, condensed)
- "Not 2D." The whole site should feel like a medieval castle, animated with everything available.
- **No photos on the site.** The 20 images in `docs/design/references/` are mood references only
  (lighting, stone, the lit archive window, wax seals, the torn page vs the sealed page). Never ship them.
- Order: **UI first, then backend.**
- The story: "the castle is the data inside a server: even if the hacker gets in, he gets lost in the castle
  without the proper layout of it."

## Keep the metaphor honest (pushback, ponytail ultra)
LEASH does not hide or scramble data, so "the hacker gets lost" must not become a claim that LEASH confuses
attackers. The true version maps cleanly:

| Castle | LEASH (real code) |
|---|---|
| Rooms on each floor | log records (the host's log store) |
| The castle's layout, drawn and sealed at the gate | the Merkle tree of each batch; its root anchored on-chain (`LeashAnchor.anchorBatch`) |
| Corridor from a room to the keep | the Merkle proof path of a record (`/api/events/{seq}` returns it) |
| The attacker inside | root on the host: can rearrange, burn or add rooms (edit, delete, inject lines) |
| "Lost without the layout" | a rewritten or forged room has no corridor that reaches the sealed keep: its proof fails |
| Archive under the keep, outside the attacker's reach | the evidence vault (append-only, off the host) |
| Watchtowers outside the walls | the gateway witness (signed sessions) and signed heartbeats |
| The missing room nobody recorded | `OBSERVED_OMISSION`: the witness saw a session the host never logged |

So the demo line is: "The attacker can walk the halls and move the furniture. He cannot redraw the sealed map.
Every room he changed no longer leads to the keep."

## Suggested build (next laptop)
1. **Castle UI (homepage `/`)**, original art only, no photos:
   - layered SVG/CSS scene with real depth: sky, far ridge, curtain wall, towers, the lit archive window, mist,
     ravine, near cliff as separate planes; scroll-linked parallax and a push-in toward the lit window
     (`motion` is installed: `useScroll`/`useTransform`; the current `components/home-scenes.tsx` Hero already
     has the sticky scroll section and copy fade, with a plain sky placeholder);
   - true 3D (react-three-fiber) only if the owner accepts a new dependency (~150 KB gzip); CSS 3D first;
   - the castle-as-server explorer: rooms = records of the latest batch, corridors = proof paths to the keep
     (root); let the visitor play the attacker (move/burn a room) and watch its corridor break.
     Back it with the real `/api/batches/{id}` and `/api/events/{seq}` data, never a scripted "verified".
2. **Site-wide castle chrome**, restrained on evidence screens (the brief: evidence stays precise): stone/parchment
   textures via CSS, gate-style page transitions, banner headings. Keep every e2e selector in AGENTS.md working.
3. **Backend after UI**, only what the explorer needs, e.g. one endpoint returning a batch's tree layout
   (levels of node hashes) so the browser can draw corridors and verify them with `lib/verify.ts`.

Skills to use (Claude Code): `nateherk-design:scroll-craft`, `design-taste-frontend`, `impeccable`, `animate`,
`choreograph`, `animation-performance`, `mobile-native`, `design:accessibility-review`. Reduced motion must give a
still castle and instant state changes.
