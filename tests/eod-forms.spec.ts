import { test, expect, realErrors } from "./fixtures";

/**
 * Part 6 coverage. The real "does it land in the table and feed the
 * dashboard" proof is src/lib/__integration__/eod-forms.integration.test.ts
 * (exact payload shapes, real RLS-scoped insert, real re-aggregation query)
 * — this sandbox has no login for the actual dev workspace, so the dialogs
 * can't be submitted end-to-end here. What's verified here: both dialogs
 * render every field the brief lists (no silent field loss), the expanded
 * 8-value Lead Status dropdown renders correctly, and required-field
 * enforcement matches what was actually added.
 */
test("dm-setter: Log day dialog has all 14 required fields from the brief, none silently dropped", async ({ page, consoleErrors }) => {
  await page.goto("/dm-setter", { waitUntil: "load" });
  await page.getByRole("button", { name: "Log day", exact: true }).click();

  const dialog = page.locator("[role='dialog']");
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  for (const label of ["Name", "Date", "Leads contacted", "Qualified convos", "Sets", "Calls on calendar", "Live calls (showed)", "Closes", "Downsells", "Cash collected $", "Total revenue $", "Rate today (1–10)", "Objections (comma-separated)", "Notes"]) {
    await expect(dialog.getByText(label, { exact: true })).toBeVisible();
  }
  expect(await dialog.locator("[required]").count()).toBe(14);

  expect(realErrors(consoleErrors)).toEqual([]);
});

test("inbound-dialer: Log day dialog swaps in Dials/Connections and still has all required fields", async ({ page }) => {
  await page.goto("/inbound-dialer", { waitUntil: "load" });
  await page.getByRole("button", { name: "Log day", exact: true }).click();

  const dialog = page.locator("[role='dialog']");
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await expect(dialog.getByText("Dials", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Connections", { exact: true })).toBeVisible();
  // Dials + Connections (2 required fields) replace Leads Contacted (1) —
  // 14 shared required fields - 1 + 2 = 15 for the Dialer variant.
  expect(await dialog.locator("[required]").count()).toBe(15);
});

test("closer: Log call dialog has all brief fields, and Lead status exposes all 8 real enum values", async ({ page, consoleErrors }) => {
  await page.goto("/closer", { waitUntil: "load" });
  await page.getByRole("button", { name: "Log call", exact: true }).click();

  const dialog = page.locator("[role='dialog']");
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  for (const label of ["Closer name", "Date of call", "Lead email", "Lead status", "Cash collected $", "Total revenue $", "Call recording URL", "Call summary"]) {
    await expect(dialog.getByText(label, { exact: true })).toBeVisible();
  }

  await dialog.getByText("Lead status", { exact: true }).locator("xpath=following-sibling::button").first().click();
  const options = await page.locator("[role='option']").allTextContents();
  expect(options).toEqual(["Booked", "Showed", "No Show", "Offer Made", "Closed Won", "DQ", "Follow Up", "Rescheduled"]);

  expect(realErrors(consoleErrors)).toEqual([]);
});
