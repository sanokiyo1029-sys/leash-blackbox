import { expect, test, type APIRequestContext } from "@playwright/test";

const API = "http://127.0.0.1:8011";

async function freshHost(request: APIRequestContext) {
  expect((await request.post(`${API}/api/demo/reset`)).ok()).toBeTruthy();
  const res = await request.post(`${API}/api/simulate/traffic`, { data: { count: 120, include_intrusion: true, seed: 42 } });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body.anchor_error).toBeNull();
  return body as { ingested: number };
}

test.describe.serial("LEASH BLACKBOX core screens", () => {
  test("dashboard shows live chain state and a CLEAN verdict", async ({ page, request }) => {
    const { ingested } = await freshHost(request);
    await page.goto("/");
    await expect(page.getByText(/Chain 31337 · block \d+/).first()).toBeVisible();
    await page.getByRole("button", { name: "Verify now" }).click();
    await expect(page.getByText("CLEAN — host logs match the on-chain proof")).toBeVisible();
    await expect(page.getByText(`${ingested} intact`)).toBeVisible();
  });

  test("attack lab: baseline verifies, erased trail is detected with no false alarms", async ({ page, request }) => {
    await freshHost(request);
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/attack");
    await page.getByRole("button", { name: "Verify integrity" }).click();
    await expect(page.getByText(/Verified — all \d+ records match the on-chain commitment/)).toBeVisible();
    await page.getByRole("button", { name: "Erase my trail" }).click();
    await expect(page.getByText("Host logs changed since the last verification")).toBeVisible();
    await expect(page.getByText("line erased from the host").first()).toBeVisible();
    await page.getByRole("button", { name: "Verify integrity" }).click();
    await expect(page.getByText("Tampering detected — the server's logs no longer match the blockchain")).toBeVisible();
    await expect(page.getByText(/12 erased \(originals recovered\)/)).toBeVisible();
    await expect(page.getByText(/Lab ground truth: 12\/12 caught, 0 false alarms/)).toBeVisible();
    await expect(page.getByText(/12 committed record\(s\) are missing from the host/)).toBeVisible();
    // targeted rewrite of one specific line
    await page.getByRole("button", { name: /^Rewrite record \d+$/ }).first().click();
    await expect(page.getByText("Host logs changed since the last verification")).toBeVisible();
    await page.getByRole("button", { name: "Verify integrity" }).click();
    await expect(page.getByText(/1 altered · 12 erased/)).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("evidence explorer recovers a deleted record and proves it in the browser", async ({ page }) => {
    await page.goto("/evidence");
    await page.getByRole("button", { name: "DELETED", exact: true }).click();
    await expect(page.locator("tbody tr").first()).toContainText("DELETED");
    const firstRow = page.locator("tbody tr").first();
    await expect(firstRow).toContainText("DELETED");
    await firstRow.click();
    await expect(page.getByText(/Erased from the host/)).toBeVisible();
    await page.getByRole("button", { name: "Verify against chain" }).click();
    await expect(page.getByText("Anchored original proven against the on-chain root")).toBeVisible();
  });

  test("proof explorer: vault and contract values match", async ({ page }) => {
    await page.goto("/proofs");
    await expect(page.getByRole("cell", { name: "#0" })).toBeVisible();
    await expect(page.getByText("Merkle root").first()).toBeVisible();
    await expect(page.getByText(/status 1 · 1 log/)).toBeVisible();
  });

  test("live demo: full story runs end to end", async ({ page }) => {
    await page.goto("/demo");
    await page.getByRole("button", { name: "Run the full story" }).click();
    await expect(page.getByText(/12 erased records recovered/)).toBeVisible({ timeout: 45_000 });
    await expect(page.getByText("Protected evidence", { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/12 erased records recovered · 3 fabricated records exposed/)).toBeVisible();
    await expect(page.getByText(/^VERIFIED$/)).toBeVisible();
  });

  test("auditor portal: vault bundle verifies, tampered host bundle does not", async ({ page }) => {
    await page.goto("/auditor");
    await page.getByRole("button", { name: "Load protected vault evidence" }).click();
    await expect(page.getByText(/source vault · scope full/)).toBeVisible();
    await page.getByRole("button", { name: "Verify in my browser" }).click();
    await expect(page.getByText(/^VERIFIED$/)).toBeVisible();

    await page.getByRole("button", { name: "Load host's current logs" }).click();
    await expect(page.getByText(/source host · scope full/)).toBeVisible();
    await page.getByRole("button", { name: "Verify in my browser" }).click();
    await expect(page.getByText("TAMPERING DETECTED")).toBeVisible();
    await expect(page.getByText(/MISSING — committed in batch 0/).first()).toBeVisible();
  });
});
