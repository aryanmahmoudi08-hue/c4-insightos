import { describe, expect, it } from "vitest";
import { clientAtRiskReason, daysUntilDate, evaluateTransparentHealth } from "./client-risk";

const FIXED_NOW = new Date("2026-08-13T15:00:00");

describe("daysUntilDate", () => {
  it("returns null for no date", () => {
    expect(daysUntilDate(null, FIXED_NOW)).toBeNull();
    expect(daysUntilDate(undefined, FIXED_NOW)).toBeNull();
  });
  it("returns 0 for today", () => {
    expect(daysUntilDate("2026-08-13", FIXED_NOW)).toBe(0);
  });
  it("returns a positive count for a future date", () => {
    expect(daysUntilDate("2026-08-20", FIXED_NOW)).toBe(7);
  });
  it("returns a negative count for a past date", () => {
    expect(daysUntilDate("2026-08-01", FIXED_NOW)).toBe(-12);
  });
});

describe("clientAtRiskReason", () => {
  it("is not at-risk when there's no renewal date", () => {
    expect(
      clientAtRiskReason({ renewal_date: null, renewal_conv_started: false }, 30, FIXED_NOW),
    ).toBeNull();
  });

  it("flags an overdue renewal regardless of conversation status", () => {
    const reason = clientAtRiskReason(
      { renewal_date: "2026-08-01", renewal_conv_started: true },
      30,
      FIXED_NOW,
    );
    expect(reason).toBe("renewal 12d overdue");
  });

  it("flags a renewal inside the at-risk window with no conversation started", () => {
    const reason = clientAtRiskReason(
      { renewal_date: "2026-08-20", renewal_conv_started: false },
      30,
      FIXED_NOW,
    );
    expect(reason).toBe("renewal in 7d, no convo");
  });

  it("does NOT flag a renewal inside the window if a conversation already started", () => {
    expect(
      clientAtRiskReason({ renewal_date: "2026-08-20", renewal_conv_started: true }, 30, FIXED_NOW),
    ).toBeNull();
  });

  it("does NOT flag a renewal outside the configured window", () => {
    // 60 days out, window is 30
    expect(
      clientAtRiskReason(
        { renewal_date: "2026-10-12", renewal_conv_started: false },
        30,
        FIXED_NOW,
      ),
    ).toBeNull();
  });

  it("respects a different configured window", () => {
    // 45 days out — inside a 60-day window, outside a 30-day one
    const farOut = { renewal_date: "2026-09-27", renewal_conv_started: false };
    expect(clientAtRiskReason(farOut, 30, FIXED_NOW)).toBeNull();
    expect(clientAtRiskReason(farOut, 60, FIXED_NOW)).toBe("renewal in 45d, no convo");
  });
});

describe("transparent health", () => {
  it("returns unavailable when no dimensions are present", () => {
    expect(evaluateTransparentHealth({})).toMatchObject({
      status: "unavailable",
      score: null,
      availableDimensions: 0,
    });
  });

  it("explains at-risk status using renewal and payment reasons", () => {
    const result = evaluateTransparentHealth(
      {
        renewalDate: "2026-09-10",
        renewalConversationStarted: false,
        overdueCents: 120000,
        failedCents: 5000,
        daysSinceActivity: 9,
      },
      new Date("2026-09-01T12:00:00Z"),
    );
    expect(result.status).toBe("at_risk");
    expect(result.score).toBeLessThan(60);
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        "Renewal due in 9d with no conversation",
        "$1,200 overdue",
        "$50 failed payment amount",
        "No recent activity in 9d",
      ]),
    );
  });

  it("returns healthy when available dimensions have no risk signals", () => {
    expect(
      evaluateTransparentHealth({
        renewalDate: "2026-12-01",
        renewalConversationStarted: true,
        overdueCents: 0,
        failedCents: 0,
        daysSinceActivity: 2,
        unresolvedFollowUp: false,
      }),
    ).toMatchObject({ status: "healthy", score: 100, availableDimensions: 5 });
  });
});
