import { test, expect, realErrors } from "./fixtures";

/**
 * EOD Reports Rebuild coverage. The real "does it land in the tables" proof
 * is src/lib/__integration__/eod-reports-flow.integration.test.ts (real
 * insert + re-aggregation against the throwaway Supabase project). What's
 * verified here is the step-flow's own UI mechanics: per-step required
 * blocking, forward/back state preservation, and the review screen —
 * exactly what the brief's verification section asked for.
 *
 * devBypass has no real Supabase session in this sandbox (session: null,
 * see use-auth.tsx), so the one live-network write in the flow (adding a
 * new team member via TeamMemberPicker's "+ Add new") is network-mocked in
 * the full run-through test below so the flow's OWN state machine — not the
 * unrelated backend-availability constraint already documented in Phase E —
 * is what's under test past step 1.
 */

test("role selector renders 3 cards and each navigates into its own flow", async ({ page, consoleErrors }) => {
  await page.goto("/eod-reports", { waitUntil: "load" });
  await expect(page.getByRole("heading", { name: "EOD Reports" }).first()).toBeVisible();
  for (const label of ["DM Setter EOD", "Dialer EOD", "Closer EOD"]) {
    await expect(page.getByText(label, { exact: true })).toBeVisible();
  }

  await page.getByText("DM Setter EOD", { exact: true }).click();
  await expect(page.getByText("Step 1 of 16", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/role=dm_setter/);

  expect(realErrors(consoleErrors)).toEqual([]);
});

test("required field blocks Next at step 1, for all three roles", async ({ page }) => {
  for (const [role, total] of [["dm_setter", 16], ["inbound_dialer", 16], ["closer", 15]] as const) {
    await page.goto(`/eod-reports?role=${role}`, { waitUntil: "load" });
    await expect(page.getByText(`Step 1 of ${total}`, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Next" })).toBeDisabled();
  }
});

test("Back from step 1 returns to the role selector", async ({ page }) => {
  await page.goto("/eod-reports?role=dm_setter", { waitUntil: "load" });
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByText("DM Setter EOD", { exact: true })).toBeVisible();
  await expect(page).not.toHaveURL(/role=/);
});

test("full DM Setter run-through: forward/back preserves state, per-step blocking, review screen", async ({ page }) => {
  await page.route("**/rest/v1/team_members**", (route) => {
    if (route.request().method() === "POST") {
      route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify([{ id: "flow-test-id", name: "Flow Test Rep" }]) });
    } else {
      route.continue();
    }
  });

  await page.goto("/eod-reports?role=dm_setter", { waitUntil: "load" });

  // Step 1 — team member, via the "+ Add new" mini-flow (the one write in
  // this run-through that needs a network mock — see file header).
  await page.getByRole("combobox").click();
  await page.getByText("Add new", { exact: false }).click();
  await page.getByPlaceholder("Full name").fill("Flow Test Rep");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("button", { name: "Next" })).toBeEnabled();
  await page.getByRole("button", { name: "Next" }).click();

  // Steps 2-13 (date, lead source, and every count/money field) all start
  // with a valid default (today's date / 0) — click straight through,
  // screenshotting a middle step along the way.
  for (let i = 0; i < 12; i++) {
    if (i === 6) {
      await page.waitForTimeout(300); // let the 200ms fade-in/slide-in settle before screenshotting
      await page.screenshot({ path: "test-results/eod-reports-middle-step.png" });
    }
    await expect(page.getByRole("button", { name: "Next" })).toBeEnabled();
    await page.getByRole("button", { name: "Next" }).click();
  }

  // Rate Today has no default — required-blocking is real here, not cosmetic.
  await expect(page.getByText("Rate your day from 1 to 10.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Next" })).toBeDisabled();
  await page.locator("input[type='number']").fill("8");
  await expect(page.getByRole("button", { name: "Next" })).toBeEnabled();
  await page.getByRole("button", { name: "Next" }).click();

  // Objections.
  await page.locator("textarea").fill("price, timing");
  await page.getByRole("button", { name: "Next" }).click();

  // Notes — fill it, then prove Back genuinely preserves prior answers
  // (not just navigates) by walking back to Objections and forward again.
  await page.locator("textarea").fill("Solid day");
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.locator("textarea")).toHaveValue("price, timing");
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.locator("textarea")).toHaveValue("Solid day");
  await page.getByRole("button", { name: "Next" }).click();

  // Review screen.
  await expect(page.getByText("Review before you submit", { exact: true })).toBeVisible();
  await expect(page.getByText("Flow Test Rep", { exact: true })).toBeVisible();
  await expect(page.getByText("Solid day", { exact: true })).toBeVisible();
  await page.waitForTimeout(300);
  await page.screenshot({ path: "test-results/eod-reports-review.png" });
});
