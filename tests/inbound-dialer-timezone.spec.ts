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

  await expect(page.getByText(/Lead time zone:/)).toBeVisible();
  await expect(page.getByText(/Your time zone:/)).toBeVisible();
  await expect(page.getByText(/UTC[+-]\d/)).toBeVisible();

  await page.locator('input[type="date"]').fill("2026-09-10");
  await page.locator('input[type="time"]').fill("15:30");
  await expect(page.getByText(/Scheduling for/)).toBeVisible();
  // "Your"/"Lead" timezone stay visually distinguished (separate pills), and
  // the "Scheduling for" confirmation never claims the lead's own timezone.
  await expect(page.getByText(/Lead time zone: Unavailable/)).toBeVisible();

  expect(realErrors(consoleErrors)).toEqual([]);
});
