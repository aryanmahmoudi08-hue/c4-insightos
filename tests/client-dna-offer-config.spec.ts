import { test, expect, realErrors } from "./fixtures";

/**
 * Regression for Client DNA's new Offer / Ticket / Payment Configuration
 * section — the source of truth for ticket tiers, offers, and payment
 * plans read by the Dialer's Active Leads tiers and the Typeform ingest
 * classifier. Covers creating a tier/offer/payment plan/classification
 * rule end to end (real interactions, not just presence checks).
 */
test("client dna: offer/ticket/payment configuration supports creating tiers, offers, payment plans, and classification rules", async ({
  page,
  consoleErrors,
}) => {
  await page.goto("/copy", { waitUntil: "load" });
  await expect(page.getByText("Offer / Ticket / Payment Configuration")).toBeVisible({
    timeout: 10_000,
  });

  // Not hardcoded to exactly two tiers — the seeded Low/High plus a new one.
  await expect(page.locator('input[value="Low Ticket"]')).toBeVisible();
  await expect(page.locator('input[value="High Ticket"]')).toBeVisible();
  await page.getByPlaceholder("New tier name (e.g. VIP)").fill("VIP");
  await page.getByRole("button", { name: "Add tier" }).click();
  await expect(page.locator('input[value="VIP"]')).toBeVisible({ timeout: 5000 });

  // Offer creation: name, tier, price, pricing type, active status.
  await page.getByRole("button", { name: "New offer" }).click();
  const offerNameInputs = page.getByPlaceholder("Offer name");
  await offerNameInputs.last().fill("Elite Mastermind");
  await page.getByPlaceholder("Price ($)").last().fill("7500");
  await page.getByRole("button", { name: "Add offer" }).click();
  await expect(page.locator('input[value="Elite Mastermind"]')).toBeVisible({ timeout: 5000 });

  // Payment plan configuration, scoped to a specific offer.
  await page.getByRole("button", { name: "New payment plan" }).click();
  await page.getByPlaceholder("Plan label").last().fill("6-pay plan");
  await page.getByPlaceholder("Installment ($)").last().fill("1250");
  await page.getByPlaceholder("# installments").last().fill("6");
  await page.getByRole("button", { name: "Add plan" }).click();
  await expect(page.locator('input[value="6-pay plan"]')).toBeVisible({ timeout: 5000 });

  // Classification rule: field key, operator, threshold, resulting tier —
  // an ordered rule structure, not logic embedded in the UI.
  await page.getByRole("button", { name: "New rule" }).click();
  await page
    .getByPlaceholder("Typeform field key (e.g. investment_budget)")
    .last()
    .fill("budget_field");
  await page.getByPlaceholder("Threshold ($)").last().fill("1000");
  await page.getByRole("button", { name: "Add rule" }).click();
  await expect(page.locator('input[value="budget_field"]')).toBeVisible({ timeout: 5000 });

  expect(realErrors(consoleErrors)).toEqual([]);
});
