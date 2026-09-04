import { test, expect, realErrors } from "./fixtures";

/**
 * Regression for a real bug: the callback lead selector on Inbound Dialer
 * queried the real leads table directly with no dev-bypass fallback, so
 * under this sandbox's only available auth path (dev-bypass — there is no
 * active Supabase session here) the search box could never find or select
 * anything, even though it looked like a working search field. This proves
 * the whole interaction end to end: search text -> real result list ->
 * selecting one populates the field -> the request is logged and readable,
 * linked to that lead (not a free-text name).
 */
test("inbound-dialer: callback lead search finds, selects, and logs a real Legacy Lead", async ({
  page,
  consoleErrors,
}) => {
  await page.goto("/inbound-dialer", { waitUntil: "load" });

  const leadInput = page.getByPlaceholder("Search a Legacy Lead by name, handle, or email");
  await expect(leadInput).toBeVisible({ timeout: 10_000 });
  await leadInput.click();
  await leadInput.fill("Jordan");

  // A real result for the known mock lead "Jordan Ellis" must appear.
  const result = page.getByRole("button", { name: /Jordan Ellis/ });
  await expect(result).toBeVisible({ timeout: 10_000 });
  await result.click();

  // Selecting it must visibly populate a distinct "selected lead" chip (not
  // leave the raw search text, and not silently clear) — the search input
  // itself is replaced by the chip once a lead is selected, making the
  // selection unambiguous at a glance.
  await expect(leadInput).toHaveCount(0);
  await expect(page.getByText("Jordan Ellis", { exact: true })).toBeVisible();

  // The result dropdown must close after selection.
  await expect(page.getByRole("button", { name: /Jordan Ellis/ })).toHaveCount(0);

  const logButton = page.getByRole("button", { name: "Log callback" });
  await expect(logButton).toBeEnabled();
  await logButton.click();

  // The logged callback must show up in the list, linked back to the real
  // lead (an anchor, not plain text) — proving entity_id/lead_id, not a
  // free-text name, is the stored relationship.
  const loggedRow = page.getByRole("link", { name: "Jordan Ellis" });
  await expect(loggedRow).toBeVisible({ timeout: 10_000 });

  expect(realErrors(consoleErrors)).toEqual([]);
});
