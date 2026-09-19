import { describe, expect, it } from "vitest";
import {
  daysBetween,
  generatePaymentSchedule,
  paymentProgress,
  buildRecoveryQueue,
  reconcileRecoveryQueue,
  installmentUrgency,
  expectedVsActualSeries,
  collectionRatePct,
  effectiveScheduleStatus,
  renewalRatePct,
  renewalPipelineValueCents,
  churnedValueCents,
  renewalConversionBy,
  averageTenureAtRenewalOutcome,
  collectedLtvByOffer,
  churnReasonBreakdown,
  paymentPlanCompletionRatePct,
  onTimePaymentRatePct,
  failedPaymentRatePct,
  refundRatePct,
  outstandingBalanceAging,
} from "./mentee-payments";

const FIXED_NOW = new Date("2026-09-03T12:00:00");

describe("generatePaymentSchedule", () => {
  it("returns nothing for a non-payment-plan mentee", () => {
    expect(
      generatePaymentSchedule({
        id: "1",
        payment_plan: false,
        installments_remaining: 5,
        installment_amount_cents: 50000,
        expected_next_payment_date: "2026-10-01",
      }),
    ).toEqual([]);
  });

  it("generates one row per remaining installment, monthly cadence", () => {
    const rows = generatePaymentSchedule({
      id: "1",
      payment_plan: true,
      installments_remaining: 3,
      installment_amount_cents: 50000,
      expected_next_payment_date: "2026-10-01",
    });
    expect(rows).toEqual([
      { due_date: "2026-10-01", amount_cents: 50000 },
      { due_date: "2026-11-01", amount_cents: 50000 },
      { due_date: "2026-12-01", amount_cents: 50000 },
    ]);
  });

  it("returns nothing when installment amount or date is missing", () => {
    expect(
      generatePaymentSchedule({
        id: "1",
        payment_plan: true,
        installments_remaining: 3,
        installment_amount_cents: 0,
        expected_next_payment_date: "2026-10-01",
      }),
    ).toEqual([]);
    expect(
      generatePaymentSchedule({
        id: "1",
        payment_plan: true,
        installments_remaining: 3,
        installment_amount_cents: 50000,
        expected_next_payment_date: null,
      }),
    ).toEqual([]);
  });
});

describe("paymentProgress", () => {
  it("counts paid vs total", () => {
    const items = [
      { id: "a", client_id: "1", due_date: "2026-09-01", amount_cents: 100, status: "paid" },
      { id: "b", client_id: "1", due_date: "2026-10-01", amount_cents: 100, status: "scheduled" },
      { id: "c", client_id: "1", due_date: "2026-11-01", amount_cents: 100, status: "paid" },
    ];
    expect(paymentProgress(items)).toEqual({ paid: 2, total: 3, label: "2/3 paid" });
  });
  it("shows a dash with no schedule", () => {
    expect(paymentProgress([])).toEqual({ paid: 0, total: 0, label: "—" });
  });
});

describe("buildRecoveryQueue", () => {
  const client = {
    id: "1",
    full_name: "Jamie",
    offer_name: "Coaching",
    expected_next_payment_date: "2026-09-01",
    expected_next_payment_cents: 50000,
    contract_value_cents: 500000,
    invested_to_date_cents: 100000,
  };

  it("buckets an overdue 1-7d payment", () => {
    const rows = buildRecoveryQueue([client], [], FIXED_NOW);
    expect(rows.some((r) => r.bucket === "overdue_1_7")).toBe(true);
  });

  it("buckets a payment due within 3 days", () => {
    const dueSoon = { ...client, expected_next_payment_date: "2026-09-05" };
    const rows = buildRecoveryQueue([dueSoon], [], FIXED_NOW);
    expect(rows.some((r) => r.bucket === "due_next_3d")).toBe(true);
  });

  it("flags a failed payment today", () => {
    const rows = buildRecoveryQueue(
      [client],
      [{ client_id: "1", status: "failed", collected_at: "2026-09-03T09:00:00Z" }],
      FIXED_NOW,
    );
    expect(rows.some((r) => r.bucket === "failed_today")).toBe(true);
  });

  it("flags high-value outstanding balances", () => {
    const rows = buildRecoveryQueue([client], [], FIXED_NOW);
    expect(rows.some((r) => r.bucket === "high_value_outstanding")).toBe(true);
  });

  it("does not flag a mentee with no due date and low balance", () => {
    const clean = {
      id: "2",
      full_name: "Sam",
      offer_name: null,
      expected_next_payment_date: null,
      expected_next_payment_cents: null,
      contract_value_cents: 100000,
      invested_to_date_cents: 100000,
    };
    expect(buildRecoveryQueue([clean], [], FIXED_NOW)).toEqual([]);
  });
});

