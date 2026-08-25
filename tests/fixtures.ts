import { test as base, expect } from "@playwright/test";

/**
 * Every test in this suite runs authenticated via the app's existing
 * dev-bypass path (`useAuth()`'s `devBypass` flag, gated on this exact
 * sessionStorage key) rather than a real Supabase session — there is no
 * throwaway login flow to drive here, and this is the same mechanism the
 * app itself uses for local/CI access.
 *
 * `consoleErrors` collects every `console.error`/`pageerror` for the test's
 * page so specs can assert on it directly, filtering out known-noisy
 * entries (favicon 404s, RLS 401s from queries dev-bypass intentionally
 * doesn't have a real session for) rather than asserting a literal empty
 * array.
 */
export const test = base.extend<{ consoleErrors: string[] }>({
  page: async ({ page }, use) => {
    await page.addInitScript(() => sessionStorage.setItem("c4-dev-bypass", "1"));
    await use(page);
  },
  consoleErrors: async ({ page }, use) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    page.on("pageerror", (e) => errors.push(String(e)));
    await use(errors);
  },
});

export { expect };

/** Errors that are expected noise under dev-bypass (no real session) or
 * unrelated to app code — never real regressions this suite should catch. */
const IGNORABLE = /favicon|401|Failed to load resource/i;

export function realErrors(errors: string[]): string[] {
  return errors.filter((e) => !IGNORABLE.test(e));
}
