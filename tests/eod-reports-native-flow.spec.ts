import { test, expect, realErrors } from "./fixtures";

/**
 * Regression for the native, one-question-at-a-time EOD Reports rebuild
 * (replacing the Typeform placeholder). Verifies actual progression,
 * per-step required-blocking (including questions with no default value —
 * team-member/scale/short-text), Back preserving already-entered answers,
 * the review screen, and a real submission reaching success.
 */
test("EOD Reports: Dialer flow — progression, required blocking, back preserves state, submits", async ({
  page,
  consoleErrors,
}) => {
  await page.goto("/eod-reports?role=inbound_dialer", { waitUntil: "load" });
  await expect(page.getByText("Step 1 of 15")).toBeVisible({ timeout: 10_000 });

  // Name (team-member, no default) — genuinely required.
  await expect(page.getByRole("button", { name: "Next" })).toBeDisabled();
  await page.getByRole("combobox").click();
  await page.getByText("Dev Dialer").click();
  await expect(page.getByRole("button", { name: "Next" })).toBeEnabled();
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText("Step 2 of 15")).toBeVisible();

  // Date has a default — proceeds immediately.
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText("Step 3 of 15")).toBeVisible();

  // Dials — Back must preserve the entered value, not reset it.
  await page.locator('input[type="number"]').fill("50");
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.locator('input[type="number"]')).toHaveValue("50");
  await page.getByRole("button", { name: "Next" }).click();

  // Connections .. Total Revenue (9 more number questions).
  for (let i = 0; i < 9; i++) {
    await page.locator('input[type="number"]').fill("5");
    await page.getByRole("button", { name: "Next" }).click();
  }

  // Rate Today (scale, no default) — genuinely required.
  await expect(page.getByText("Step 13 of 15")).toBeVisible();
  await expect(page.getByRole("button", { name: "Next" })).toBeDisabled();
  await page.getByRole("button", { name: "7", exact: true }).click();
  await page.getByRole("button", { name: "Next" }).click();

  // Objections (required short text, no default).
  await expect(page.getByText("Step 14 of 15")).toBeVisible();
  await expect(page.getByRole("button", { name: "Next" })).toBeDisabled();
  await page.locator("input[type=text]").fill("Price objection");
  await page.getByRole("button", { name: "Next" }).click();

  // Notes (required short text, no default).
  await expect(page.getByText("Step 15 of 15")).toBeVisible();
  await expect(page.getByRole("button", { name: "Next" })).toBeDisabled();
  await page.locator("input[type=text]").fill("Good day overall.");
  await page.getByRole("button", { name: "Next" }).click();

  await expect(page.getByText("Review before you submit")).toBeVisible();
  await expect(page.getByText("Dev Dialer")).toBeVisible();
  await page.getByRole("button", { name: /Submit/ }).click();
  await expect(page.getByText("Logged.")).toBeVisible({ timeout: 10_000 });

  expect(realErrors(consoleErrors)).toEqual([]);
});

test("EOD Reports: DM Setter flow reaches review and submits (all 20 questions)", async ({
  page,
  consoleErrors,
}) => {
  await page.goto("/eod-reports?role=dm_setter", { waitUntil: "load" });
  await expect(page.getByText("Step 1 of 20")).toBeVisible({ timeout: 10_000 });

  await page.getByRole("combobox").click();
  await page.getByText("Dev Setter").click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Next" }).click();

  for (let step = 3; step <= 17; step++) {
    await expect(page.getByText(`Step ${step} of 20`)).toBeVisible();
    await page.locator('input[type="number"]').fill("3");
    await page.getByRole("button", { name: "Next" }).click();
  }

  await expect(page.getByText("Step 18 of 20")).toBeVisible();
  await page.getByRole("button", { name: "6", exact: true }).click();
  await page.getByRole("button", { name: "Next" }).click();

  await expect(page.getByText("Step 19 of 20")).toBeVisible();
  await page.locator("input[type=text]").fill("Timing objection");
  await page.getByRole("button", { name: "Next" }).click();

  await expect(page.getByText("Step 20 of 20")).toBeVisible();
  await page.locator("input[type=text]").fill("Solid day.");
  await page.getByRole("button", { name: "Next" }).click();

  await expect(page.getByText("Review before you submit")).toBeVisible();
  await page.getByRole("button", { name: /Submit/ }).click();
  await expect(page.getByText("Logged.")).toBeVisible({ timeout: 10_000 });

  expect(realErrors(consoleErrors)).toEqual([]);
});

