import { expect, test, type APIRequestContext } from "@playwright/test";
import { match } from "../lib/wick-kb";

// The seal room checks a real anchored record and the desk runs the case for real, so seed the e2e stack first.
async function seeded(request: APIRequestContext) {
  const API = "http://127.0.0.1:8011";
  expect((await request.post(`${API}/api/demo/reset`)).ok()).toBeTruthy();
  expect((await request.post(`${API}/api/simulate/traffic`, { data: { count: 60, include_intrusion: true, seed: 42 } })).ok()).toBeTruthy();
}

// Wick's local matcher: everyday paraphrases land on the right topic; an unsupported question matches nothing.
test("wick: paraphrases match their topics", () => {
  const cases: [string, string | null][] = [
    ["What went missing?", "missing"],
    ["What does Quai prove?", "quai"],
    ["Where can I verify this?", "where-verify"],
    ["What's this for?", "about"],
    ["What does LEASH do?", "about"],
    ["How can my team try this?", "try"],
    ["Show me the demo.", "demo"],
    ["What am I looking at?", "here"],
    ["What does this gap prove?", "gap"],
    ["Where did the second record come from?", "second"],
    ["What was verified?", "verified"],
    ["How much does it cost?", "pricing"],
    ["Do you integrate with Splunk?", null],
  ];
  for (const [q, id] of cases) expect(match(q)?.id ?? null, q).toBe(id);
});

test("home: the primary action opens the investigation, the altered log shows the gap, a real record is verified", async ({ page, request }) => {
  await seeded(request);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Know what happened\./ })).toBeVisible();
  await expect(page.locator(".fixed canvas")).toHaveCount(1); // the 3D fortress on a desktop-sized screen
  await expect(page.getByText(/Chain 31337 · block \d+ · \d+ events anchored/)).toBeVisible();

  await page.getByRole("link", { name: "Investigate the missing session" }).click();
  await expect(page.locator("#missing-title")).toBeFocused();
  const desk = page.locator("#missing");
  await expect(desk.getByText("No entry in the server log")).toHaveCount(0);
  await desk.getByRole("button", { name: "Show altered server log" }).click();
  await expect(desk.getByText("No entry in the server log")).toBeVisible();
  await expect(desk.getByText("The independent record contains a session that is missing from this server log.")).toBeVisible();
  await desk.getByRole("button", { name: "Check it against the chain" }).click();

  const seal = page.locator("#seal");
  await expect(seal.getByRole("heading", { name: "Verify a real record" })).toBeInViewport();
  await seal.getByRole("button", { name: "Verify evidence" }).click();
  await expect(seal.getByText("Original sample: match.")).toBeVisible();
  await expect(seal.getByText("Altered copy: no match.")).toBeVisible();
  await expect(seal.getByText(/does not prove that what the record says is true/)).toBeVisible();
  await seal.getByText("Show hashes and the transaction").click();
  await expect(seal.getByText(/Not Quai/)).toBeVisible();
  expect(errors).toEqual([]);
});

test("home: the auditor's desk runs the missing session for real", async ({ page, request }) => {
  await seeded(request);
  await page.goto("/#desk");
  const desk = page.locator("#desk");
  await desk.getByRole("button", { name: "Run the missing session for real" }).click();
  await expect(desk.getByText("Observed omission")).toBeVisible();
  await expect(desk.getByText(/Both independent witnesses signed a session by deploy from 203\.0\.113\.45/)).toBeVisible();
  await expect(desk.getByText("Gateway witness")).toBeVisible();
  await expect(desk.getByText("Identity witness")).toBeVisible();
  await expect(desk.getByRole("link", { name: "Download the evidence bundle" })).toHaveAttribute("href", "/api/export?source=vault");
});

test("home: reduced motion gets composed stills and the same working investigation", async ({ page, request }) => {
  await seeded(request);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator(".fixed canvas")).toHaveCount(0);
  await page.getByRole("link", { name: "Investigate the missing session" }).click();
  await page.locator("#missing").getByRole("button", { name: "Show altered server log" }).click();
  await expect(page.locator("#missing").getByText("No entry in the server log")).toBeVisible();
  await page.locator("#seal").getByRole("button", { name: "Verify evidence" }).click();
  await expect(page.getByText("Original sample: match.")).toBeVisible();
  await expect(page.getByText("Altered copy: no match.")).toBeVisible();
});

test("wick: keyboard, starter questions, unsupported question, theme switch keeps the conversation", async ({ page }) => {
  await page.goto("/");
  const launcher = page.getByRole("button", { name: "Ask Wick" });
  await launcher.focus();
  await page.keyboard.press("Enter");
  const input = page.getByRole("textbox", { name: "Ask Wick a question" });
  await expect(input).toBeFocused();
  const panel = page.getByRole("dialog", { name: "Wick" });
  for (const q of ["What went missing?", "What does Quai prove?", "Where can I verify this?"]) await expect(panel.getByRole("button", { name: q })).toBeVisible();

  await panel.getByRole("button", { name: "What does Quai prove?" }).click();
  await expect(panel.getByText(/This stack does not use Quai yet/)).toBeVisible();

  await input.fill("What am I looking at?");
  await page.keyboard.press("Enter");
  await expect(panel.getByText(/You're on the bridge before dawn/)).toBeVisible();

  await input.fill("Do you integrate with Splunk?");
  await page.keyboard.press("Enter");
  await expect(panel.getByText(/I don't have that in this project's documentation/)).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(launcher).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(panel.getByText(/I don't have that in this project's documentation/)).toBeVisible();

  // Theme switch mid-conversation: messages and the unsent draft survive, Wick changes armour.
  await input.fill("an unsent draft");
  await page.getByRole("radio", { name: "Dark" }).first().check({ force: true });
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(input).toHaveValue("an unsent draft");
  await expect(panel.getByText(/You're on the bridge before dawn/)).toBeVisible();
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);

  // Actions really navigate.
  await page.getByRole("button", { name: "Ask Wick" }).click();
  await page.getByRole("textbox", { name: "Ask Wick a question" }).fill("Show me the demo.");
  await page.keyboard.press("Enter");
  await page.getByRole("link", { name: "Open the guided demo →" }).click();
  await expect(page).toHaveURL(/\/demo$/);
});
