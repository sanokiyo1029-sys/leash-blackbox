import { expect, test } from "@playwright/test";
import path from "node:path";

// Captures README/pitch screenshots from the real running stack.
// Only runs when CAPTURE=1:  CAPTURE=1 npx playwright test screenshots
const OUT = path.join(__dirname, "..", "..", "docs", "img");
const shot = (name: string) => ({ path: path.join(OUT, `${name}.jpg`), type: "jpeg" as const, quality: 82 });

test.describe.serial("screenshots", () => {
  test.skip(!process.env.CAPTURE, "set CAPTURE=1 to regenerate docs/img");

  test("capture core screens", async ({ page }) => {
    await page.goto("/demo");
    await page.getByRole("button", { name: "Run the full story" }).click();
    await expect(page.getByText(/12 erased records recovered/)).toBeVisible({ timeout: 45_000 });
    await expect(page.getByText("Protected evidence", { exact: true })).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ ...shot("demo"), fullPage: true });

    await page.goto("/");
    await page.getByRole("button", { name: "Verify now" }).click();
    await expect(page.getByText("TAMPERING DETECTED")).toBeVisible();
    await page.waitForTimeout(2500);
    await page.screenshot(shot("dashboard"));

    await page.goto("/evidence");
    await page.getByRole("button", { name: "DELETED", exact: true }).click();
    await expect(page.locator("tbody tr").first()).toContainText("DELETED");
    await page.locator("tbody tr").first().click();
    await expect(page.getByText(/Recomputed in your browser/)).toBeVisible();
    await page.screenshot(shot("evidence"));

    await page.goto("/proofs");
    await expect(page.getByText(/status 1 · 1 log/)).toBeVisible();
    await page.screenshot(shot("proofs"));

    await page.goto("/auditor");
    await page.getByRole("button", { name: "Load host's current logs" }).click();
    await page.getByRole("button", { name: "Verify in my browser" }).click();
    await expect(page.getByText(/MISSING — committed in batch 0/).first()).toBeVisible();
    await page.screenshot(shot("auditor"));

    await page.goto("/attack");
    await page.getByRole("button", { name: "Verify integrity" }).click();
    await expect(page.getByText("Tampering detected — the server's logs no longer match the blockchain")).toBeVisible();
    await page.waitForTimeout(1200);
    await page.screenshot(shot("attack"));
    await page.screenshot({ ...shot("attack-full"), fullPage: true });
  });
});
