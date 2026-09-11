import { test, expect, realErrors } from "./fixtures";

/**
 * Priority 6 — Calls on Calendar Google Calendar-style UX. `/team-calendar`
 * previously had zero test coverage at all despite embedding this whole
 * feature. This is a real-render smoke test (the overlap-column math itself
 * is unit-tested in calls-on-calendar-overlap.test.ts) — it exists to catch
 * a runtime crash / React error boundary trip the pure-function tests can't.
 */
test("Calls on Calendar renders inside Team Calendars, above Live Team Calendar, with no top-level nav item", async ({
  page,
  consoleErrors,
}) => {
  // Forced demo mode (see the second test below for why) — under real
  // devBypass with no data, the component's own real-data query 401s/
  // retries against actual Supabase before settling, which is slow and
  // unrelated to what this test actually checks.
  await page.addInitScript(() => localStorage.setItem("c4-demo-preview-mode", "1"));
  await page.goto("/team-calendar", { waitUntil: "load" });

  await expect(page.getByRole("heading", { name: "Team Calendars" })).toBeVisible();
  await expect(page.getByText("What sales calls need attention today?")).toBeVisible();
  await expect(page.getByText("What's happening across the broader team calendar?")).toBeVisible();

  // Status legend (Priority 41) — real taxonomy labels, not a placeholder.
  // Exact match on "<icon> <label>" (LEGEND_ICON + STATUS_LABEL) — the
  // summary strip above also renders "Awaiting Confirmation" as a tile
  // heading (different case, no icon), so a loose substring match would be
  // ambiguous between the two.
  await expect(page.getByText("… Awaiting confirmation", { exact: true })).toBeVisible();
  await expect(page.getByText("! Confirmation overdue", { exact: true })).toBeVisible();

  // No standalone "Calls on Calendar" nav link anywhere in the sidebar
  // (Priority 6/52/63/75 — it lives inside Team Calendars only).
  await expect(page.getByRole("link", { name: "Calls on Calendar" })).toHaveCount(0);

  expect(realErrors(consoleErrors)).toEqual([]);
});

test("Calls on Calendar event drawer opens with Lead/Closer/Setter fields, Confirmation sequence, and Calendly section", async ({
  page,
  consoleErrors,
}) => {
  // Forces useDemoMode() on directly via its own localStorage key, same
  // flag the (admin-only, Dev-Workspace-gated) toggle writes — this
  // exercises the real demo dataset's rendering without needing to drive
  // that admin UI, which devBypass sessions deliberately can't reach
  // (Priority 4). The demo dataset itself is independent of devBypass.
  await page.addInitScript(() => localStorage.setItem("c4-demo-preview-mode", "1"));
  await page.goto("/team-calendar", { waitUntil: "load" });

  await expect(page.getByText("Demo Data Active", { exact: false })).toBeVisible();

  // Agenda/grid renders real demo bookings — open the first one.
  const firstCall = page.getByRole("button", { name: /Lead: /, exact: false }).first();
  await firstCall.waitFor({ timeout: 15_000 });
  await firstCall.click();

  const drawer = page.getByRole("dialog");
  await expect(drawer.getByText("Appointment", { exact: true })).toBeVisible();
  await expect(drawer.getByText(/^Lead:/)).toBeVisible();
  await expect(drawer.getByText(/Setter\/Dialer:.*Closer:/)).toBeVisible();
  await expect(drawer.getByText("Lead form responses", { exact: true })).toBeVisible();
  await expect(drawer.getByText("Confirmation sequence", { exact: true })).toBeVisible();
  await expect(drawer.getByText("Need to make changes to this event?")).toBeVisible();

  expect(realErrors(consoleErrors)).toEqual([]);
});
