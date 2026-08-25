import { test, expect, realErrors } from "./fixtures";

/**
 * Part 2+3 coverage. The real DB round trip (link creation/reuse, marking
 * leads.precall_video_watched, logging a real lead_events row, returning
 * the org's post_booking VSL) is verified by
 * src/lib/__integration__/pre-call-video.integration.test.ts against a real
 * throwaway Supabase project — this sandbox's dev server has no
 * SUPABASE_SERVICE_ROLE_KEY configured, so a live click-through here can't
 * reach real data (confirmed: the public server fn throws "Missing Supabase
 * environment variable(s)" and the page's error-state branch happens to
 * render the same copy as its genuine not-found branch — that's a UI
 * detail, not proof the not-found path itself was exercised). What IS
 * verified here: the copy-link UI on /leads works end-to-end under
 * dev-bypass, and the public page never crashes/blanks on a resolve
 * failure — it always renders a real, non-blank state.
 */
test("leads: copy pre-call video link button works and shows a toast", async ({ page, context, consoleErrors }) => {
  await context.grantPermissions(["clipboard-write"]);
  await page.goto("/leads", { waitUntil: "load" });
  await expect(page.locator("h1.display-serif").last()).toBeVisible({ timeout: 20_000 });

  const copyButton = page.locator('button[title="Copy pre-call video link to send this lead"]').first();
  await expect(copyButton).toBeVisible({ timeout: 10_000 });
  await copyButton.click();
  await expect(page.getByText("Pre-call video link copied")).toBeVisible({ timeout: 10_000 });

  expect(realErrors(consoleErrors)).toEqual([]);
});

test("pcv/$token: never renders a blank page, even when the resolve call fails", async ({ page, consoleErrors }) => {
  await page.goto("/pcv/some-bogus-token", { waitUntil: "load" });
  // Loading -> some real terminal state; never left blank/hung.
  await expect(page.locator("main")).not.toBeEmpty({ timeout: 15_000 });
  const text = await page.locator("main").innerText();
  expect(text.trim().length).toBeGreaterThan(0);

  expect(realErrors(consoleErrors)).toEqual([]);
});
