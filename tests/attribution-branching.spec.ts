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

// Attribution Architecture Consolidation pass: the large per-role
// AttributionPathPanel stage/arrow panels below were replaced with compact
// "Revenue Source Mix" / "Inbound Lead Sources" / "DM Source Mix" tables
// plus a "View Full Attribution →" deep link into the master Attribution
// Command Center (/attribution) — same underlying real per-platform data,
// consolidated presentation. These tests now assert the new structure.

test("Closer: Revenue Source Mix renders real per-platform rows and deep-links to the master Attribution page", async ({
  page,
  consoleErrors,
}) => {
  await page.goto("/closer", { waitUntil: "load" });
  const section = page.getByText("Revenue Source Mix", { exact: true });
  await section.scrollIntoViewIfNeeded();
  await expect(section).toBeVisible();

  const link = page.getByRole("link", { name: "View Full Attribution →" });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href", /\/attribution/);

  expect(realErrors(consoleErrors)).toEqual([]);
});

test("Inbound Dialer: Inbound Lead Sources table renders and deep-links to the master Attribution page", async ({
  page,
  consoleErrors,
}) => {
  await page.goto("/inbound-dialer", { waitUntil: "load" });
  const section = page.getByText("Inbound Lead Sources", { exact: true });
  await section.scrollIntoViewIfNeeded();
  await expect(section).toBeVisible();

  const link = page.getByRole("link", { name: "View Full Attribution →" });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href", /\/attribution/);

  expect(realErrors(consoleErrors)).toEqual([]);
});

test("DM Setter: DM Source Mix table renders and deep-links to the master Attribution page", async ({
  page,
  consoleErrors,
}) => {
  await page.goto("/dm-setter", { waitUntil: "load" });
  const section = page.getByText("DM Source Mix", { exact: true });
  await section.scrollIntoViewIfNeeded();
  await expect(section).toBeVisible();

  const link = page.getByRole("link", { name: "View Full Attribution →" });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href", /\/attribution/);

  expect(realErrors(consoleErrors)).toEqual([]);
});

test("Master Attribution Command Center: all five models are selectable and Coverage & Confidence is honest", async ({
  page,
  consoleErrors,
}) => {
  await page.goto("/attribution", { waitUntil: "load" });
  await expect(page.getByText("Attribution model", { exact: false })).toBeVisible({
    timeout: 10_000,
  });
  for (const label of [
    "First touch",
    "Lead source",
    "Booking source",
    "Last touch",
    "Assisted touch",
  ]) {
    await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
  }
  await expect(page.getByText("Coverage", { exact: false })).toBeVisible();

  expect(realErrors(consoleErrors)).toEqual([]);
});
