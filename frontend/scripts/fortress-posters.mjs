// From a running stack: render the homepage's composed stills from the real 3D fortress (one per chapter, both
// themes) and the seal close-up, with the page's UI hidden. Phones, reduced motion and no-WebGL visitors see these
// (public/fortress/posters/), and desktop shows them while the live scene loads.
// Usage (stack running): node scripts/fortress-posters.mjs [http://localhost:3000]
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:3000";
const out = fileURLToPath(new URL("../public/fortress/posters/", import.meta.url));
mkdirSync(out, { recursive: true });

// Where each chapter's still is taken: a section and how far through it (the camera rests there).
const SHOTS = [
  ["bridge", "top", 0],
  ["gatehouse", "gatehouse", 0.62],
  ["witness", "witness", 0.25],
  ["missing", "missing", 0],
  ["seal", "seal", 0],
  ["desk", "desk", 0],
];

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? "msedge" });
for (const scheme of ["dark", "light"]) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, colorScheme: scheme });
  await page.goto(`${base}/`);
  await page.waitForSelector(".fixed canvas");
  await page.waitForTimeout(5000);

  // The seal close-up first (its canvas sits in the seal room's panel).
  const seal = page.locator("#seal canvas");
  await seal.scrollIntoViewIfNeeded();
  await page.waitForTimeout(2500);
  await seal.screenshot({ path: `${out}seal-object-${scheme}.jpg`, type: "jpeg", quality: 84 });

  await page.addStyleTag({ content: "header, main section *, nextjs-portal, button[aria-label='Ask Wick'] { visibility: hidden !important; }" });
  for (const [name, id, f] of SHOTS) {
    await page.evaluate(([id, f]) => {
      const el = document.getElementById(id);
      window.scrollTo(0, el.offsetTop + f * el.offsetHeight);
    }, [id, f]);
    await page.waitForTimeout(3500);
    await page.screenshot({ path: `${out}${name}-${scheme}.jpg`, type: "jpeg", quality: 80 });
  }
  await page.close();
}
await browser.close();
console.log(`saved posters to ${out}`);
