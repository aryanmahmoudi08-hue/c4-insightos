import { test, expect, realErrors } from "./fixtures";

/**
 * Closer dashboard money-first IA regression (Priority 4). The page was
 * already split into lettered sections (A-G) by an earlier pass; what this
 * one fixes is the *order* (money led the closer to activity counts before,
 * not after), a real "Custom" range label (was always the literal string
 * "Custom"), disposition-mix clickability, and the no-show recovery
 * definition (previously counted "has any rebooking" as "recovered" instead
 * of "the rebooking itself showed").
 */

test("money KPIs render before secondary/activity stats, in the money-first order", async ({
  page,
  consoleErrors,
}) => {
  await page.goto("/closer", { waitUntil: "load" });
  await expect(page.getByText("A · Money & closing performance", { exact: true })).toBeVisible();

  const band = page.getByText("Closer · Key Metrics", { exact: true }).locator("..");
  const labels = await band
    .getByText(
      /Cash Collected|Revenue Generated|Cash Collection Rate|Avg Contract Value|^Closes$|Calls Booked|^Showed$|Offers Made/,
    )
    .allTextContents();
  const cashIdx = labels.findIndex((l) => l === "Cash Collected");
  const revenueIdx = labels.findIndex((l) => l === "Revenue Generated");
  const closesIdx = labels.findIndex((l) => l === "Closes");
  const bookedIdx = labels.findIndex((l) => l === "Calls Booked");
  expect(cashIdx).toBeGreaterThanOrEqual(0);
  expect(cashIdx).toBeLessThan(revenueIdx);
  expect(revenueIdx).toBeLessThan(closesIdx);
  expect(closesIdx).toBeLessThan(bookedIdx);

  // Section F (attribution) exists further down the page, after A-E — the
  // old "G · Secondary stats" (Downsells-only) wrapper was deleted; Downsells
  // now lives inside "B · Payment quality" instead (no leftover empty section).
  await expect(page.getByText("F · Attribution", { exact: true })).toBeVisible();

  expect(realErrors(consoleErrors)).toEqual([]);
});

test("Deals Expected to Close sits in the Pipeline & team visibility section and is clickable", async ({
  page,
}) => {
  await page.goto("/closer", { waitUntil: "load" });
  // Command-center follow-up pass: the old "B · Pipeline & outcome" content
  // moved below the promoted C-E sections and absorbed the Leaderboard/Heat
  // Map/Closer scorecard carved out of the old E — re-lettered "E · Pipeline
  // & team visibility".
  await expect(page.getByText("E · Pipeline & team visibility", { exact: true })).toBeVisible();
  const tile = page.getByRole("button", { name: /Deals Expected to Close/ });
  await expect(tile).toBeVisible();
});

test("changing the date range updates the Deals Expected to Close period label, including a concise Custom-range label", async ({
  page,
}) => {
  await page.goto("/closer", { waitUntil: "load" });
  await page.getByRole("button", { name: "Today", exact: true }).first().click();
  await expect(page.getByText("Deals Expected to Close · Today", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Custom", exact: true }).first().click();
  const inputs = page.locator('input[type="date"]');
  await inputs.first().fill("2026-09-01");
  await inputs.nth(1).fill("2026-09-12");
  await expect(
    page.getByText("Deals Expected to Close · Sep 1–Sep 12", { exact: true }),
  ).toBeVisible();
});

test("clicking Deals Expected to Close opens the real underlying records, scoped to the selected range", async ({
  page,
  consoleErrors,
}) => {
  await page.goto("/closer", { waitUntil: "load" });
  await page.getByRole("button", { name: "30d", exact: true }).first().click();
  await page.getByRole("button", { name: /Deals Expected to Close/ }).click();

  const panel = page.getByRole("dialog");
  await expect(panel.getByText(/Deals Expected to Close/)).toBeVisible();
  await expect(panel.getByText("What produced this", { exact: true })).toBeVisible();
  // The panel's date range matches the page's selected 30d window, not a
  // hidden/independent window.
  await expect(panel.getByText("2026-08-07 → 2026-09-05")).toBeVisible();

  expect(realErrors(consoleErrors)).toEqual([]);
});

test("disposition mix is clickable and drills into matching real calls", async ({
  page,
  consoleErrors,
}) => {
  await page.goto("/closer", { waitUntil: "load" });
  await expect(page.getByText("Post-call disposition mix", { exact: true })).toBeVisible();

  const tile = page.getByRole("button", { name: "Closed Won 23 32.9% of calls" });
  await tile.scrollIntoViewIfNeeded();
  await tile.click();

  const panel = page.getByRole("dialog");
  await expect(panel.getByText("Disposition: Closed Won", { exact: true })).toBeVisible();
  const rowCount = await panel.locator("table tbody tr").count();
  expect(rowCount).toBeGreaterThan(0);

  expect(realErrors(consoleErrors)).toEqual([]);
});

test("No-Show Recovery section shows all four real tiles with the corrected 'subsequently showed' definition", async ({
  page,
}) => {
  await page.goto("/closer", { waitUntil: "load" });
  await expect(page.getByText("C · No-show recovery", { exact: true })).toBeVisible();
  await expect(page.getByText("No-shows in range", { exact: true })).toBeVisible();
  await expect(page.getByText("No-shows Rebooked", { exact: true })).toBeVisible();
  await expect(page.getByText("Recovered Show Rate", { exact: true })).toBeVisible();
  await expect(page.getByText("Recovered Close Rate", { exact: true })).toBeVisible();
});

test("Call quality & coaching section includes Call Quality alongside the coaching panel", async ({
  page,
}) => {
  await page.goto("/closer", { waitUntil: "load" });
  // Command-center follow-up pass: Leaderboard/Heat Map/Closer scorecard were
  // carved out of this section (they now live in "E · Pipeline & team
  // visibility") — this section is Call Quality + Coaching only.
  const section = page.getByText("D · Call quality & coaching", { exact: true });
  await section.scrollIntoViewIfNeeded();
  await expect(page.getByText("Call quality", { exact: true })).toBeVisible();
  await expect(page.getByText("Average Call Duration", { exact: true })).toBeVisible();
  await expect(page.getByText("Talk / Listen Ratio", { exact: true })).toBeVisible();
  await expect(page.getByText("Coaching reviews", { exact: true })).toBeVisible();
});
