import { test, expect } from "./fixtures";

/**
 * Priority 10 final QA — demo/mock data isolation.
 *
 * Note on scope: every authenticated page's real-data query checks
 * `devBypass` first and returns its own separate dev-mock-data.ts fixture
 * immediately — before ever reaching the `demoMode` branch this session's
 * Priority 5 work added. That's deliberate (Priority 4: mixing devBypass's
 * skip-login fixture with the admin-facing Demo Data fixture would double
 * up fake data sources for one session), and it's moot in practice since
 * the Dev Workspace panel that turns demoMode on is itself hidden under
 * devBypass (Priority 4) — a real user can never reach the combination this
 * precedence resolves. It does mean devBypass can't be used as a transport
 * to exercise `demoMode` on most pages in this test harness (there's no
 * real, non-devBypass Supabase session available here to drive instead).
 * Calls on Calendar is the one page whose real-data query was built (pre-
 * Priority-5) to disable itself outright when `demoMode` is on, independent
 * of devBypass — which is what makes it the one surface this harness can
 * actually prove the switch changes rendered output on, end to end.
 */
test("Calls on Calendar: demo mode off shows no demo banner; on shows Demo Data Active, and off again removes it", async ({
  page,
}) => {
  await page.goto("/team-calendar", { waitUntil: "load" });
  await page.waitForTimeout(600);
  await expect(page.getByText("Demo Data Active", { exact: false })).toHaveCount(0);

  await page.evaluate(() => localStorage.setItem("c4-demo-preview-mode", "1"));
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(600);
  await expect(page.getByText("Demo Data Active", { exact: false })).toBeVisible();

  await page.evaluate(() => localStorage.removeItem("c4-demo-preview-mode"));
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(600);
  await expect(page.getByText("Demo Data Active", { exact: false })).toHaveCount(0);
});
