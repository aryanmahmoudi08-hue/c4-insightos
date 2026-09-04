import { test, expect, realErrors } from "./fixtures";

/**
 * Regression for the Webinar Analytics card migration: the page used to have
 * its own bespoke ExecutiveKpiCard component (truncated labels like
 * "TOTAL L...", "SHOW-UP R...") instead of the canonical KpiBand/MetricCard
 * system every other InsightOS surface uses, and its comparison table showed
 * literal "Webinar A"/"Webinar B" headers even when real webinars were
 * selected.
 */
test("webinar analytics: canonical KpiBand cards, full labels, real comparison names, one retention chart, no fake rating", async ({
  page,
  consoleErrors,
}) => {
  await page.goto("/webinar-analytics", { waitUntil: "load" });

  await expect(page.getByText("Executive KPIs").first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("Acquisition efficiency").first()).toBeVisible();
  await expect(page.getByText("Paid vs. organic").first()).toBeVisible();

  // Full, untruncated labels — the old ExecutiveKpiCard clipped these.
  await expect(page.getByText("Total Leads", { exact: true })).toBeVisible();
  await expect(page.getByText("Show-up Rate", { exact: true })).toBeVisible();
  await expect(page.getByText("ROAS (Acquisition)", { exact: true })).toBeVisible();
  await expect(page.getByText(/TOTAL L\.\.\./)).toHaveCount(0);
  await expect(page.getByText(/SHOW-UP R\.\.\./)).toHaveCount(0);
  await expect(page.getByText(/ROAS \(ACQUISI\.\.\./)).toHaveCount(0);

  // Comparison headers show the real selected webinar names, never the
  // literal placeholder labels.
  await expect(page.getByText("Webinar A", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Webinar B", { exact: true })).toHaveCount(0);
  await expect(
    page.getByTitle("The $10K/Month Growth System · MOCK / DEMO", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByTitle("How We Generate Qualified Leads Every Week · MOCK / DEMO", { exact: true }),
  ).toBeVisible();

  // Exactly one retention chart (the duplicate was removed).
  await expect(page.locator("#retention-fill")).toHaveCount(1);

  // No hardcoded fake rating anywhere on the page.
  await expect(page.getByText(/user rating/i)).toHaveCount(0);

  expect(realErrors(consoleErrors)).toEqual([]);
});
