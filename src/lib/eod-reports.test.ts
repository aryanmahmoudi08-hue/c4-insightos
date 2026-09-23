import { describe, expect, it } from "vitest";
import { buildClosureCallPayload } from "./eod-reports";

// Remediation (metric-dictionary audit, SALE-0394): calls.payment_plan must
// be written from explicit closer intent (the new Payment Plan checkbox
// question), never inferred from deposit/installment amounts.
describe("buildClosureCallPayload — payment_plan", () => {
  const baseValues = {
    status: "Closed",
    closer_name: "Jordan",
    lead_email: "lead@example.com",
    date_of_call: "2026-06-01T10:00",
    offer_made: true,
    cash_collected: 500,
    total_revenue: 2000,
    summary: "Closed on the call.",
    recording_url: "https://example.com/rec",
  };

  it("writes payment_plan: true when the checkbox was checked", () => {
    const payload = buildClosureCallPayload("org-1", { ...baseValues, payment_plan: true });
    expect(payload?.payment_plan).toBe(true);
  });

  it("writes payment_plan: false when the checkbox was left unchecked", () => {
    const payload = buildClosureCallPayload("org-1", { ...baseValues, payment_plan: false });
    expect(payload?.payment_plan).toBe(false);
  });

  it("defaults to false when the field is entirely absent, not inferred from cash/deposit amounts", () => {
    // cash_collected (500) is less than total_revenue (2000) here — a
    // real-world payment-plan-shaped submission — but payment_plan must
    // still default to false rather than being guessed from that gap.
    const payload = buildClosureCallPayload("org-1", baseValues);
    expect(payload?.payment_plan).toBe(false);
  });

  it("a non-boolean value never coerces to true", () => {
    const payload = buildClosureCallPayload("org-1", {
      ...baseValues,
      payment_plan: "on" as unknown as boolean,
    });
    expect(payload?.payment_plan).toBe(false);
  });
});
