import { expect, test } from "@playwright/test";

// Root of the 16 sample records, computed by the backend's own canonical/Merkle code (S04). The page must reach it in the browser.
const STORY_ROOT = "916a1113e73f2ce712e8edf257c223427ab3adbf939302e6e9e47849597fa390";

test("story: world boots, browser root matches the backend, close hands off to the live lab", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/story");
  await expect(page.locator("html")).toHaveClass(/sc-ready/);
  await expect.poll(async () => (await page.locator("[data-rootbox] b").allTextContents()).join("")).toBe(STORY_ROOT);
  await expect(page.locator(".st-cta")).toHaveAttribute("href", "/attack");
  await expect(page.locator(".st-live")).toHaveText(/Live now: local chain 31337 · block \d+ · \d+ events anchored/);
  expect(errors).toEqual([]);
});

test("story: linked from the desktop header", async ({ page }) => {
  await page.goto("/");
  const link = page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Story" });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href", "/story");
});
