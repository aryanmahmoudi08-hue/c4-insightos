import { test, expect, realErrors } from "./fixtures";

/**
 * Regression for the No-show recovery drilldown surface on Closer (section
 * C): all cards were static; each now opens the real underlying calls, with
 * rate-based cards showing both the numerator and denominator records so
 * the arithmetic is visible.
 */
test("closer: no-show recovery cards open real record drilldowns", async ({
  page,
  consoleErrors,
}) => {
  await page.goto("/closer", { waitUntil: "load" });
  await expect(page.getByText("C · No-show recovery")).toBeVisible({ timeout: 10_000 });

  const noShowBtn = page.getByRole("button", { name: /No-shows in range/ });
  const noShowCount = Number((await noShowBtn.locator(".font-mono").innerText()).trim());
  expect(noShowCount).toBeGreaterThan(0);
  await noShowBtn.click();
  await expect(
    page.getByRole("dialog").getByRole("heading", { name: "No-shows in range" }),
  ).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("dialog").locator("tbody tr")).toHaveCount(noShowCount);
  await page.keyboard.press("Escape");

  const showRateBtn = page.getByRole("button", { name: /Recovered Show Rate/ });
  await showRateBtn.click();
  // Numerator + denominator both visible: title states "N of M", and every
  // no-show row (not just the recovered ones) is present in the table.
  await expect(
    page.getByRole("dialog").getByRole("heading", { name: /Recovered Show Rate \(\d+ of \d+\)/ }),
  ).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("dialog").locator("tbody tr")).toHaveCount(noShowCount);
  await page.keyboard.press("Escape");

  const closeRateBtn = page.getByRole("button", { name: /Recovered Close Rate/ });
  await closeRateBtn.click();
  await expect(
    page.getByRole("dialog").getByRole("heading", { name: /Recovered Close Rate \(\d+ of \d+\)/ }),
  ).toBeVisible({ timeout: 10_000 });
  const closeRows = await page.getByRole("dialog").locator("tbody tr").count();
  expect(closeRows).toBeGreaterThan(0);
  await page.keyboard.press("Escape");

  expect(realErrors(consoleErrors)).toEqual([]);
});

/**
 * Attribution Architecture Consolidation pass: section F's old per-node
 * clickable lifecycle panel (Original Channel → campaign → ... → cash, each
 * stage independently opening a drilldown) was replaced with a compact
 * "Revenue Source Mix" table (same real per-channel data, no per-node
 * click-through anymore — the numbers are already visible in the table) plus
 * a "View Full Attribution →" deep link into the master Attribution Command
 * Center, which owns the full lifecycle drilldown surface now.
 */
test("closer: F · Attribution shows Revenue Source Mix and links to the master Attribution page", async ({
  page,
  consoleErrors,
}) => {
  await page.goto("/closer", { waitUntil: "load" });
  await expect(page.getByText("F · Attribution")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("Revenue Source Mix", { exact: true })).toBeVisible();

  const link = page.getByRole("link", { name: "View Full Attribution →" });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href", /\/attribution/);

  expect(realErrors(consoleErrors)).toEqual([]);
});
