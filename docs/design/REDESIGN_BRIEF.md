# Redesign brief: "The Missing Session" + Wick (owner's words, verbatim below)

## Owner decisions (2026-11-21, laptop A)
- The castle homepage takes `/`; the security Dashboard moves to `/dashboard` (update nav, links, e2e, PITCH.md).
- `/story` (ScrollCraft world) is retired: the castle and the "missing session" case replace it.
- Wick's final art is the owner's two knight sprites, copied to `frontend/public/wick/wick-dark.png` (black knight)
  and `frontend/public/wick/wick-light.png` (white knight). They replace the earlier sprout-headed design.
- The redesign runs in its own session; the GHOST work (T-042, T-043, T-045) is already on `main`.

---

Implement a complete redesign of LEASH BLACKBOX and add a working, animated site assistant. Carry the work through code changes, browser testing, and a production build. I want to be able to start the project, open the site, and try the finished experience.

PROJECT
Use the current LEASH BLACKBOX checkout. If the workspace is empty, clone the project from:
https://github.com/sanokiyo1029-sys/leash-blackbox

Read the repository instructions, inspect the existing routes and components, and run the site before editing. Identify the current demo, verification flow, documentation, and purchase or contact destinations. Preserve existing user changes. Keep the project’s stack and reuse working components where practical.

THE EXPERIENCE I WANT
Imagine opening a dark-fantasy webtoon at midnight. A castle sits across a ravine. Almost every window is dark. One archive window is still lit. Beside it, the headline reads:

“The server log says nothing happened.”

The visitor immediately wonders what happened in that room. One click lets them investigate. Within a minute, they should understand what LEASH does, see evidence of its value, and know how to try it or bring it to their team.

Use that feeling to sell the product. The castle earns attention. The demonstration earns trust. The next action should be obvious at both moments.

1. ESTABLISH A VISUAL SYSTEM FOR THE ENTIRE SITE

Replace the existing white, red, and black branding with a restrained palette:
- Midnight navy #111820 for page backgrounds.
- Blue slate #202C36 for raised surfaces.
- Warm ivory #E9E2D3 for primary text.
- Muted silver #ACB7BC for secondary text.
- Aged brass #CEAD70 for primary actions, selected details, and the archive light.
- Keep distinct, accessible semantic colours for genuine errors, warnings, and verification results. Pair status colour with a word or icon.

Use Cormorant Garamond Semibold for major editorial headlines, Inter for navigation and product copy, and IBM Plex Mono for timestamps and evidence. Reuse close equivalents already in the project where they fit. Check contrast at the actual rendered sizes.

Use Dark Souls’ High Wall of Lothric as a reference for the scale and silhouette of the architecture. Borrow the pacing of a dark-fantasy webtoon: a wide establishing scene, a close-up detail, then a reveal. Create original assets or use appropriately licensed artwork. Keep the hero artwork in the project so it loads reliably.

Give the castle a recognizable silhouette and a single warm focal point. Use pointed arches, weathered stone, and engraved details sparingly. Keep wide margins and a clear reading order. Avoid rainbow gradients, neon glows, excessive gold borders, generic grids of feature cards, and medieval lettering in small controls.

Apply the design through shared tokens and components, then inspect every existing route. Carry it through the header, mobile menu, footer, forms, dialogs, demo, verification views, tables, and empty or error states. The marketing pages can be atmospheric. Evidence screens must stay precise and easy to scan.

2. BUILD THE HOMEPAGE AROUND “THE MISSING SESSION”

Hero copy:
Headline: “The server log says nothing happened.”
Supporting line: “LEASH BLACKBOX helps your security team compare a server’s logs with independently preserved evidence.”
Primary CTA: “Inspect the missing session.”

Place the copy and CTA where they remain readable over the scene. Make the illuminated archive window a second entrance to the same case. Give it a generous hit area and an accessible name. A visitor should be able to use the clearly labeled button even if they never notice the window. On mobile, compose the image around the lit tower and keep the CTA near the top.

Make the first click pay off immediately. Open the existing case demo, or take the visitor directly to an interactive case section if the current demo lives farther into the product. Never send “Inspect the missing session” to a generic features page.