test("EOD Reports: Closer Post-Call flow — Lead Status options, submits successfully", async ({
  page,
  consoleErrors,
}) => {
  await page.goto("/eod-reports?role=closer", { waitUntil: "load" });
  await expect(page.getByText("Step 1 of 9")).toBeVisible({ timeout: 10_000 });

  await page.getByRole("combobox").click();
  await page.getByText("Dev Closer").click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Next" }).click();

  await expect(page.getByText("Step 3 of 9")).toBeVisible();
  await expect(page.getByRole("button", { name: "Next" })).toBeDisabled();
  await page.locator('input[type="email"]').fill("lead@example.test");
  await page.getByRole("button", { name: "Next" }).click();

  await page.locator("textarea").fill("Great call, handled the price objection well.");
  await page.getByRole("button", { name: "Next" }).click();

  // Offer (checkbox, no default) — genuinely required.
  await expect(page.getByRole("button", { name: "Next" })).toBeDisabled();
  await page.getByRole("button", { name: "Yes" }).click();
  await page.getByRole("button", { name: "Next" }).click();

  // Lead Status — the exact requested 11-choice list.
  await page.getByRole("combobox").click();
  for (const choice of [
    "Closed",
    "Deposit",
    "No Show",
    "Follow Up (short term)",
    "Follow Up (long term)",
    "Lost",
    "Bad Fit",
    "DQ",
    "Cancelled",
    "Rescheduling",
    "IGNORE",
  ]) {
    await expect(page.getByRole("option", { name: choice, exact: true })).toBeVisible();
  }
  await page.getByRole("option", { name: "Closed", exact: true }).click();
  await page.getByRole("button", { name: "Next" }).click();

  await page.locator('input[type="number"]').fill("2000");
  await page.getByRole("button", { name: "Next" }).click();
  await page.locator('input[type="number"]').fill("5000");
  await page.getByRole("button", { name: "Next" }).click();
  await page.locator('input[type="url"]').fill("https://example.test/recording/1");
  await page.getByRole("button", { name: "Next" }).click();

  await expect(page.getByText("Review before you submit")).toBeVisible();
  await expect(page.getByText("Closed", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Submit/ }).click();
  await expect(page.getByText("Logged.")).toBeVisible({ timeout: 10_000 });

  expect(realErrors(consoleErrors)).toEqual([]);
});

test("EOD Reports: Closer IGNORE status shows an honest 'nothing was recorded' confirmation", async ({
  page,
  consoleErrors,
}) => {
  await page.goto("/eod-reports?role=closer", { waitUntil: "load" });
  await page.getByRole("combobox").click();
  await page.getByText("Dev Closer").click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.locator('input[type="email"]').fill("lead@example.test");
  await page.getByRole("button", { name: "Next" }).click();
  await page.locator("textarea").fill("Test entry, ignore this one.");
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "No" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("combobox").click();
  await page.getByRole("option", { name: "IGNORE", exact: true }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.locator('input[type="number"]').fill("0");
  await page.getByRole("button", { name: "Next" }).click();
  await page.locator('input[type="number"]').fill("0");
  await page.getByRole("button", { name: "Next" }).click();
  await page.locator('input[type="url"]').fill("https://example.test/recording/ignore-me");
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: /Submit/ }).click();
  await expect(page.getByText(/nothing was recorded/i)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("Logged.")).toBeVisible();

  expect(realErrors(consoleErrors)).toEqual([]);
});

test("EOD Reports: no Typeform embed anywhere in the flow", async ({ page }) => {
  await page.goto("/eod-reports", { waitUntil: "load" });
  await expect(page.locator("iframe")).toHaveCount(0);
  await expect(page.getByText(/typeform/i)).toHaveCount(0);
});
