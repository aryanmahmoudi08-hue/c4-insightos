import { describe, expect, it } from "vitest";
import {
  advanceCallback,
  advancePaymentRecovery,
  advanceRenewal,
  advanceSetterLifecycle,
  CLOSER_DISPOSITIONS,
  normalizeCloserDisposition,
  paymentQuality,
  paymentRecoveryStatus,
  webinarProfit,
} from "./operating-workflows";

describe("operating workflow transitions", () => {
  it("advances the canonical setter lifecycle", () => {
    expect(advanceSetterLifecycle("dm", "qualification")).toBe("qualification");
    expect(advanceSetterLifecycle("qualification", "set")).toBe("set");
    expect(() => advanceSetterLifecycle("dm", "cash")).toThrow("Invalid lifecycle transition");
  });

  it("advances callback recovery to cash", () => {
    expect(advanceCallback("requested", "due")).toBe("due");
    expect(advanceCallback("due", "completed")).toBe("completed");
    expect(advanceCallback("completed", "booked")).toBe("booked");
    expect(advanceCallback("booked", "closed")).toBe("closed");
    expect(advanceCallback("closed", "cash")).toBe("cash");
  });

  it("keeps payment recovery transitions deterministic", () => {
    expect(advancePaymentRecovery("failed", "retry")).toBe("retry");
    expect(() => advancePaymentRecovery("paid", "overdue")).toThrow("Invalid recovery transition");
  });

  it("supports the renewal workflow and terminal states", () => {
    expect(advanceRenewal("not_started", "outreach_started")).toBe("outreach_started");
    expect(advanceRenewal("outreach_started", "renewal_conversation")).toBe("renewal_conversation");
    expect(advanceRenewal("renewal_conversation", "proposal_sent")).toBe("proposal_sent");
    expect(advanceRenewal("proposal_sent", "renewed")).toBe("renewed");
    expect(() => advanceRenewal("renewed", "churned")).toThrow("Invalid renewal transition");
  });
});

describe("operating calculations", () => {
  it("calculates payment quality without division-by-zero artifacts", () => {
    expect(
      paymentQuality({
        depositsCents: 25000,
        contractedCents: 100000,
        collectedCents: 40000,
        scheduledFutureCents: 60000,
        failedCount: 1,
        onTimeCount: 3,
        paymentCount: 4,
      }),
    ).toMatchObject({
      depositConversionPct: 25,
      averageDepositCents: 6250,
      outstandingCents: 60000,
      onTimeRatePct: 75,
    });
    expect(
      paymentQuality({
        depositsCents: 0,
        contractedCents: 0,
        collectedCents: 0,
        scheduledFutureCents: 0,
        failedCount: 0,
        onTimeCount: 0,
        paymentCount: 0,
      }),
    ).toMatchObject({
      depositConversionPct: null,
      averageDepositCents: null,
      onTimeRatePct: null,
    });
  });

  it("does not fabricate webinar profit without costs", () => {
    expect(
      webinarProfit({
        contractedRevenueCents: 100000,
        cashCollectedCents: 50000,
        realizedRevenueCents: 80000,
        attributableCostsCents: null,
      }),
    ).toEqual({
      netProfitCents: null,
      profitMarginPct: null,
      status: "unavailable",
    });
  });

  it("computes webinar net profit only when costs exist", () => {
    expect(
      webinarProfit({
        contractedRevenueCents: 100000,
        cashCollectedCents: 50000,
        realizedRevenueCents: 80000,
        attributableCostsCents: 20000,
      }),
    ).toMatchObject({
      netProfitCents: 60000,
      profitMarginPct: 75,
      status: "computed",
    });
  });

  it("derives payment recovery states from due dates and provider statuses", () => {
    expect(paymentRecoveryStatus({ dueDays: -3, paymentStatus: null })).toBe("overdue");
    expect(paymentRecoveryStatus({ dueDays: 0, paymentStatus: "failed" })).toBe("failed");
    expect(paymentRecoveryStatus({ dueDays: 0, paymentStatus: "paid" })).toBe("paid");
    expect(paymentRecoveryStatus({ dueDays: 3, paymentStatus: null })).toBe("due");
  });

  it("normalizes legacy closer statuses into the canonical taxonomy", () => {
    expect(normalizeCloserDisposition("closed", true)).toBe("closed_won");
    expect(normalizeCloserDisposition("offer_made", false, true)).toBe("follow_up");
    expect(normalizeCloserDisposition("no_show")).toBe("no_show");
    expect(normalizeCloserDisposition("rescheduled")).toBe("reschedule");
    expect(normalizeCloserDisposition("disqualified")).toBe("not_qualified");
    expect(normalizeCloserDisposition("unmapped_status")).toBe("unknown");
  });

  it("exposes one canonical closer disposition taxonomy", () => {
    expect(CLOSER_DISPOSITIONS.map((x) => x.value)).toEqual([
      "closed_won",
      "closed_lost",
      "deposit_pending",
      "follow_up",
      "no_show",
      "reschedule",
      "not_qualified",
      "unknown",
    ]);
  });
});
