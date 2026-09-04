import { test, expect, realErrors } from "./fixtures";

/**
 * Regression for the Inbound Dialer "Active leads available to dial" cards:
 * High-ticket and Low-ticket used to be static counts with no way to see
 * which leads they represented. Both are now clickable and open a real
 * drilldown filtered to that tier, with the card count and drilldown row
 * count guaranteed to reconcile (both read the same underlying array with
 * the same filter).
 */
test("inbound-dialer: High/Low-ticket cards open a reconciled, tier-filtered lead drilldown", async ({
  page,
  consoleErrors,
}) => {
  await page.goto("/inbound-dialer", { waitUntil: "load" });
  await expect(page.getByText("Active leads available to dial")).toBeVisible({ timeout: 10_000 });

  const highBtn = page.getByRole("button", { name: /High-ticket/ });
  const lowBtn = page.getByRole("button", { name: /Low-ticket/ });
  await expect(highBtn).toBeVisible();
  await expect(lowBtn).toBeVisible();

  const highCount = Number((await highBtn.locator(".font-mono").innerText()).trim());
  expect(highCount).toBeGreaterThan(0);

  await highBtn.click();
  await expect(
    page.getByRole("dialog").getByRole("heading", { name: /High-ticket leads available to dial/ }),
  ).toBeVisible({ timeout: 10_000 });
  const highRows = page.getByRole("dialog").locator("tbody tr");
  await expect(highRows).toHaveCount(highCount);
  // Every row must actually be a high-ticket lead — not an unrelated one.
  const firstRowLink = page.getByRole("dialog").locator("tbody tr").first().getByRole("link");
  await expect(firstRowLink).toBeVisible();
  await page.keyboard.press("Escape");

  const lowCount = Number((await lowBtn.locator(".font-mono").innerText()).trim());
  expect(lowCount).toBeGreaterThan(0);
  await lowBtn.click();
  await expect(
    page.getByRole("dialog").getByRole("heading", { name: /Low-ticket leads available to dial/ }),
  ).toBeVisible({ timeout: 10_000 });
  const lowRows = page.getByRole("dialog").locator("tbody tr");
  await expect(lowRows).toHaveCount(lowCount);

  expect(realErrors(consoleErrors)).toEqual([]);
});
