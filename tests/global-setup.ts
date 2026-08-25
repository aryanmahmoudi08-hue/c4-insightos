import { chromium } from "@playwright/test";

/**
 * Vite's dev server compiles each route's SSR HTML *and* its client-side JS
 * chunk lazily, on first request — a plain `fetch()` warm-up only touched
 * the SSR half, so the client bundle still cold-compiled the first time an
 * actual browser hit it, which is what was still timing out here. Loading
 * every route once with a real browser (so both halves compile) before any
 * timed test starts removes that race instead of inflating timeouts and
 * hoping — a manual re-check against an already-warm server always passed
 * in well under a second.
 */
const ROUTES = ["/dm-setter", "/inbound-dialer", "/closer", "/team", "/content-signals", "/events", "/outreach", "/insights", "/dashboard", "/leads", "/pcv/warmup-token", "/weekly-report", "/connectors", "/eod-reports"];

export default async function globalSetup() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.addInitScript(() => sessionStorage.setItem("c4-dev-bypass", "1"));
  for (const route of ROUTES) {
    try {
      await page.goto(`http://localhost:8080${route}`, { waitUntil: "load", timeout: 60_000 });
      await page.waitForSelector("h1, [class*='display-serif']", { timeout: 60_000 }).catch(() => {});
    } catch {
      // Best-effort warm-up — a miss here just leaves one route cold, not a
      // reason to fail setup; the real test's own timeout is the backstop.
    }
  }
  await browser.close();
}
