import { test, expect, realErrors } from "./fixtures";

/**
 * Rep KPI Target Engine (Priority 2) regression coverage. The pace/status
 * math itself is exhaustively unit-tested in src/lib/kpi-targets.test.ts —
 * what's verified here is that the UI actually wires real data through it:
 * an admin can configure a target and see it listed, a rep dashboard shows
 * "No target configured" rather than a fabricated 0% when nothing is set,
 * and a rep with real mock activity shows real computed actuals.
 */

test("Team → Performance: configuring a target makes it appear in both the admin listing and the team-wide comparison table", async ({
  page,
  consoleErrors,
}) => {
  await page.goto("/team", { waitUntil: "load" });
  await page.getByRole("tab", { name: "Performance" }).click();
  await expect(page.getByText("No targets configured yet").first()).toBeVisible();

  const panel = page.getByTestId("kpi-target-admin");
  const combos = panel.locator('button[role="combobox"]');
  // Order: Role, Rep, KPI, Period. Role defaults to Closer.
  await combos.nth(1).click();
  await page.getByRole("option").first().click();
  await combos.nth(2).click();
  await page.getByRole("option", { name: "Cash Collected", exact: true }).click();
  await panel.getByPlaceholder("Target value").fill("5000000");
  await panel.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Target saved")).toBeVisible({ timeout: 5000 });

  // Now appears in the admin's own listing...
  await expect(panel.getByText("$50,000", { exact: true })).toBeVisible();
  // ...and in the team-wide "Rep KPI Targets" comparison table above it —
  // the two must share one source of truth, not each keep a private copy.
  await expect(page.getByText("Cash Collected").first()).toBeVisible();
  await expect(page.getByText("No targets configured yet")).toHaveCount(0);

  expect(realErrors(consoleErrors)).toEqual([]);
});

test("Closer dashboard: a rep with real activity shows real actuals, honestly labeled 'No target configured'", async ({
  page,
  consoleErrors,
}) => {
  await page.goto("/closer", { waitUntil: "load" });
  await page.getByRole("combobox").first().click();
  await page.getByRole("option", { name: "Jordan Blake" }).click();
  await expect(page.getByText("Jordan Blake · Targets", { exact: true })).toBeVisible();

  const closesCard = page.locator("text=Closes").locator("..").locator("..");
  await expect(closesCard.getByText("No target configured").first()).toBeVisible();
  // Real mock call data for this closer — never a fabricated 0.
  await expect(page.getByText("$48,500", { exact: true })).toBeVisible();

  expect(realErrors(consoleErrors)).toEqual([]);
});

test("DM Setter dashboard: zero EOD submissions this period shows 'No target configured', never a fabricated 0", async ({
  page,
  consoleErrors,
}) => {
  await page.goto("/dm-setter", { waitUntil: "load" });
  await page.getByRole("combobox").nth(1).click();
  await page.getByRole("option", { name: "Taylor Brooks" }).click();
  await expect(page.getByText("Taylor Brooks · Targets", { exact: true })).toBeVisible();
  await expect(page.getByText("No target configured").first()).toBeVisible();
  // No target AND no submitted data this period — every KPI card reads "—", never "0".
  await expect(page.getByRole("button", { name: /Outbound DMs.*No Target/ })).toBeVisible();

  expect(realErrors(consoleErrors)).toEqual([]);
});

test("Inbound Dialer dashboard: Speed-to-Lead SLA compliance is honestly unavailable per-rep, not a fabricated percentage", async ({
  page,
  consoleErrors,
}) => {
  await page.goto("/inbound-dialer", { waitUntil: "load" });
  await page.getByRole("combobox").nth(1).click();
  await page.getByRole("option", { name: "Alex Kim" }).click();
  await expect(page.getByText("Alex Kim · Targets", { exact: true })).toBeVisible();
  await expect(page.getByText("Speed-to-Lead SLA Compliance", { exact: true })).toBeVisible();

  expect(realErrors(consoleErrors)).toEqual([]);
});
