# Castle handoff (S07 → other laptop)

Branch: `redesign/castle` (pushed). `main` is unchanged at `bed98ce`. Usage stopped S07 before the castle UI.

## 1. Prompt (paste into Claude Code on the other laptop)

```
Read AGENTS.md. Then: git fetch origin; git switch redesign/castle.
Read docs/handoff/CURRENT_STATE.md ("S07 status"), docs/design/CASTLE_DIRECTION.md and
docs/handoff/CASTLE_HANDOFF.md (this file).

Build the whole LEASH BLACKBOX site as an animated medieval castle, UI first, then backend.
- No photos on the site. docs/design/references/ are mood references only (lighting, stone, the one lit
  archive window, wax seals, torn page vs sealed page). Create original art (layered SVG/CSS with real depth,
  scroll-linked parallax, a push-in toward the lit archive window). True 3D (react-three-fiber) only if I approve
  the new dependency.
- The story: the castle is the data inside a server. Keep it honest (LEASH does not hide data):
  rooms = log records; the sealed map = each batch's Merkle tree, root anchored on-chain; corridor from a room to
  the keep = the record's Merkle proof path; the attacker inside can move, burn or add rooms (edit, delete, inject
  log lines) but a changed room no longer leads to the sealed keep; the archive under the keep = the evidence
  vault; watchtowers = the gateway witness and signed heartbeats; the unrecorded room = OBSERVED_OMISSION.
- Homepage /: keep the hero copy, the "Inspect the missing session." CTA and the sample case; replace the plain
  sky placeholder in components/home-scenes.tsx with the castle. Add a castle explorer where the visitor plays the
  attacker and watches a corridor break, using real /api/batches and /api/events data (never a scripted "verified").
- Carry the castle chrome across every route, but keep evidence screens precise and scannable. Keep both themes
  (Midnight Archive / Archive at Dawn), Wick, and every e2e selector listed in AGENTS.md.
- Then backend: only what the explorer needs (e.g. one endpoint returning a batch's tree levels), with tests.
- Reduced motion = a still castle and instant state changes. Native scrolling. Phones at 390 px first-class.
- Use these skills: nateherk-design:scroll-craft, design-taste-frontend, impeccable, animate, choreograph,
  animation-performance, mobile-native, gestures, design:accessibility-review, design:ux-copy, break-ui.
- Checks: stop the demo stack first (KI-022); frontend tsc + eslint; npx playwright test; backend pytest (107+);
  browser checks at 390/768/1440 in both themes; production build via scripts\start-all.cmd.
- Update the handoff docs, commit with the repo-local identity (no AI credits), push the branch, and ask me
  before fast-forwarding main.
```

## 2. References (`docs/design/references/`, mood only, never shipped)

| File | What it shows | Use it for |
|---|---|---|
| ref-01 | White knight, plume, leaf shield | Wick (light) source look |
| ref-02 | Archive room, warm dawn light through a lancet window | inside the archive (light theme) |
| ref-03 | Pale limestone castle on a cliff at dawn, one lit gothic window, bridge, misty ravine | light-theme hero mood |
| ref-04 | Torn book next to a sealed page | server log vs independent record |
| ref-05 | Castle wax seal and bronze stamp | sealing / anchoring a batch |
| ref-06 | Spiral staircase down to a lit archive door | descending into the castle explorer |
| ref-07 | Lit gothic window in rain at night, close-up | dark-theme close-up of the archive window |
| ref-08 | Open gate and portcullis onto a sunrise valley | entrance / next step |
| ref-09 | Dark castle, bridge over a ravine, one lit window | dark-theme hero mood (the brief's scene) |
| ref-10 | Black knight, torn cloak, sword | Wick (dark) source look |
| ref-11 | Lit watchtowers in rain over a valley | witnesses and heartbeats |
| ref-12 | A broken red wax seal | tampering detected |
| ref-13 | Chibi dark knight with sprout and lantern | earlier Wick design, not used (T-051, owner's call) |
| ref-14 | Five tiles in sand, one missing | the missing session / a gap in the sequence |
| ref-15 | Chibi white knight with sprout and lantern | earlier Wick design, not used (T-051) |
| ref-16 | Scholar sealing documents | the collector sealing evidence into the vault |
| ref-17 | Knight at a gate facing a bright citadel | dawn, the way forward |
| ref-18 | Hooded figure with a lantern at a dark gate | the investigator arriving |
| ref-19 | Iron chest sealed with wax in a vault | the evidence vault |
| ref-20 | Chained bronze medallions in a press | hash chain + anchoring |

## 3. Skills and what each is for

| Skill | Job |
|---|---|
| `nateherk-design:scroll-craft` | the castle as a scroll journey: planes, push-in, signature move, separate phone composition |
| `design-taste-frontend` | overall art direction, hero entrance, finish gate in a real browser |
| `impeccable` | design pass and polish across every route, both themes |
| `animate` | each animation's purpose, curve, duration, interruption |
| `choreograph` | multi-part sequences (gate opening, corridor breaking, case reveal) |
| `animation-performance` | composite-only properties, no dropped frames during parallax |
| `mobile-native` | phone viewport, safe areas, Wick sheet with the keyboard, no 100vh bugs |
| `gestures` | drag/swipe in the explorer and the Wick sheet, if used |
| `design:accessibility-review` | contrast in both themes, keyboard, screen readers, reduced motion |
| `design:ux-copy` | castle copy that stays accurate about what LEASH proves |
| `break-ui` | worst-case data in the explorer (long hashes, empty batches, many records) |

## 4. Already done on the branch (don't redo)
Themes + no-flash control, fonts, `/dashboard`, `/story` retired, homepage sample case, Wick (pixel knights, local
knowledge base), e2e `home.spec.ts`. Last results: backend 107 passed; Playwright 28 passed + 1 skipped (on the
photo version); tsc and lint clean after removing the photos.
