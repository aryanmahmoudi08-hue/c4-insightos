import { test, expect, realErrors } from "./fixtures";

test("client dna: core profile precedes offer config, Persuasion DNA removed, tiers archive/delete safely", async ({
  page,
  consoleErrors,
}) => {
  page.on("dialog", (d) => d.accept());
  await page.goto("/copy", { waitUntil: "load" });

  // Persuasion DNA is gone.
  await expect(page.getByText("Persuasion DNA")).toHaveCount(0);
  await expect(page.getByText("Extract voice fingerprint")).toHaveCount(0);

  // Client DNA core profile now appears before Offer config (reordered).
  const clientNameY = (await page.getByText("Client name").boundingBox())?.y ?? 0;
  const offerConfigY =
    (await page.getByText("Offer / Ticket / Payment Configuration").boundingBox())?.y ?? 0;
  expect(clientNameY).toBeLessThan(offerConfigY);

  // Add a throwaway tier, then delete it (unreferenced -> hard delete after confirm).
  await page.getByPlaceholder("New tier name (e.g. VIP)").fill("Throwaway");
  await page.getByRole("button", { name: "Add tier" }).click();
  await expect(page.locator('input[value="Throwaway"]')).toBeVisible({ timeout: 5000 });
  const row = page.locator('input[value="Throwaway"]').locator("..");
  await row.getByRole("button", { name: "Delete" }).click();
  await expect(page.locator('input[value="Throwaway"]')).toHaveCount(0);

  // Archive a referenced tier (Low Ticket is used by the dev Starter Program
  // offer) and confirm it shows Archived + Reactivate, not gone.
  const lowRow = page.locator('input[value="Low Ticket"]').locator("..");
  await lowRow.getByRole("button", { name: "Delete" }).click();
  await expect(lowRow.getByText("Archived")).toBeVisible({ timeout: 5000 });
  await expect(lowRow.getByRole("button", { name: "Reactivate" })).toBeVisible();

  expect(realErrors(consoleErrors)).toEqual([]);
});
