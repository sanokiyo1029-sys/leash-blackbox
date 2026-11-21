// From a running stack: the three handoff shots of the homepage tour (the hall entrance, the overhead view looking
// back at the entrance, the verification wall with a real result) and the two opening-shot posters the light
// version and the loading state use (public/tour/poster-{dark,light}.jpg).
// Usage (stack running): node scripts/tour-shots.mjs [http://localhost:3000]
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:3000";
const out = fileURLToPath(new URL("../../docs/design/tour-shots/", import.meta.url));
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? "msedge" });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" });
await page.goto(`${base}/`);
await page.waitForSelector("canvas");
const scrollTo = (from, to, f) =>
  page.evaluate(([a, b, f]) => {
    const top = (id) => document.getElementById(id).getBoundingClientRect().top + scrollY;
    window.scrollTo(0, Math.round(top(a) + f * (top(b) - top(a))) + 1);
  }, [from, to, f]);

await scrollTo("top", "case", 0);
await page.waitForTimeout(4000);
await page.screenshot({ path: `${out}01-hall-entrance.png` });

await scrollTo("maze", "undercroft", 0.64);
await page.waitForTimeout(3500);
await page.screenshot({ path: `${out}02-above-the-racks-looking-back.png` });

await scrollTo("seal", "seal", 0);
await page.getByRole("button", { name: "Verify evidence" }).click();
await page.getByText("Original sample: match.").waitFor();
await page.waitForTimeout(3000);
await page.screenshot({ path: `${out}03-verification-wall.png` });

// Posters: the opening shot without the page on top, in both themes.
const posters = fileURLToPath(new URL("../public/tour/", import.meta.url));
for (const scheme of ["dark", "light"]) {
  const p = await browser.newPage({ viewport: { width: 1600, height: 900 }, colorScheme: scheme });
  await p.goto(`${base}/`);
  await p.waitForSelector("canvas");
  await p.addStyleTag({ content: "header, section, nav, button, footer, [aria-label='Rooms'] { visibility: hidden !important; }" });
  await p.evaluate(() => window.scrollTo(0, 1));
  await p.waitForTimeout(4500);
  await p.locator(".tour-sky").screenshot({ path: `${posters}poster-${scheme}.jpg`, type: "jpeg", quality: 82 });
  await p.close();
}

await browser.close();
console.log(`saved 3 shots to ${out}`);
