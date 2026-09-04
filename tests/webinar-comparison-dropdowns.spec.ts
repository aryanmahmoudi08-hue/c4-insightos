import { test, expect, realErrors } from "./fixtures";

/**
 * Regression for the Webinar Comparison selectors: both are populated from
 * the real webinar pipeline (not hardcoded "Webinar A"/"Webinar B" slots),
 * a webinar can't be compared against itself, changing either selector
 * reshapes the comparison, and long names truncate with a tooltip instead
 * of clipping raw.
 */
test("webinar analytics: comparison dropdowns are real, mutually exclusive, and reshape on change", async ({
  page,
  consoleErrors,
}) => {
  await page.goto("/webinar-analytics", { waitUntil: "load" });
  await expect(page.getByText("Compare with")).toBeVisible({ timeout: 10_000 });

  const compareTrigger = page.getByText("Compare with").locator("..").getByRole("combobox");
  await expect(compareTrigger).toBeVisible();
  await compareTrigger.click();
  // Real webinar names with date + status, not a fixed "Webinar B" slot.
  await expect(
    page.getByRole("option", { name: /The Client Acquisition Masterclass.*MOCK.*·.*·/ }),
  ).toBeVisible();
  await page.keyboard.press("Escape");

  // Comparison table shows the real names for the currently selected pair,
  // never the literal placeholder labels.
  await expect(page.getByText("Webinar A", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Webinar B", { exact: true })).toHaveCount(0);
  const beforeRevenueCells = await page
    .locator("text=Revenue")
    .locator("xpath=ancestor::div[1]")
    .allInnerTexts();

  // Switch the comparison to a third real webinar and confirm it reshapes.
  await compareTrigger.click();
  await page.getByRole("option", { name: /The Client Acquisition Masterclass/ }).click();
  await expect(
    page.getByTitle(/The Client Acquisition Masterclass · MOCK \/ DEMO/, { exact: true }).last(),
  ).toBeVisible({ timeout: 10_000 });
  const afterRevenueCells = await page
    .locator("text=Revenue")
    .locator("xpath=ancestor::div[1]")
    .allInnerTexts();
  expect(afterRevenueCells.join("|")).not.toEqual(beforeRevenueCells.join("|"));

  // A webinar can't be compared against itself: switching the primary
  // selector to the webinar currently in the comparison slot must reset the
  // comparison back to "none" rather than silently comparing it with itself.
  const primaryTrigger = page.getByRole("combobox").first();
  await primaryTrigger.click();
  await page.getByRole("option", { name: /The Client Acquisition Masterclass/ }).click();
  await expect(compareTrigger).toHaveText("No comparison");

  expect(realErrors(consoleErrors)).toEqual([]);
});
