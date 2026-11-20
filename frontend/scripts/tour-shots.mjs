// The three handoff shots of the homepage tour, from a running stack: outside the gate, above the maze looking
// back at the bridge, and the seal chamber with a real verification result.
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
await page.waitForTimeout(3000);
await page.screenshot({ path: `${out}01-outside-the-gate.png` });

await scrollTo("maze", "undercroft", 0.64);
await page.waitForTimeout(3000);
await page.screenshot({ path: `${out}02-above-the-maze-looking-back.png` });

await scrollTo("seal", "seal", 0);
await page.getByRole("button", { name: "Verify evidence" }).click();
await page.getByText("Original sample: match.").waitFor();
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}03-seal-chamber-verified.png` });

await browser.close();
console.log(`saved 3 shots to ${out}`);
