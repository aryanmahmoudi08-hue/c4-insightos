import { test, expect, realErrors } from "./fixtures";

/**
 * Part 8 coverage. devBypass has no real Supabase session, so real
 * askSentinelFn/tool-call round-trips aren't exercised here (same
 * SUPABASE_SERVICE_ROLE_KEY-less sandbox constraint documented throughout
 * this project) — the route's own mockSentinelReply() path stands in, which
 * still proves the real UI mechanics: starter questions send, replies render
 * with their grounding tag, Open Alerts is a real panel (not a separate
 * page), and clicking an alert seeds + sends a question.
 */

test("C4 Sentinel: starter question sends and renders a grounded reply", async ({ page, consoleErrors }) => {
  await page.goto("/insights", { waitUntil: "load" });
  await expect(page.getByText("C4 Sentinel", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Ask C4 Sentinel anything about your business", { exact: true })).toBeVisible();

  await page.getByText("How's this week going?", { exact: true }).click();
  await expect(page.getByText("How's this week going?", { exact: true })).toBeVisible(); // now the sent user bubble
  await expect(page.getByText(/Grounded on:/, { exact: false })).toBeVisible({ timeout: 10_000 });

  expect(realErrors(consoleErrors)).toEqual([]);
});

test("C4 Sentinel: Open Alerts is a real panel, and clicking an alert seeds + sends a question", async ({ page }) => {
  await page.goto("/insights", { waitUntil: "load" });
  await expect(page.getByText("Open Alerts", { exact: true })).toBeVisible();
  const alertRow = page.getByText("Show rate dipped below 70% this week", { exact: true });
  await expect(alertRow).toBeVisible();

  await alertRow.click();
  await expect(page.getByText(/Tell me more about this alert/, { exact: false })).toBeVisible();
  await expect(page.getByText(/Grounded on: get_open_alerts/, { exact: false })).toBeVisible({ timeout: 10_000 });
});

test("C4 Sentinel: nav label reads \"C4 Sentinel\", not \"AI Insights\"", async ({ page }) => {
  await page.goto("/dashboard", { waitUntil: "load" });
  await expect(page.getByRole("link", { name: "C4 Sentinel" })).toBeVisible();
  await expect(page.getByRole("link", { name: "AI Insights" })).toHaveCount(0);
});

/**
 * Regression: mockSentinelReply() originally fell through to one fixed
 * weekly-snapshot reply for anything that wasn't "alert"/"client"/"content"
 * — including a genuinely different timeframe question and an explicit
 * correction repeating the same timeframe. Confirmed live: three visibly
 * different questions produced byte-identical text. This locks in that
 * different questions get different, correctly-grounded answers, and that
 * a topic no tool covers gets an honest decline instead of a guess.
 */
test("C4 Sentinel: different questions get different answers, not one fixed reply", async ({ page }) => {
  await page.goto("/insights", { waitUntil: "load" });
  const input = page.locator('textarea[placeholder*="Ask about"]');

  const ask = async (text: string) => {
    await input.fill(text);
    await input.press("Enter");
    await expect(page.getByText(text, { exact: true })).toBeVisible();
  };

  await ask("how much cash in the past 24 hours");
  await expect(page.getByText(/In the last 24 hours:/, { exact: false })).toBeVisible({ timeout: 10_000 });

  await ask("how much cc this month");
  await expect(page.getByText(/Month to date:/, { exact: false })).toBeVisible({ timeout: 10_000 });

  await ask("what's our CAC?");
  await expect(page.getByText(/I don't have that/, { exact: false })).toBeVisible({ timeout: 10_000 });

  // The three replies must be genuinely distinct bubbles, not the same text repeated.
  const replies = await page.locator(".bg-muted\\/50").allTextContents();
  expect(new Set(replies).size).toBe(replies.length);

  // An honest decline never claims a grounding tool it didn't call.
  const lastReplyBlock = page.locator(".bg-muted\\/50").last().locator("xpath=..");
  await expect(lastReplyBlock.getByText(/Grounded on:/, { exact: false })).toHaveCount(0);
});
