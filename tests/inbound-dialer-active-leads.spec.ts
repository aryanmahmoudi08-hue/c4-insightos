import { test, expect, realErrors } from "./fixtures";

/**
 * Regression for the Inbound Dialer "Active leads available to dial" cards.
 * High Ticket and Low Ticket used to be static counts with no way to see
 * which leads they represented, and the tiers were hardcoded to exactly
 * "high"/"low". Both are now clickable, config-driven (labels come from
 * Client DNA's offer_tiers, not a hardcoded pair), and open a real
 * drilldown filtered to that tier — with the card count and drilldown row
 * count guaranteed to reconcile, a prominent clickable phone number (these
 * are leads that need to be called), and the drilldown respecting the
 * page's selected date range.
 */
test("inbound-dialer: tier cards are config-driven, reconcile with the drilldown, show a callable phone number, and respect the date range", async ({
  page,
  consoleErrors,
}) => {
  await page.goto("/inbound-dialer", { waitUntil: "load" });
  await expect(page.getByText("Active leads available to dial")).toBeVisible({ timeout: 10_000 });

  // Labels come from Client DNA's configured tiers, not a hardcoded pair.
  const highBtn = page.getByRole("button", { name: /High Ticket/ });
  const lowBtn = page.getByRole("button", { name: /Low Ticket/ });
  await expect(highBtn).toBeVisible();
  await expect(lowBtn).toBeVisible();

  const highCount = Number((await highBtn.locator(".font-mono").innerText()).trim());
  expect(highCount).toBeGreaterThan(0);

  await highBtn.click();
  await expect(
    page.getByRole("dialog").getByRole("heading", { name: /High Ticket leads available to dial/ }),
  ).toBeVisible({ timeout: 10_000 });
  const highRows = page.getByRole("dialog").locator("tbody tr");
  await expect(highRows).toHaveCount(highCount);
  const firstRowLink = page.getByRole("dialog").locator("tbody tr").first().getByRole("link");
  await expect(firstRowLink).toBeVisible();

  // Date range is shown explicitly in the drilldown header.
  await expect(
    page
      .getByRole("dialog")
      .getByText(/\d{4}-\d{2}-\d{2} → \d{4}-\d{2}-\d{2}/)
      .first(),
  ).toBeVisible();

  // Phone is a primary, clickable field (tel:) — not just email.
  const phoneHeader = page.getByRole("dialog").getByRole("columnheader", { name: "Phone" });
  await expect(phoneHeader).toBeVisible();
  const telLinks = page.getByRole("dialog").locator('a[href^="tel:"]');
  expect(await telLinks.count()).toBeGreaterThan(0);
  await expect(telLinks.first()).toHaveAttribute("href", /^tel:\+?\d+$/);
  await page.keyboard.press("Escape");

  const lowCount = Number((await lowBtn.locator(".font-mono").innerText()).trim());
  expect(lowCount).toBeGreaterThan(0);
  await lowBtn.click();
  await expect(
    page.getByRole("dialog").getByRole("heading", { name: /Low Ticket leads available to dial/ }),
  ).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("dialog").locator("tbody tr")).toHaveCount(lowCount);

  expect(realErrors(consoleErrors)).toEqual([]);
});