Build the case around one understandable interaction:
- Show a short server timeline. It looks ordinary at first glance.
- Let the visitor select “Compare records.”
- Align the server’s timeline with an independently preserved record for the same period.
- Visually mark the precise discrepancy. On mobile, stack the records with the matching timestamp visible in each.
- Explain the result in one sentence, using the actual evidence. For a sample where a session appears in only one record, use: “The independent record contains a session that is missing from this server log.”
- Offer “How was this verified?” for visitors who want the technical detail. Distinguish evidence that records differ from evidence about who changed them or why.

Use the existing demo data and verifier when available. If a curated example is needed, label it “Sample case” before the interaction. A scripted reveal must never appear to be a live verification. Preserve the real verification workflow and its actual success, failure, pending, and unavailable states wherever the project supports them.

After the reveal, give the visitor a direct next step. Use the repository’s real purchase, pricing, request-access, or contact destination and label the action accurately. If the project currently offers only a demo, make that the conversion action and disclose the missing commercial destination in your handoff. Do not create dead checkout buttons, invented prices, fake customers, or unsupported security claims.

3. CREATE “WICK,” THE ANIMATED ARCHIVE GUIDE

Use my attached image as the visual reference. What I like about it is how readable the character is at a tiny size: square cream face, dot eyes, compact body, and a two-leaf sprout. Design an original companion with those qualities. Add a short slate cloak, a brass clasp, and a little archive lantern. Keep the pixel edges crisp. I should be able to recognize Wick from the launcher alone.

Put Wick in a compact launcher labeled “Ask Wick.” Place it in the lower-right corner with enough clearance for mobile safe areas, navigation, and primary CTAs. Open the panel only when the visitor chooses it. On desktop, use a small anchored panel. On narrow screens, use a bottom sheet that still works when the keyboard is open.

Give Wick a few purposeful animations:
- Idle: an occasional blink and a tiny sprout movement.
- Open: Wick raises the lantern once.
- Thinking: Wick glances down at a pocket ledger while a reply is genuinely pending.
- Answer ready: Wick looks up and the lantern briefly brightens.

Use a lightweight local sprite sheet or layered artwork animated with CSS. Avoid artificial answer delays. Respect prefers-reduced-motion with a still character and immediate state changes.

4. MAKE WICK ACTUALLY ANSWER QUESTIONS

Visitors must be able to type their own questions. Suggested prompts should change with the page. Examples:
- Homepage: “What does LEASH do?” and “Show me the demo.”
- Case view: “What does this gap prove?” and “Where did the second record come from?”
- Verification view: “What was verified?” and “What does this result mean?”
- Commercial pages, if present: “How can my team try this?”

Ground replies in the project’s maintained documentation, product content, and actual routes. Use the current page and visible demo state when relevant. For example, before the comparison opens, “What am I looking at?” should explain the server timeline and point to “Compare records.” After the reveal, the same question should explain the discrepancy on screen. If verification has not run, Wick must accurately say so.

Reuse a suitable assistant backend if the project already has one. Keep credentials server-side. If there is no backend, ship a working local assistant with a small maintainable knowledge source, aliases for common terms, and matching that handles everyday paraphrases. “What’s this for?”, “What does LEASH do?”, and “Why would my team use this?” should all receive useful answers. The local version must work without API keys.

Keep replies to one to three clear sentences, followed by a relevant action when one exists. “Open the demo” should open the demo. An answer about verification should link to the relevant explanation or control. For an unsupported question, acknowledge the missing information and offer the closest useful topic or existing contact path. Wick should sound friendly and direct. Use ordinary language throughout.

Support opening, closing, submitting with Enter, visible keyboard focus, Escape to close, and returning focus to the launcher. Announce new replies to screen readers without rereading the whole conversation. Keep the current conversation when someone minimizes and reopens the panel during the same page visit.

5. FINISH AND VERIFY

Keep the first screen fast. Compress and size the castle artwork appropriately, reserve its layout space, and defer nonessential work. Reading and navigation must work with motion turned off. Keep scrolling native. On small screens, make sure the artwork, assistant, and mobile keyboard never cover the action the visitor needs next.

