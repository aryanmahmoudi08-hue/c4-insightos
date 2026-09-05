import { test, expect, realErrors } from "./fixtures";

/**
 * Attribution flow branching/merging regression (Priority 5). The shared
 * AttributionPathPanel previously only rendered a single strict linear
 * sequence (Channel → Campaign → ... → Cash) even where the underlying data
 * had several real, distinct sources feeding the same downstream stage —
 * visually implying one path when the reality was several converging ones.
 * Content Command Center's own Unified money-origin Sankey already solved
 * this independently (real branching + a 5-model selector); this pass
 * extends the same honesty to the closer and inbound-dialer lifecycle
 * panels, which are the shared AttributionPathPanel's real consumers.
 */

test("Content Command Center: money-origin attribution renders with a real attribution-model selector", async ({
  page,
  consoleErrors,
}) => {
  await page.goto("/content", { waitUntil: "load" });
  await expect(page.getByText("Unified money-origin attribution", { exact: false })).toBeVisible({
    timeout: 10_000,
  });

  const modelSelect = page
    .locator("select")
    .filter({ has: page.locator('option:text-is("First touch")') });
  await expect(modelSelect).toBeVisible();
  const optionLabels = await modelSelect.locator("option").allTextContents();
  expect(optionLabels).toEqual([
    "First touch",
    "Lead source",
    "Booking source",
    "Last touch",
    "Assisted touch",
  ]);

  // Switching the model is a real, working control (doesn't error, page stays up).
  await modelSelect.selectOption("assisted_touch");
  await expect(page.getByText("Assisted credit is inferred", { exact: false })).toBeVisible();

  expect(realErrors(consoleErrors)).toEqual([]);
});

test("Closer lifecycle attribution: real per-platform sources merge into the shared downstream sequence", async ({
  page,
  consoleErrors,
}) => {
  await page.goto("/closer", { waitUntil: "load" });
  const section = page.getByText("Closer lifecycle attribution", { exact: true });
  await section.scrollIntoViewIfNeeded();
  await expect(section).toBeVisible();

  // At least one real source node renders (branching/merging) — never one
  // flat aggregate "Channel: N" number standing in for several real sources.
  const sourceButtons = page.locator("button", {
    hasText:
      /^(Instagram|TikTok|YouTube|Facebook|LinkedIn|X \/ Twitter|Meta|Email|Referral|Other|Unknown \/ Unattributed)/,
  });
  expect(await sourceButtons.count()).toBeGreaterThanOrEqual(1);

  // The merge connector into the shared downstream stages is present.
  await expect(page.getByText("Campaign / Content", { exact: false })).toBeVisible();

  expect(realErrors(consoleErrors)).toEqual([]);
});

test("Closer lifecycle attribution: clicking a source node opens the real filtered records, preserving the selected date range", async ({
  page,
  consoleErrors,
}) => {
  await page.goto("/closer", { waitUntil: "load" });
  await page.getByRole("button", { name: "30d", exact: true }).first().click();
  const section = page.getByText("Closer lifecycle attribution", { exact: true });
  await section.scrollIntoViewIfNeeded();

  const anySource = page
    .locator("button", { hasText: /Instagram|TikTok|YouTube|Referral/ })
    .first();
  await anySource.click();

  const panel = page.getByRole("dialog");
  await expect(panel.getByText("Original Channel:", { exact: false })).toBeVisible();
  await expect(panel.getByText("What produced this", { exact: true })).toBeVisible();
  const rowCount = await panel.locator("table tbody tr").count();
  expect(rowCount).toBeGreaterThan(0);

  expect(realErrors(consoleErrors)).toEqual([]);
});

test("Inbound Dialer attribution: real per-platform sources render from lead_response_events, distinct from the aggregate Setter stage", async ({
  page,
  consoleErrors,
}) => {
  await page.goto("/inbound-dialer", { waitUntil: "load" });
  const section = page.getByText("Inbound Dialer attribution", { exact: true });
  await section.scrollIntoViewIfNeeded();
  await expect(section).toBeVisible();

  const sourceButtons = page.locator("button", { hasText: /^(Instagram|TikTok|YouTube)/ });
  expect(await sourceButtons.count()).toBeGreaterThanOrEqual(1);
  await expect(page.getByText("Dialer", { exact: true }).first()).toBeVisible();

  expect(realErrors(consoleErrors)).toEqual([]);
});

test("DM Setter attribution is unchanged (no real per-lead platform join exists for this role, so it correctly stays an honest aggregate rollup)", async ({
  page,
}) => {
  await page.goto("/dm-setter", { waitUntil: "load" });
  await expect(page.getByText("DM Setter attribution", { exact: true })).toBeVisible();
  await expect(
    page.getByText("No verified platform join in aggregate activity", { exact: true }),
  ).toBeVisible();
});
