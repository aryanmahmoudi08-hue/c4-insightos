import { describe, expect, it } from "vitest";
import {
  resolveProcessorLabel,
  resolvePaymentTypeLabel,
  resolvePlanStructure,
  formatPlanStructure,
  dealClassification,
  computeClientCashPosition,
  groupByProcessor,
  groupByPaymentType,
  groupByTicketTier,
  groupByDealClassification,
  type OfferPaymentPlanRow,
} from "./payments-ledger";

const money = (cents: number) => `$${(cents / 100).toLocaleString()}`;

describe("resolveProcessorLabel", () => {
  it("returns a friendly label for a known processor", () => {
    expect(resolveProcessorLabel("whop")).toBe("Whop");
    expect(resolveProcessorLabel("fanbasis")).toBe("Fanbasis");
  });
  it("is honest about unlogged payments, never guessing", () => {
    expect(resolveProcessorLabel(null)).toBe("Not logged");
    expect(resolveProcessorLabel(undefined)).toBe("Not logged");
  });
  it("falls back to the raw value for an unrecognized processor", () => {
    expect(resolveProcessorLabel("square")).toBe("square");
  });
});

describe("resolvePaymentTypeLabel", () => {
  it("labels known types and stays honest about unlogged ones", () => {
    expect(resolvePaymentTypeLabel("pif")).toBe("Paid in Full");
    expect(resolvePaymentTypeLabel(null)).toBe("Not logged");
  });
});

const CATALOG_PLAN: OfferPaymentPlanRow = {
  id: "plan-1",
  offer_id: "offer-1",
  label: "2-pay",
  cadence: "biweekly",
  installment_amount_cents: 250_000,
  installment_count: 2,
  total_contracted_value_cents: 500_000,
  deposit_cents: 0,
};

describe("resolvePlanStructure", () => {
  it("returns Paid in Full for a non-payment-plan client, regardless of any linked plan", () => {
    const result = resolvePlanStructure(
      {
        payment_plan: false,
        installments_remaining: 0,
        installment_amount_cents: 0,
        contract_value_cents: 500_000,
      },
      CATALOG_PLAN,
    );
    expect(result.source).toBe("pif");
    expect(result.installmentCount).toBe(1);
    expect(result.totalCents).toBe(500_000);
  });

  it("uses the real catalog plan when linked — not a guess from flat fields", () => {
    const result = resolvePlanStructure(
      {
        payment_plan: true,
        installments_remaining: 1,
        installment_amount_cents: 999_999, // deliberately wrong — catalog wins
        contract_value_cents: 500_000,
      },
      CATALOG_PLAN,
    );
    expect(result.source).toBe("catalog");
    expect(result.installmentCount).toBe(2);
    expect(result.installmentAmountCents).toBe(250_000);
  });

  it("honestly labels an unlinked payment-plan client as custom, never matched to a plan it wasn't assigned", () => {
    const result = resolvePlanStructure(
      {
        payment_plan: true,
        installments_remaining: 5,
        installment_amount_cents: 100_000,
        contract_value_cents: 500_000,
      },
      null,
    );
    expect(result.source).toBe("custom");
    expect(result.label).toBe("Custom (unlinked)");
    expect(result.installmentCount).toBe(5);
  });
});

describe("formatPlanStructure", () => {
  it("formats a resolved installment plan as amount × count", () => {
    const structure = resolvePlanStructure(
      {
        payment_plan: true,
        installments_remaining: 2,
        installment_amount_cents: 250_000,
        contract_value_cents: 500_000,
      },
      CATALOG_PLAN,
    );
    expect(formatPlanStructure(structure, money)).toBe("$2,500 × 2");
  });
  it("formats PIF as Paid in full", () => {
    const structure = resolvePlanStructure(
      {
        payment_plan: false,
        installments_remaining: 0,
        installment_amount_cents: 0,
        contract_value_cents: 500_000,
      },
      null,
    );
    expect(formatPlanStructure(structure, money)).toBe("Paid in full");
  });
});

