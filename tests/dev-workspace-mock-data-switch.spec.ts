import { test, expect } from "./fixtures";

/**
 * Priority 4 — the Mock/Demo Data switch must live in exactly one place
 * (the sidebar's Dev Workspace panel) and never be reachable outside it.
 *
 * Dev Bypass mimics an admin session (DEV_BYPASS_ORG's role is "admin") but
 * is a *different* mock mechanism (dev-mock-data.ts, gated to
 * `import.meta.env.DEV`) from the demo-fixtures.ts system this switch
 * controls — mixing the two would double up "fake data" sources for the
 * same session, so the panel deliberately excludes devBypass even though
 * it's nominally an admin. That's a real, asserted behavior here, not an
 * artifact of the test harness only having devBypass to drive with.
 */
test("Dev Workspace panel: mock-data switch is not exposed under Dev Bypass", async ({ page }) => {
  await page.goto("/dashboard", { waitUntil: "load" });
  // The sidebar always starts collapsed (icon rail only) by design — hover
  // expands it, which is what reveals the workspace name/trigger at all.
  await page.getByRole("complementary").hover();
  const workspaceTrigger = page.locator('button[title="Workspace"]');
  await expect(workspaceTrigger).toBeVisible();
  await workspaceTrigger.click();
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  // The workspace name (Dev Bypass's is literally "Dev Workspace (Mock)")
  // is expected in the menu label — what must NOT be there is the admin
  // Mock Data control itself.
  await expect(menu.getByText("Mock Data")).toHaveCount(0);
});

test("no page exposes an independent Demo Data toggle button outside Dev Workspace", async ({
  page,
}) => {
  await page.goto("/attribution", { waitUntil: "load" });
  // The old page-level toggle read "Preview Demo Data" / "Exit Demo Data" —
  // asserting its absence guards against it quietly coming back as a
  // second control surface for the same app-wide state.
  await expect(page.getByRole("button", { name: /Preview Demo Data|Exit Demo Data/ })).toHaveCount(
    0,
  );
});
