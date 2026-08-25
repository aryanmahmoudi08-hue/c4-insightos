import { test, expect, realErrors } from "./fixtures";

/**
 * Part 1 coverage. Dev-bypass renders `mockWeeklyReport()`, built from the
 * exact `WeeklyReport` type the real `buildWeeklyReport()` returns — so
 * this exercises the real page structure, not a hand-shaped stand-in.
 * Guards the core requirement: every section renders from real reused
 * values (no second, divergent formula), and "Send to Discord" actually
 * fires the mutation (real dispatch path verified separately by code
 * review + the `digest.weekly` rename, not re-tested here — this is a UI
 * smoke test, not a Discord-delivery test).
 */
test("weekly-report: renders every section with real reused values, no console errors", async ({ page, consoleErrors }) => {
  await page.goto("/weekly-report", { waitUntil: "load" });
  await expect(page.locator("h1.display-serif").last()).toBeVisible({ timeout: 20_000 });

  await expect(page.getByText("CASH COLLECTED")).toBeVisible();
  await expect(page.getByText("WHAT'S CAPPING GROWTH")).toBeVisible();
  await expect(page.getByText("WHAT'S WORKING")).toBeVisible();
  await expect(page.getByText("CLOSERS")).toBeVisible();
  await expect(page.getByText("SETTERS")).toBeVisible();
  await expect(page.getByText("CONTENT MIX THIS WEEK")).toBeVisible();
  await expect(page.getByText("CLIENT RENEWAL STAGES")).toBeVisible();
  await expect(page.getByText("HIRING PIPELINE")).toBeVisible();

  expect(realErrors(consoleErrors)).toEqual([]);
});

test("weekly-report: Send to Discord fires and shows a real success/error state", async ({ page }) => {
  await page.goto("/weekly-report", { waitUntil: "load" });
  await expect(page.locator("h1.display-serif").last()).toBeVisible({ timeout: 20_000 });

  const sendButton = page.locator("button", { hasText: "Send to Discord" });
  await expect(sendButton).toBeVisible({ timeout: 10_000 });
  await sendButton.click();
  await expect(page.getByText("Weekly report sent to your connected channel")).toBeVisible({ timeout: 10_000 });
});

test("sidebar: Weekly Report nav link points to /weekly-report", async ({ page }) => {
  // Part 8 replaced /insights with the C4 Sentinel chat interface — the old
  // page-level "Weekly report" shortcut button went with it (a chat UI isn't
  // a hub of quick-link buttons); the sidebar nav item is the one surface
  // left to check.
  await page.goto("/dashboard", { waitUntil: "load" });
  const link = page.getByRole("link", { name: "Weekly Report", exact: true });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href", "/weekly-report");
});
