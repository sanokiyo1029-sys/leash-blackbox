import { expect, test } from "@playwright/test";

// Every route must fit a 375px phone and a 768px tablet without horizontal scrolling or console errors.
const ROUTES = ["/", "/dashboard", "/attack", "/evidence", "/auditor", "/proofs", "/demo", "/validation", "/architecture"];

for (const width of [375, 768]) {
  test.describe(`viewport ${width}px`, () => {
    test.use({ viewport: { width, height: 860 } });

    for (const route of ROUTES) {
      test(`${route} has no horizontal overflow or console errors`, async ({ page }) => {
        const errors: string[] = [];
        page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
        page.on("pageerror", (e) => errors.push(e.message));
        await page.goto(route);
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(600);
        const { scrollW, innerW } = await page.evaluate(() => ({ scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth }));
        expect(scrollW, `${route} overflows at ${width}px`).toBeLessThanOrEqual(innerW);
        expect(errors).toEqual([]);
      });
    }
  });
}
