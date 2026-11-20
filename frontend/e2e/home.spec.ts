import { expect, test } from "@playwright/test";
import { match } from "../lib/wick-kb";

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

test("home: one click reaches the sample case, the comparison marks the gap, verification is explained", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "The server log says nothing happened." })).toBeVisible();
  await page.getByRole("link", { name: "Inspect the missing session." }).click();
  await expect(page.getByRole("heading", { name: "The missing session" })).toBeInViewport();
  await expect(page.getByText("Sample case", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Compare records" }).click();
  await expect(page.getByText("The independent record contains a session that is missing from this server log.")).toBeVisible();
  await expect(page.getByRole("table").getByText("No entry")).toBeVisible();
  await page.getByText("How was this verified?").click();
  await expect(page.getByText(/It does not prove who removed the entry or why/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Run it in the Attack Lab" })).toHaveAttribute("href", "/attack");
  expect(errors).toEqual([]);
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
  await expect(panel.getByText(/Press Compare records/)).toBeVisible();

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
  await expect(panel.getByText(/Press Compare records/)).toBeVisible();
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);

  // Actions really navigate.
  await page.getByRole("button", { name: "Ask Wick" }).click();
  await page.getByRole("textbox", { name: "Ask Wick a question" }).fill("Show me the demo.");
  await page.keyboard.press("Enter");
  await page.getByRole("link", { name: "Open the guided demo →" }).click();
  await expect(page).toHaveURL(/\/demo$/);
});
