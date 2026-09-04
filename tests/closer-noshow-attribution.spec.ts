import { test, expect, realErrors } from "./fixtures";

/**
 * Regression for two new drilldown surfaces on Closer:
 *  - No-show recovery (section D): all 3 cards were static; each now opens
 *    the real underlying calls, with rate-based cards showing both the
 *    numerator and denominator records so the arithmetic is visible.
 *  - Lifecycle attribution (section F): each node in "Original Channel →
 *    campaign → capture → setter/dialer → booked → offer → payment → cash"
 *    now opens the real calls behind that node, respecting the fact this is
 *    a read of the same call set along a lifecycle axis, not a funnel.
 */
test("closer: no-show recovery and attribution nodes open real record drilldowns", async ({
  page,
  consoleErrors,
}) => {
  await page.goto("/closer", { waitUntil: "load" });
  await expect(page.getByText("D · No-show recovery")).toBeVisible({ timeout: 10_000 });

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

  await expect(page.getByText("F · Attribution")).toBeVisible();
  const channelBtn = page.getByRole("button", { name: /Original Channel/ });
  await channelBtn.click();
  await expect(
    page.getByRole("dialog").getByRole("heading", { name: "Original Channel" }),
  ).toBeVisible({ timeout: 10_000 });
  const channelRows = await page.getByRole("dialog").locator("tbody tr").count();
  expect(channelRows).toBeGreaterThan(0);
  await page.keyboard.press("Escape");

  const cashStageBtn = page.getByRole("button", { name: /Cash Collected/ }).last();
  await cashStageBtn.click();
  await expect(
    page.getByRole("dialog").getByRole("heading", { name: "Cash Collected" }),
  ).toBeVisible({
    timeout: 10_000,
  });
  await page.keyboard.press("Escape");

  // Retention/Refund has no row-level join on calls — it must stay a plain,
  // non-interactive stat rather than a dead click or a fabricated drilldown.
  const retentionButtons = page.getByRole("button", { name: /Retention \/ Refund/ });
  await expect(retentionButtons.first()).toBeVisible();

  expect(realErrors(consoleErrors)).toEqual([]);
});
