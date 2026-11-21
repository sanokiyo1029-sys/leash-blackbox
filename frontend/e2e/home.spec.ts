import { expect, test, type APIRequestContext } from "@playwright/test";
import { match } from "../lib/wick-kb";

// The seal press checks a real anchored record, so the tour tests seed the e2e stack first (as smoke.spec does).
async function seeded(request: APIRequestContext) {
  const API = "http://127.0.0.1:8011";
  expect((await request.post(`${API}/api/demo/reset`)).ok()).toBeTruthy();
  expect((await request.post(`${API}/api/simulate/traffic`, { data: { count: 60, include_intrusion: true, seed: 42 } })).ok()).toBeTruthy();
}

// Wick's local matcher: everyday paraphrases land on the right topic; an unsupported question matches nothing.
test("wick: paraphrases match their topics", () => {
  const cases: [string, string | null][] = [
    ["What's this for?", "about"],
    ["What does LEASH do?", "about"],
    ["Why would my team use this?", "about"],
    ["How can my team try this?", "try"],
    ["Show me the demo.", "demo"],
    ["What am I looking at?", "here"],
    ["What does this gap prove?", "gap"],
    ["Where did the second record come from?", "second"],
    ["What was verified?", "verified"],
    ["What does this result mean?", "result"],
    ["How much does it cost?", "pricing"],
    ["Who deleted the entry?", "gap"],
    ["Do you integrate with Splunk?", null],
  ];
  for (const [q, id] of cases) expect(match(q)?.id ?? null, q).toBe(id);
});

test("home: the hero opens the case, the gap is marked, and a real record is verified", async ({ page, request }) => {
  await seeded(request);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Prove what happened/ })).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(1);
  await expect(page.getByText(/Chain 31337 · block \d+ · \d+ events anchored/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Open dashboard" })).toHaveAttribute("href", "/dashboard");
  await page.getByRole("link", { name: "Investigate the missing session" }).click();
  const box = page.locator("#case");
  await expect(box).toBeFocused();
  await expect(box.getByText("No entry in the host log")).toBeVisible();
  await expect(box.getByText("The independent record contains a session that is missing from this server log.")).toBeVisible();
  await box.getByRole("button", { name: "Verify a real record" }).click();

  const seal = page.locator("#seal");
  await expect(seal.getByRole("heading", { name: "Verify a real record" })).toBeInViewport();
  await seal.getByRole("button", { name: "Verify evidence" }).click();
  await expect(seal.getByText("Original sample: match.")).toBeVisible();
  await expect(seal.getByText("Altered copy: no match.")).toBeVisible();
  await seal.getByText("Show hashes and the transaction").click();
  await expect(seal.getByText(/Not Quai/)).toBeVisible();
  await expect(seal.getByRole("link", { name: "Open investigation dashboard" })).toHaveAttribute("href", "/dashboard");
  expect(errors).toEqual([]);
});

test("home: reduced motion keeps the case and the verdict reachable", async ({ page, request }) => {
  await seeded(request);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("link", { name: "Investigate the missing session" }).click();
  await expect(page.locator("#case").getByText("No entry in the host log")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#case")).toHaveCount(0);
  await page.locator("#seal").getByRole("button", { name: "Verify evidence" }).click();
  await expect(page.getByText("Original sample: match.")).toBeVisible();
  await expect(page.getByText("Altered copy: no match.")).toBeVisible();
});

test("wick: keyboard, case-aware answers, unsupported question, theme switch keeps the conversation", async ({ page }) => {
  await page.goto("/");
  const launcher = page.getByRole("button", { name: "Ask Wick" });
  await launcher.focus();
  await page.keyboard.press("Enter");
  const input = page.getByRole("textbox", { name: "Ask Wick a question" });
  await expect(input).toBeFocused();

  await input.fill("What am I looking at?");
  await page.keyboard.press("Enter");
  const panel = page.getByRole("dialog", { name: "Wick" });
  await expect(panel.getByText(/You're looking at a server rack/)).toBeVisible();

  await input.fill("Do you integrate with Splunk?");
  await page.keyboard.press("Enter");
  await expect(panel.getByText(/I don't have that in this project's documentation/)).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(launcher).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(panel.getByText(/I don't have that in this project's documentation/)).toBeVisible();

  // Theme switch mid-conversation: messages and the unsent draft survive, the knight changes armour.
  await input.fill("an unsent draft");
  await page.getByRole("radio", { name: "Dark" }).first().check({ force: true });
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(input).toHaveValue("an unsent draft");
  await expect(panel.getByText(/You're looking at a server rack/)).toBeVisible();
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);

  // Actions really navigate.
  await page.getByRole("button", { name: "Ask Wick" }).click();
  await page.getByRole("textbox", { name: "Ask Wick a question" }).fill("Show me the demo.");
  await page.keyboard.press("Enter");
  await page.getByRole("link", { name: "Open the guided demo →" }).click();
  await expect(page).toHaveURL(/\/demo$/);
});