describe("installmentUrgency", () => {
  it("is paid once the stored status says paid, regardless of date", () => {
    expect(installmentUrgency({ due_date: "2020-01-01", status: "paid" }, FIXED_NOW)).toBe("paid");
  });
  it("is overdue once the due date has passed", () => {
    expect(installmentUrgency({ due_date: "2026-09-01", status: "scheduled" }, FIXED_NOW)).toBe(
      "overdue",
    );
  });
  it("is due_today on the due date itself", () => {
    expect(installmentUrgency({ due_date: "2026-09-03", status: "scheduled" }, FIXED_NOW)).toBe(
      "due_today",
    );
  });
  it("is due_soon within the next 3 days", () => {
    expect(installmentUrgency({ due_date: "2026-09-05", status: "scheduled" }, FIXED_NOW)).toBe(
      "due_soon",
    );
  });
  it("is scheduled further out than 3 days", () => {
    expect(installmentUrgency({ due_date: "2026-09-20", status: "scheduled" }, FIXED_NOW)).toBe(
      "scheduled",
    );
  });
});

describe("reconcileRecoveryQueue", () => {
  const client = {
    id: "1",
    full_name: "Jamie",
    offer_name: "Coaching",
    expected_next_payment_date: "2026-09-01",
    expected_next_payment_cents: 50000,
    contract_value_cents: 500000,
    invested_to_date_cents: 100000,
  };

  it("groups a client's multiple buckets into one active row", () => {
    // This client is both overdue_1_7 AND high_value_outstanding — must
    // collapse to a single row, not one per bucket.
    const { active } = reconcileRecoveryQueue([client], [], [], FIXED_NOW);
    expect(active).toHaveLength(1);
    expect(active[0].buckets).toEqual(
      expect.arrayContaining(["overdue_1_7", "high_value_outstanding"]),
    );
  });

  it("marks a qualifying client with no recovery-item row as untracked, not missing", () => {
    const { active } = reconcileRecoveryQueue([client], [], [], FIXED_NOW);
    expect(active[0].tracked).toBe(false);
    expect(active[0].recoveryItem).toBeNull();
  });

  it("attaches the real open recovery-item row when one exists", () => {
    const item = {
      id: "r1",
      client_id: "1",
      status: "retry",
      owner_id: null,
      next_action: "Retry payment",
      next_action_at: "2026-09-02T00:00:00Z",
    };
    const { active } = reconcileRecoveryQueue([client], [], [item], FIXED_NOW);
    expect(active[0].tracked).toBe(true);
    expect(active[0].recoveryItem).toEqual(item);
  });

  it("ignores a recovery-item row whose status is already closed", () => {
    const item = {
      id: "r1",
      client_id: "1",
      status: "recovered",
      owner_id: null,
      next_action: null,
      next_action_at: null,
    };
    const { active } = reconcileRecoveryQueue([client], [], [item], FIXED_NOW);
    expect(active[0].tracked).toBe(false);
  });

  it("moves a recovery-item row to stale once its client no longer qualifies", () => {
    const paidOff = {
      id: "2",
      full_name: "Sam",
      offer_name: null,
      expected_next_payment_date: null,
      expected_next_payment_cents: null,
      contract_value_cents: 100000,
      invested_to_date_cents: 100000,
    };
    const item = {
      id: "r2",
      client_id: "2",
      status: "overdue",
      owner_id: null,
      next_action: null,
      next_action_at: null,
    };
    const { active, stale } = reconcileRecoveryQueue([paidOff], [], [item], FIXED_NOW);
    expect(active).toHaveLength(0);
    expect(stale).toHaveLength(1);
    expect(stale[0].recoveryItem.id).toBe("r2");
    expect(stale[0].client?.id).toBe("2");
  });

  it("sums totalCents from active rows only, never stale ones", () => {
    const paidOff = {
      id: "2",
      full_name: "Sam",
      offer_name: null,
      expected_next_payment_date: null,
      expected_next_payment_cents: null,
      contract_value_cents: 100000,
      invested_to_date_cents: 100000,
    };
    const staleItem = {
      id: "r2",
      client_id: "2",
      status: "overdue",
      owner_id: null,
      next_action: null,
      next_action_at: null,
    };
    const { totalCents, active } = reconcileRecoveryQueue(
      [client, paidOff],
      [],
      [staleItem],
      FIXED_NOW,
    );
    expect(totalCents).toBe(active.reduce((s, r) => s + r.amountCents, 0));
    expect(totalCents).toBeGreaterThan(0);
  });
});