describe("dealClassification", () => {
  it("classifies a non-plan client as PIF", () => {
    expect(
      dealClassification(
        {
          payment_plan: false,
          installments_remaining: 0,
          installment_amount_cents: 0,
          contract_value_cents: 500_000,
        },
        null,
        null,
      ),
    ).toBe("pif");
  });
  it("classifies an MRR-cadence catalog plan as low_ticket_mrr", () => {
    const mrrPlan: OfferPaymentPlanRow = { ...CATALOG_PLAN, cadence: "mrr" };
    expect(
      dealClassification(
        {
          payment_plan: true,
          installments_remaining: 0,
          installment_amount_cents: 9_700,
          contract_value_cents: null,
        },
        mrrPlan,
        "single",
      ),
    ).toBe("low_ticket_mrr");
  });
  it("classifies an mrr-pricing offer even if the linked plan's own cadence isn't 'mrr'", () => {
    expect(
      dealClassification(
        {
          payment_plan: true,
          installments_remaining: 0,
          installment_amount_cents: 9_700,
          contract_value_cents: null,
        },
        CATALOG_PLAN,
        "mrr",
      ),
    ).toBe("low_ticket_mrr");
  });
  it("never guesses MRR for an unlinked payment-plan client — defaults to payment_plan", () => {
    expect(
      dealClassification(
        {
          payment_plan: true,
          installments_remaining: 5,
          installment_amount_cents: 100_000,
          contract_value_cents: 500_000,
        },
        null,
        null,
      ),
    ).toBe("payment_plan");
  });
});

describe("computeClientCashPosition", () => {
  const client = { id: "c1", contract_value_cents: 500_000, expected_next_payment_cents: 100_000 };
  it("sums only paid payments for the given client", () => {
    const result = computeClientCashPosition(client, [
      { id: "p1", client_id: "c1", amount_cents: 200_000, status: "paid" },
      { id: "p2", client_id: "c1", amount_cents: 50_000, status: "failed" },
      { id: "p3", client_id: "c2", amount_cents: 999_999, status: "paid" },
    ]);
    expect(result.collectedCents).toBe(200_000);
    expect(result.outstandingCents).toBe(300_000);
    expect(result.forecastedCents).toBe(100_000);
  });
  it("dedupes payment rows by id", () => {
    const dupe = { id: "p1", client_id: "c1", amount_cents: 200_000, status: "paid" };
    const result = computeClientCashPosition(client, [dupe, dupe]);
    expect(result.collectedCents).toBe(200_000);
  });
  it("never lets outstanding go negative when overpaid", () => {
    const result = computeClientCashPosition(client, [
      { id: "p1", client_id: "c1", amount_cents: 900_000, status: "paid" },
    ]);
    expect(result.outstandingCents).toBe(0);
  });
});

describe("grouping helpers", () => {
  it("groupByProcessor totals by processor and honestly buckets nulls as Not logged", () => {
    const rows = groupByProcessor([
      { processor: "whop", amount_cents: 100 },
      { processor: "whop", amount_cents: 200 },
      { processor: null, amount_cents: 50 },
    ]);
    expect(rows).toEqual([
      { key: "whop", label: "Whop", totalCents: 300, count: 2 },
      { key: "unlogged", label: "Not logged", totalCents: 50, count: 1 },
    ]);
  });

  it("groupByPaymentType totals by type", () => {
    const rows = groupByPaymentType([
      { payment_type: "deposit", amount_cents: 100 },
      { payment_type: "pif", amount_cents: 500 },
    ]);
    expect(rows.find((r) => r.key === "pif")?.totalCents).toBe(500);
  });

  it("groupByTicketTier uses the provided label map", () => {
    const rows = groupByTicketTier(
      [
        { tierKey: "high", amount_cents: 500 },
        { tierKey: "low", amount_cents: 100 },
      ],
      new Map([
        ["high", "High Ticket"],
        ["low", "Low Ticket"],
      ]),
    );
    expect(rows).toEqual([
      { key: "high", label: "High Ticket", totalCents: 500, count: 1 },
      { key: "low", label: "Low Ticket", totalCents: 100, count: 1 },
    ]);
  });

  it("groupByDealClassification totals by classification", () => {
    const rows = groupByDealClassification([
      { classification: "pif", amount_cents: 500 },
      { classification: "payment_plan", amount_cents: 300 },
      { classification: "payment_plan", amount_cents: 200 },
    ]);
    expect(rows.find((r) => r.key === "payment_plan")?.totalCents).toBe(500);
  });
});
