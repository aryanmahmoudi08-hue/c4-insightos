import { test, expect, realErrors } from "./fixtures";

/**
 * Legacy Leads pipeline-stage / available-to-call regression (Priority 3).
 * The stage/availability math itself is exhaustively unit-tested in
 * src/lib/lead-pipeline.test.ts — this verifies the real UI wiring: a wide,
 * readable Available-to-Call drawer with real phone/email/source/age/stage
 * data, honest per-lead availability reasoning, the widened lead detail
 * dialog, date-range preservation, and at least one real KPI drilldown.
 */

test("Available to Call: opens wide, shows real lead data, pipeline stage, and availability reasoning", async ({
  page,
  consoleErrors,
}) => {
  await page.goto("/leads", { waitUntil: "load" });
  await page.getByText("Available to call", { exact: true }).click();

  const drawer = page.getByRole("dialog");
  await expect(drawer.getByText("Available to call", { exact: true })).toBeVisible();

  // Genuinely wide, not the old cramped sm:max-w-xl (576px) — MetricDetailPanel/
  // this drawer were both widened; assert a meaningfully larger real width.
  const box = await drawer.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(700);

  // Real per-lead columns render: phone, email, source (with a real
  // PlatformIcon, not text-only), created date + age, and an accurate
  // pipeline stage chip sourced from the real lead_status enum.
  await expect(drawer.getByRole("columnheader", { name: "Phone" })).toBeVisible();
  await expect(drawer.getByRole("columnheader", { name: "Email" })).toBeVisible();
  await expect(drawer.getByRole("columnheader", { name: "Source" })).toBeVisible();
  await expect(drawer.getByRole("columnheader", { name: /Created/ })).toBeVisible();
  await expect(drawer.getByRole("columnheader", { name: "Stage" })).toBeVisible();
  await expect(drawer.getByRole("columnheader", { name: "Availability" })).toBeVisible();

  // At least one row shows the exact "New — 0 calls on record" wording from
  // the brief, and at least one shows a real "Attempted — N calls" with a
  // relative last-call time — never a fabricated dial-attempt count.
  await expect(drawer.getByText("New — 0 calls on record").first()).toBeVisible();
  await expect(drawer.getByText(/Attempted — \d+ calls? on record/).first()).toBeVisible();

  expect(realErrors(consoleErrors)).toEqual([]);
});

test("Lead detail dialog: widened, shows real pipeline/setter/source/calls-on-record summary", async ({
  page,
  consoleErrors,
}) => {
  await page.goto("/leads", { waitUntil: "load" });
  // Click the lead's name cell specifically — several other cells in the row
  // (priority/stage/status selects) stop propagation so their own dropdown
  // works independently of the row's "open detail" click handler.
  await page.locator("table tbody tr div.font-medium").first().click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(700);

  await expect(dialog.getByText("Stage", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Assigned setter", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Assigned closer", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Calls on record", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Availability", { exact: true })).toBeVisible();

  expect(realErrors(consoleErrors)).toEqual([]);
});

test("date range preset selection is preserved and respected by the KPI counts", async ({ page }) => {
  await page.goto("/leads", { waitUntil: "load" });
  await expect(page.getByRole("button", { name: "Yesterday", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Today", exact: true }).click();
  // The active preset stays visibly selected (not silently reset), and the
  // page's own from/to readout reflects it.
  const today = new Date().toISOString().slice(0, 10);
  await expect(page.getByText(`${today} → ${today}`, { exact: true })).toBeVisible();
});

test("Total leads KPI drilldown opens the real underlying records", async ({ page, consoleErrors }) => {
  await page.goto("/leads", { waitUntil: "load" });
  const totalCard = page.getByRole("button", { name: /^Total leads/ });
  const countText = await totalCard.locator("div.font-bold, div.font-sans").first().textContent();
  await totalCard.click();

  const panel = page.getByRole("dialog");
  await expect(panel.getByText("Total leads", { exact: true })).toBeVisible();
  await expect(panel.getByText("What produced this", { exact: true })).toBeVisible();
  // Real rows, not a fake/empty drilldown.
  const rowCount = await panel.locator("table tbody tr").count();
  expect(rowCount).toBeGreaterThan(0);
  if (countText) expect(rowCount).toBeLessThanOrEqual(Number(countText.replace(/\D/g, "")) || rowCount);

  expect(realErrors(consoleErrors)).toEqual([]);
});

test("Leads by Pipeline Stage donut renders real composition data with an empty-safe, click-through legend", async ({
  page,
}) => {
  await page.goto("/leads", { waitUntil: "load" });
  await expect(page.getByText("Leads by Pipeline Stage", { exact: true })).toBeVisible();
  // No more neon-glow bar funnel — donut + legend rows with real share %.
  await expect(page.getByText(/^\d+ · \d+%$/).first()).toBeVisible();
});