describe("expectedVsActualSeries", () => {
  it("buckets expected and actual cash by day within range", () => {
    const series = expectedVsActualSeries(
      [{ due_date: "2026-09-01", amount_cents: 50000 }],
      [{ collected_at: "2026-09-01T10:00:00Z", amount_cents: 45000, status: "paid" }],
      "2026-09-01",
      "2026-09-30",
    );
    expect(series).toEqual([{ date: "2026-09-01", expectedCents: 50000, actualCents: 45000 }]);
  });

  it("ignores unpaid payments and out-of-range rows", () => {
    const series = expectedVsActualSeries(
      [{ due_date: "2026-08-01", amount_cents: 50000 }],
      [{ collected_at: "2026-09-01T10:00:00Z", amount_cents: 45000, status: "pending" }],
      "2026-09-01",
      "2026-09-30",
    );
    expect(series).toEqual([]);
  });
});

describe("collectionRatePct", () => {
  it("returns null with no realized schedule items", () => {
    expect(collectionRatePct([{ status: "scheduled" }])).toBeNull();
  });
  it("computes paid / (paid+missed+overdue)", () => {
    expect(
      collectionRatePct([{ status: "paid" }, { status: "paid" }, { status: "missed" }]),
    ).toBeCloseTo(66.67, 1);
  });
});

describe("effectiveScheduleStatus", () => {
  it("keeps paid as paid regardless of date", () => {
    expect(effectiveScheduleStatus({ due_date: "2020-01-01", status: "paid" }, FIXED_NOW)).toBe(
      "paid",
    );
  });
  it("ages a scheduled item past due into overdue", () => {
    expect(
      effectiveScheduleStatus({ due_date: "2026-08-01", status: "scheduled" }, FIXED_NOW),
    ).toBe("overdue");
  });
  it("leaves a future scheduled item alone", () => {
    expect(
      effectiveScheduleStatus({ due_date: "2026-10-01", status: "scheduled" }, FIXED_NOW),
    ).toBe("scheduled");
  });
});

describe("daysBetween", () => {
  it("mirrors the client-risk daysUntilDate semantics", () => {
    expect(daysBetween(null, FIXED_NOW)).toBeNull();
    expect(daysBetween("2026-09-03", FIXED_NOW)).toBe(0);
    expect(daysBetween("2026-09-10", FIXED_NOW)).toBe(7);
  });
});

describe("renewalRatePct", () => {
  it("returns null with no decided outcomes", () => {
    expect(
      renewalRatePct([{ renewal_stage: "conversation_started", contract_value_cents: 1000 }]),
    ).toBeNull();
  });
  it("computes won / (won+churned), ignoring undecided mentees", () => {
    expect(
      renewalRatePct([
        { renewal_stage: "won", contract_value_cents: 1000 },
        { renewal_stage: "won", contract_value_cents: 1000 },
        { renewal_stage: "churned", contract_value_cents: 1000 },
        { renewal_stage: "negotiating", contract_value_cents: 1000 },
      ]),
    ).toBeCloseTo(66.67, 1);
  });
});

describe("renewalPipelineValueCents / churnedValueCents", () => {
  const clients = [
    { renewal_stage: "won", contract_value_cents: 500000 },
    { renewal_stage: "churned", contract_value_cents: 300000 },
    { renewal_stage: "negotiating", contract_value_cents: 200000 },
    { renewal_stage: null, contract_value_cents: 100000 },
  ];
  it("sums contract value of non-terminal-stage mentees for pipeline value", () => {
    expect(renewalPipelineValueCents(clients)).toBe(200000);
  });
  it("sums contract value of churned mentees for churned value", () => {
    expect(churnedValueCents(clients)).toBe(300000);
  });
});

describe("renewalConversionBy", () => {
  it("groups won/churned by key and computes a rate per key, ignoring undecided rows", () => {
    const rows = renewalConversionBy([
      { key: "Offer A", renewal_stage: "won" },
      { key: "Offer A", renewal_stage: "won" },
      { key: "Offer A", renewal_stage: "churned" },
      { key: "Offer B", renewal_stage: "churned" },
      { key: "Offer B", renewal_stage: "negotiating" },
    ]);
    expect(rows).toEqual([
      { key: "Offer A", won: 2, churned: 1, ratePct: expect.closeTo(66.67, 1) },
      { key: "Offer B", won: 0, churned: 1, ratePct: 0 },
    ]);
  });
});

