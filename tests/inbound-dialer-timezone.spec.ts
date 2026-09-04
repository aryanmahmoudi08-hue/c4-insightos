import { test, expect, realErrors } from "./fixtures";

/**
 * Regression for callback-scheduling timezone visibility: leads have no
 * stored timezone anywhere in the schema, so the honest fix is to show which
 * timezone the "Due" datetime is actually being interpreted in (the
 * browser's own local zone — `new Date(dueAt).toISOString()` at the
 * mutation call site already relies on that), and to say plainly that the
 * lead's own timezone is unavailable rather than guessing one.
 */
test("inbound-dialer: callback scheduling shows the browser's time zone and an honest 'lead time zone unavailable' note", async ({
  page,
  consoleErrors,
}) => {
  await page.goto("/inbound-dialer", { waitUntil: "load" });
  await expect(page.getByText("Log a callback")).toBeVisible({ timeout: 10_000 });

  await expect(page.getByText(/Lead time zone: Unavailable/)).toBeVisible();
  await expect(page.getByText(/Your time zone: .+\(UTC[+-]\d/)).toBeVisible();

  const dueInput = page.locator('input[type="datetime-local"]');
  await dueInput.fill("2026-09-10T15:30");
  await expect(page.getByText(/Scheduling for/)).toBeVisible();
  await expect(page.getByText(/Scheduling for/)).toContainText("Lead time zone: Unavailable");

  expect(realErrors(consoleErrors)).toEqual([]);
});
