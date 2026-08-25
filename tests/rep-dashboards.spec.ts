import { test, expect, realErrors } from "./fixtures";

/**
 * Part 1/2 coverage: /dm-setter and /inbound-dialer got the same PageHero +
 * composed-instrument treatment /closer already had. Guards against the
 * exact regression this project fixed once already — a page silently
 * reverting to the old banner+atomized-tile layout, or a chart rendering
 * with zero geometry (an empty `<svg>` that LOOKS like a chart but draws
 * nothing, the failure mode `background={{...}}` on recharts `<Bar>` was
 * added to prevent).
 */
for (const route of ["/dm-setter", "/inbound-dialer", "/closer"]) {
  test(`${route} renders PageHero + KPI band with no console errors`, async ({ page, consoleErrors }) => {
    // Not "networkidle": these pages hold live Supabase realtime subscriptions
    // and polling queries that never let the network go idle. The generous
    // timeout below is a safety margin, not a fix for anything — routes are
    // pre-warmed by globalSetup and the suite runs serially (see
    // playwright.config.ts) specifically so this resolves in ~1s normally.
    await page.goto(route, { waitUntil: "load" });
    // TopBar (app-sidebar.tsx) also renders an h1.display-serif with the
    // page title — PageHero's is the second one in DOM order.
    await expect(page.locator("h1.display-serif").last()).toBeVisible({ timeout: 20_000 });

    // KpiBand's grid wrapper — asserts the composed-instrument layout is
    // present, not the old one-metric-per-box grid it replaced.
    const kpiBand = page.locator('div[style*="repeat(auto-fit, minmax(130px"]').first();
    await expect(kpiBand).toBeVisible();

    // Zero-geometry check: every recharts <svg> on the page must have real
    // dimensions, not a 0x0 collapsed container (the failure mode that made
    // funnel/money instruments read as "broken scaffolding" earlier in this
    // project).
    const charts = page.locator("svg.recharts-surface");
    const count = await charts.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const box = await charts.nth(i).boundingBox();
      expect(box?.width ?? 0).toBeGreaterThan(0);
      expect(box?.height ?? 0).toBeGreaterThan(0);
    }

    expect(realErrors(consoleErrors)).toEqual([]);
  });
}
