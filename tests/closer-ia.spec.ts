import { test, expect, realErrors } from "./fixtures";

/**
 * Regression for the Closer page reorganization: sections A-G render in
 * order with no duplicate cards, and "Deals Expected to Close" (previously
 * hardcoded to a rolling 7-day window regardless of the selected date
 * range, and buried inside a nested "Follow-up pipeline" tab) now respects
 * the page's date range, shows a dynamic label, and opens a real drilldown.
 */
test("closer: sections render in A-G order, no duplicate cards, Deals Expected to Close is clickable", async ({
  page,
  consoleErrors,
}) => {
  await page.goto("/closer", { waitUntil: "load" });
  // Renamed from "A · Primary closing performance" to "A · Money & closing
  // performance" (Priority 4: money now leads the section, not just activity
  // counts — Cash Collected/Revenue/Cash Collection Rate/Avg Contract Value
  // render before Closes/Calls Booked/Showed/Offers Made in this same band).
  await expect(page.getByText("A · Money & closing performance")).toBeVisible({
    timeout: 10_000,
  });

  const headerTexts = await page.evaluate(() =>
    Array.from(document.querySelectorAll("div"))
      .map((el) => el.textContent?.trim())
      .filter((t) => t && /^[A-G] · /.test(t)),
  );
  // Every lettered section header from the spec must appear, in order.
  const letters = headerTexts.map((t) => t![0]);
  expect(letters).toEqual(["A", "B", "C", "D", "E", "F", "G"]);

  // No duplicate cards: each of these labels must render exactly once.
  for (const label of [
    "Closer leaderboard",
    "Rep activity heatmap",
    "Closer scorecard",
    "Follow-up pipeline",
    "Post-call disposition mix",
  ]) {
    expect(await page.getByText(label, { exact: false }).count()).toBe(1);
  }

  // Deals Expected to Close: dynamic label (not hardcoded "This Week"),
  // and a real click opens a real drilldown panel.
  const tile = page.getByRole("button", { name: /Deals Expected to Close/ });
  await expect(tile).toBeVisible();
  await expect(tile).not.toContainText("This Week");
  await tile.click();
  await expect(page.getByRole("dialog").getByText("Deals Expected to Close")).toBeVisible({
    timeout: 10_000,
  });

  expect(realErrors(consoleErrors)).toEqual([]);
});