Run the existing lint, type-check, test, and production build commands where available. Use a browser to verify the normal entry points at approximately 390px, 768px, and 1440px widths. Fix issues you find.

Walk through these specific scenarios:
1. A first-time visitor opens the homepage, understands the product, and reaches the case in one click.
2. The visitor compares the two records, identifies exactly what differs, and can open the verification explanation.
3. Wick answers a typed paraphrase, explains the current case state, handles an unsupported question, and follows a real link.
4. A keyboard-only visitor opens Wick, asks a question, closes the panel, and resumes from the launcher.
5. A mobile visitor can type a question with the keyboard open, read the reply, dismiss the sheet, and reach the primary CTA.
6. The commercial CTA reaches its intended destination, and existing demo and verification functions still work after the redesign.

Deliver the implementation and a short handoff with the command to run it, what changed, how Wick answers questions, and which checks passed. Call out anything you could not verify. If browser tooling is available, include one desktop screenshot of the hero and one mobile screenshot with Wick open.


ADD-ON — LIGHT AND DARK THEMES WITH TWO VERSIONS OF WICK

Add a complete light theme and dark theme to LEASH BLACKBOX. Wick is the same archive guide in both. His armor changes with the site’s appearance. Use the two supplied knight images as the final character artwork. This replaces the earlier sprout-headed mascot design.

DARK THEME — THE MIDNIGHT ARCHIVE
Use “Tiny black knight inventory sprite.png” for Dark Wick. Preserve his fully enclosed black-steel greathelm, torn cloak, and sword. Keep the midnight navy, slate, warm ivory text, and aged-brass accents from the main brief. Place him against a slightly lighter slate launcher surface so his helmet and shoulders remain visible. Give the castle its single illuminated archive window.

LIGHT THEME — THE ARCHIVE AT DAWN
Use “Tiny Moonlit White Knight.png” for White Wick. Preserve his closed ivory helmet, plume, and leaf-engraved shield. Carry the same castle into early morning with pale limestone, cool mist, and soft shadows. Keep the archive window identifiable with a recessed stone frame and warm amber glass.

Use warm parchment (#F5F1E8) for page backgrounds, pale limestone (#E8E2D6) for panels, dark ink (#20262B) for primary text, and deep bronze (#725124) for links and primary controls. Give White Wick a muted stone-grey launcher surface so his white armor reads clearly. Keep evidence records, forms, and tables clean and easy to scan.

THEME BEHAVIOR
- Default to the visitor’s system preference. Add an accessible appearance control with System, Light, and Dark options in both desktop and mobile navigation. Persist an explicit choice across reloads. When System is selected, follow operating-system changes.
- Apply the theme before the first visible render to avoid a bright flash on dark-mode visits. Use shared semantic colour tokens across every route, including the assistant, demo, verification results, forms, and dialogs.
- Switch Wick automatically everywhere his portrait appears. Use one shared assistant instance. Changing themes mid-conversation must preserve the messages, unsent draft, open or minimized state, and current page position. The evidence comparison and verification state must also stay intact.

WICK AT PET SIZE
Display either knight at approximately 64–72 CSS pixels tall in the launcher. Normalize transparent padding and align their feet to the same baseline so switching themes feels like an armor change. Keep each sprite’s proportions and its entire silhouette, including the white plume and the dark sword. Give the launcher the accessible name “Ask Wick.”

Animate the supplied artwork with movements that fit a closed helmet. Wick gives a small welcoming nod when opened and settles when the reply arrives. If the artwork is a single flat image, use a subtle whole-sprite tilt around the feet. Skip the earlier blinking, lantern, and ledger animations. Respect reduced motion with a static pose and an immediate theme swap.

ACCEPTANCE CHECK
On desktop and mobile, open Wick, ask a question, type a second message without sending it, then switch themes. The correct knight should appear immediately at the same visual size. The conversation and draft should still be there. Reload and confirm the theme persists. Check both knights at actual launcher size, and verify that text, keyboard focus, buttons, and evidence statuses remain legible in both themes.
