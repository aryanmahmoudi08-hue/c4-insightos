import { test, expect, realErrors } from "./fixtures";

/**
 * Regression: the Legacy Leads detail dialog's manual ticket-tier dropdown
 * used to be hardcoded to exactly "High-ticket"/"Low-ticket" — a second,
 * conflicting definition of ticket tiers alongside Client DNA's
 * offer_tiers. It now reads the same configured tiers the Dialer's Active
 * Leads cards and the Typeform classifier use, so there's one source of
 * truth for what tiers exist.
 */
test("leads: manual ticket-tier dropdown reads Client DNA's configured tiers, not a hardcoded pair", async ({
  page,
  consoleErrors,
}) => {
  await page.goto("/leads", { waitUntil: "load" });
  const firstRow = page.locator("table tbody tr").first();
  await expect(firstRow).toBeVisible({ timeout: 10_000 });
  // Click a cell, not the row itself — clicking the bare <tr> is flaky here.
  await firstRow.locator("td").first().click();

  await expect(page.getByText("Ticket tier:")).toBeVisible({ timeout: 10_000 });
  const select = page
    .locator("select")
    .filter({ has: page.locator('option:has-text("Unclassified")') });
  const options = await select.locator("option").allInnerTexts();
  expect(options).toEqual(["Unclassified", "Low Ticket", "High Ticket"]);

  expect(realErrors(consoleErrors)).toEqual([]);
});