describe("averageTenureAtRenewalOutcome", () => {
  it("returns null with no decided outcomes carrying a renewal_date", () => {
    expect(
      averageTenureAtRenewalOutcome([
        { renewal_stage: "won", start_date: "2026-01-01", renewal_date: null },
      ]),
    ).toBeNull();
  });
  it("averages days between start_date and renewal_date for decided mentees", () => {
    expect(
      averageTenureAtRenewalOutcome([
        { renewal_stage: "won", start_date: "2026-01-01", renewal_date: "2026-04-01" },
        { renewal_stage: "churned", start_date: "2026-01-01", renewal_date: "2026-02-01" },
      ]),
    ).toBeCloseTo((90 + 31) / 2, 0);
  });
});

describe("collectedLtvByOffer", () => {
  it("sums only paid payments, grouped by the client's offer", () => {
    const offerByClientId = new Map([
      ["c1", "Offer A"],
      ["c2", "Offer B"],
    ]);
    const rows = collectedLtvByOffer(
      [
        { client_id: "c1", amount_cents: 1000, status: "paid" },
        { client_id: "c1", amount_cents: 500, status: "failed" },
        { client_id: "c2", amount_cents: 2000, status: "paid" },
      ],
      offerByClientId,
    );
    expect(rows).toEqual([
      { offer: "Offer B", collectedCents: 2000 },
      { offer: "Offer A", collectedCents: 1000 },
    ]);
  });
});

describe("churnReasonBreakdown", () => {
  it("falls back to 'Not tracked' when no reason is recorded", () => {
    const reasonByClientId = new Map<string, string | null>([["c1", "Price"]]);
    expect(churnReasonBreakdown(["c1", "c2"], reasonByClientId)).toEqual([
      { reason: "Price", count: 1 },
      { reason: "Not tracked", count: 1 },
    ]);
  });
});

describe("paymentPlanCompletionRatePct", () => {
  it("returns null with no schedule items", () => {
    expect(paymentPlanCompletionRatePct([])).toBeNull();
  });
  it("computes paid / all scheduled items, including not-yet-due ones", () => {
    expect(
      paymentPlanCompletionRatePct([
        { status: "paid" },
        { status: "paid" },
        { status: "scheduled" },
      ]),
    ).toBeCloseTo(66.67, 1);
  });
});

describe("onTimePaymentRatePct", () => {
  it("returns null when no paid item is linked to a real payment", () => {
    expect(
      onTimePaymentRatePct(
        [{ due_date: "2026-09-01", payment_id: null, status: "paid" }],
        new Map(),
      ),
    ).toBeNull();
  });
  it("counts a linked payment collected on/before the due date as on-time", () => {
    const paymentsById = new Map([
      ["p1", { collected_at: "2026-09-01T00:00:00Z" }],
      ["p2", { collected_at: "2026-09-15T00:00:00Z" }],
    ]);
    expect(
      onTimePaymentRatePct(
        [
          { due_date: "2026-09-01", payment_id: "p1", status: "paid" },
          { due_date: "2026-09-10", payment_id: "p2", status: "paid" },
        ],
        paymentsById,
      ),
    ).toBe(50);
  });
});

describe("failedPaymentRatePct", () => {
  it("returns null with no paid/failed attempts", () => {
    expect(failedPaymentRatePct([{ status: "pending" }])).toBeNull();
  });
  it("computes failed / (paid+failed)", () => {
    expect(
      failedPaymentRatePct([{ status: "paid" }, { status: "paid" }, { status: "failed" }]),
    ).toBeCloseTo(33.33, 1);
  });
});

describe("refundRatePct", () => {
  it("returns null with no paid/refunded rows", () => {
    expect(refundRatePct([{ status: "pending" }])).toBeNull();
  });
  it("computes refunded / (paid+refunded)", () => {
    expect(
      refundRatePct([
        { status: "paid" },
        { status: "paid" },
        { status: "paid" },
        { status: "refunded" },
      ]),
    ).toBe(25);
  });
});

describe("outstandingBalanceAging", () => {
  it("buckets not-yet-paid items by how overdue they are, and skips paid items", () => {
    const buckets = outstandingBalanceAging(
      [
        { due_date: "2026-09-10", amount_cents: 100, status: "scheduled" },
        { due_date: "2026-09-01", amount_cents: 200, status: "overdue" },
        { due_date: "2026-08-20", amount_cents: 300, status: "overdue" },
        { due_date: "2026-07-01", amount_cents: 400, status: "overdue" },
        { due_date: "2026-09-01", amount_cents: 9999, status: "paid" },
      ],
      FIXED_NOW,
    );
    expect(buckets).toEqual({
      current: 100,
      overdue_1_7: 200,
      overdue_8_30: 300,
      overdue_31_plus: 400,
    });
  });
});
