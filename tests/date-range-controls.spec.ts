import { test, expect } from "./fixtures";

/**
 * Part 4's core requirement: a page-level date-range control must provably
 * change what's rendered, not just its own selected value — a control that
 * renders but doesn't drive real behavior is worse than no control (the
 * "false affordance" failure mode this project explicitly guarded against,
 * e.g. content-signals' demand/analyze functions previously took a
 * `days`-since-now count that would have silently ignored a custom
 * historical range).
 *
 * Verified via real Supabase REST request params, not just a DOM diff — a
 * page could re-render different text purely because the control's own
 * label changed, without the underlying query ever re-firing with new
 * bounds. Every click here is a real trusted `.click()`, never
 * `element.click()` inside `page.evaluate()` (that bypasses Radix's
 * pointerdown handling and silently no-ops the picker).
 */
async function switchToCustomRange(
  page: import("@playwright/test").Page,
  from: string,
  to: string,
) {
  const trigger = page
    .locator("button", { hasText: /Today|Last 7d|Last 30d|MTD|All time|Custom/ })
    .first();
  await trigger.click();
  await page.locator("button", { hasText: "Custom" }).first().click();
  const fromInput = page.locator('input[type="date"]').first();
  const toInput = page.locator('input[type="date"]').nth(1);
  await fromInput.fill(from);
  await toInput.fill(to);
}

// /insights (C4 Sentinel, Part 8) intentionally dropped its date-range
// control — a chat interface answers questions about whatever range the
// user asks about in plain language, and Open Alerts isn't range-scoped —
// so it's no longer a case here (TopBar's showDateRange={false} on that page).
const CASES: { route: string; label: string; urlSubstr: string }[] = [
  { route: "/team", label: "team cash query", urlSubstr: "/rest/v1/calls?" },
  {
    route: "/content-signals",
    label: "setter call signals query",
    urlSubstr: "/rest/v1/setter_call_signals",
  },
  { route: "/events", label: "events log query", urlSubstr: "/rest/v1/events?" },
  { route: "/outreach", label: "outreach messages query", urlSubstr: "/rest/v1/outreach_messages" },
  {
    route: "/attribution",
    label: "content touches query",
    urlSubstr: "/rest/v1/lead_content_touches",
  },
  { route: "/traffic", label: "leads query", urlSubstr: "/rest/v1/leads?" },
];

for (const { route, label, urlSubstr } of CASES) {
  test(`${route}: date range control re-fires ${label} with new bounds`, async ({ page }) => {
    const urls: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes(urlSubstr)) urls.push(req.url());
    });

    // Not "networkidle": these pages hold live Supabase realtime subscriptions
    // and polling queries that never let the network go idle. The generous
    // timeout below is a safety margin, not a fix for anything — routes are
    // pre-warmed by globalSetup and the suite runs serially (see
    // playwright.config.ts) specifically so this resolves in ~1s normally.
    await page.goto(route, { waitUntil: "load" });
    await page
      .locator("button", { hasText: /Today|Last 7d|Last 30d|MTD|All time|Custom/ })
      .first()
      .waitFor({ timeout: 20_000 });
    urls.length = 0; // only care about requests fired by the range change below

    await switchToCustomRange(page, "2019-06-01", "2019-06-02");
    await page.waitForTimeout(600);

    expect(urls.length).toBeGreaterThan(0);
    const last = urls[urls.length - 1];
    expect(last).toContain("2019-06-01");
    expect(last).toContain("2019-06-02");
  });
}
