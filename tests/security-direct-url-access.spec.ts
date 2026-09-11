import { test, expect } from "@playwright/test";

/**
 * Priority 10 final QA / Priority 1 security — direct-URL access. Knowing
 * a protected route's URL must never be enough on its own: a genuinely
 * anonymous visitor (no dev-bypass, no session) hitting any
 * `/_authenticated/*` route directly must be redirected to the public
 * `/welcome` landing page, never shown the app shell or its data.
 * `landing-page.spec.ts` already covers the bare `/` redirect; this covers
 * the specific protected routes the master plan names explicitly.
 */
for (const route of ["/dashboard", "/team-calendar", "/attribution", "/closer", "/clients"]) {
  test(`unauthenticated visitor hitting ${route} directly is redirected away, never shown app content`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(route, { waitUntil: "load" });
    await expect(page).toHaveURL(/\/welcome$/);
    // Never a flash of real app chrome/data before the redirect completes.
    await expect(page.getByRole("complementary")).toHaveCount(0);
  });
}
