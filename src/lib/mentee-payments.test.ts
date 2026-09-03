import { describe, expect, it } from "vitest";
import {
  daysBetween,
  generatePaymentSchedule,
  paymentProgress,
  buildRecoveryQueue,
  expectedVsActualSeries,
  collectionRatePct,
  effectiveScheduleStatus,
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
