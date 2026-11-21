# Fortress homepage (owner brief, S10): build plan

Branch `frontend/fortress` (from `frontend/judge-path`). Owner approved 13 CC0 Poly Haven files
(`frontend/public/fortress/SOURCES.md`). Brief: dark-fantasy fortress that preserves evidence; one incident carries
the whole scroll: a session disappeared from the server, the visitor finds the surviving evidence and checks it.
Supersedes `CASTLE_DIRECTION.md` (S07) for the homepage.

## Scope (smallest version that meets the brief)
The brief allows "one beautifully rendered gatehouse and passage before expanding the castle", so the 3D scene is
one coherent gatehouse: near basalt arch (left), bridge over a misty ravine turning right, gatehouse with portcullis,
a keep with one amber window high up (recognisable silhouette), courtyard, and a passage with a stone slit.
Chapters 3–5 are real product UI on top of that scene, plus one close-up bronze seal object (chapter 4).

| id | chapter | camera / visual | content (real or labelled sample) |
|---|---|---|---|
| `bridge` | hero | bridge level at dawn, arch near left, gatehouse right, amber window | h1 "Know what happened. / Even when your server lies.", line, "Investigate the missing session" (jumps to the desk, opens the case), "Explore the fortress" |
| `gatehouse` | 1 | dolly over the bridge, under the gate (shadow), courtyard, window overhead | one caption |
| `witness` | 2 | passage, slit view of a parallel passage | two records of one session: server timeline vs witness record; session id + time persist |
| `missing` | 3 | guard desk | both timelines aligned; demo control "Show altered server log" reveals the gap; Wick raises his lantern |
| `seal` | 4 | bronze seal close-up lifts off the wax | real verification: committed root (local chain, labelled; Quai not deployed, T-047), recomputed leaf + proof ladder, match; tx link only if real |
| `desk` | 5 | quiet lit desk | real product: run the case for real (silent_login → verify → OBSERVED_OMISSION with both signed witness records), source, verdict in text, report action (evidence bundle / dispute) |

Rules: native scroll; skip-to-investigation link; posters first, 3D loaded progressively (desktop, WebGL2, no reduced
motion); phones and reduced motion get a composed still per chapter with the same controls. Themes: dark = basalt,
oxidised bronze, ivory, amber; light = limestone, brushed silver, ink, morning light; same architecture. Type: Spectral
(display), Inter (controls), IBM Plex Mono (evidence). Wick: blackened steel (dark) / pearl (light), idle breath,
lantern raise on discovery, three starter questions ("What went missing?", "What does Quai prove?", "Where can I
verify this?"). Precise claim: a commitment match proves integrity of the committed record, not that it is true.
