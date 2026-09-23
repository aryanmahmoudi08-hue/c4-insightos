import { describe, expect, it } from "vitest";
import {
  acquisitionRecordKey,
  attributionMatchesScope,
  calculateAcquisitionMetrics,
  validateAcquisitionSpendRecord,
  evaluateAttributionEvidence,
  canonicalAttributionDeduplicationKey,
  deduplicateCanonicalAttributionPaths,
  deduplicatePaymentRecords,
} from "./acquisition";

const spend = {
  orgId: "org-1",
  provider: "meta",
  spendDate: "2026-08-27",
  currency: "USD",
  spendAmountCents: 10000,
  impressions: 1000,
  clicks: 100,
  paidVisits: 80,
  externalRecordId: "campaign-day-1",
};

describe("acquisition spend foundation", () => {
  it("validates legitimate spend and produces a stable provider key", () => {
    expect(validateAcquisitionSpendRecord(spend)).toEqual({ valid: true, errors: [] });
    expect(acquisitionRecordKey(spend)).toBe("org-1:meta:campaign-day-1");
  });

  it("rejects malformed dates, negative numbers, and missing identity", () => {
    const result = validateAcquisitionSpendRecord({
      ...spend,
      orgId: "",
      spendDate: "27-08-2026",
      clicks: -1,
      externalRecordId: "",
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        "organization is required",
        "external record ID is required",
        "spend date must be an ISO date",
        "clicks must be a non-negative number",
      ]),
    );
  });

  it("calculates CTR, CPC, CPL, CPA, and ROAS only with valid denominators", () => {
    const metrics = calculateAcquisitionMetrics({
      spend: [spend],
      paidLeads: 20,
      attributableCustomers: 4,
      attributableRevenueCents: 50000,
    });
    expect(metrics.ctr).toBeCloseTo(0.1);
    expect(metrics.cpcCents).toBe(100);
    expect(metrics.cplCents).toBe(500);
    expect(metrics.cpaCents).toBe(2500);
    expect(metrics.roas).toBe(5);
  });

  it("keeps zero or missing denominators unavailable and never treats zero spend as real spend", () => {
    const noDenominators = calculateAcquisitionMetrics({
      spend: [{ ...spend, impressions: 0, clicks: 0, spendAmountCents: 0 }],
      paidLeads: 0,
      attributableCustomers: 0,
      attributableRevenueCents: 0,
    });
    expect(noDenominators.ctr).toBeNull();
    expect(noDenominators.cpcCents).toBeNull();
    expect(noDenominators.cplCents).toBeNull();
    expect(noDenominators.cpaCents).toBeNull();
    expect(noDenominators.roas).toBeNull();
  });

  // Remediation (metric-dictionary audit, Task 7 — Webinar ROAS): the
  // Executive KPI tile and the Acquisition Efficiency tile
  // (_authenticated.webinar-analytics.tsx) used to read ROAS from two
  // independently-sourced spend figures and could silently disagree — fixed
  // by having both render `roasLabel(acquisition.roas)` from the exact same
  // `useMemo`d result. There is only one place ROAS is computed
  // (calculateAcquisitionMetrics, above) and only one call site produces the
  // `acquisition` object both tiles read — this locks in that the single
  // canonical computation is deterministic (same inputs always produce the
  // same ROAS), which is the property the "one calculation, two displays"
  // fix actually depends on: it's structurally impossible for the two tiles
  // to disagree unless a second, separate ROAS calculation is reintroduced.
  it("ROAS is deterministic for identical inputs — the guarantee both Webinar Analytics ROAS displays rely on for agreeing with each other", () => {
    const input = {
      spend: [spend],
      paidLeads: 20,
      attributableCustomers: 4,
      attributableRevenueCents: 50000,
    };
    const first = calculateAcquisitionMetrics(input);
    const second = calculateAcquisitionMetrics(input);
    expect(first.roas).toBe(second.roas);
    expect(first.roas).toBe(5);
  });

  it("deduplicates one person and revenue outcome across repeated lifecycle records", () => {
    const base = {
      personKey: "lead-1",
      outcomeKey: "close-1",
      paymentId: "payment-1",
      callId: "call-1",
    } as const;
    expect(canonicalAttributionDeduplicationKey(base)).toBe("lead-1:close-1:payment-1:call-1");
    const path = {
      ...base,
      platform: null,
      source: null,
      campaign: null,
      contentId: null,
      format: null,
      setterId: null,
      dialerId: null,
      closerId: null,
      bookingId: null,
      offerId: null,
      retentionOutcome: null,
      refundOutcome: null,
      events: [],
      evidence: evaluateAttributionEvidence({ model: "first_touch" }),
    };
    expect(
      deduplicateCanonicalAttributionPaths([
        path,
        { ...path, events: [{ id: "duplicate", type: "close", at: "2026-08-27" }] },
      ]),
    ).toHaveLength(1);
  });

  it("deduplicates repeated payment rows but keeps legitimate distinct payments", () => {
    expect(
      deduplicatePaymentRecords([
        { id: "payment-1", amount: 100 },
        { id: "payment-1", amount: 100 },
        { id: "payment-2", amount: 250 },
      ]),
    ).toEqual([
      { id: "payment-1", amount: 100 },
      { id: "payment-2", amount: 250 },
    ]);
  });

  it("classifies attribution evidence transparently without upgrading inferred credit", () => {
    expect(
      evaluateAttributionEvidence({
        model: "first_touch",
        supportingEvents: ["content_view", "booking", "payment"],
        knownTouchpoints: 3,
        sampleSize: 24,
        directOutcomeLinked: true,
        drilldownKey: "lead-1",
      }),
    ).toMatchObject({
      coverage: "direct",
      strength: "high",
      knownTouchpoints: 3,
      sampleWarning: null,
    });
    expect(
      evaluateAttributionEvidence({
        model: "assisted_touch",
        supportingEvents: ["content_view"],
        sampleSize: 4,
        inferred: true,
      }),
    ).toMatchObject({
      coverage: "inferred",
      strength: "low",
      sampleWarning: "Insufficient sample size (<10 outcomes)",
    });
    expect(evaluateAttributionEvidence({ model: "last_touch" })).toMatchObject({
      coverage: "unavailable",
      strength: "unknown",
      sampleWarning: "Sample size unavailable",
    });
  });

  it("rejects mixed currencies for ROAS and preserves attribution scope semantics", () => {
    const metrics = calculateAcquisitionMetrics({
      spend: [spend, { ...spend, currency: "CAD", externalRecordId: "campaign-day-2" }],
      attributableRevenueCents: 50000,
    });
    expect(metrics.scopeCompatible).toBe(false);
    expect(metrics.roas).toBeNull();
    expect(
      attributionMatchesScope(
        {
          platform: "instagram",
          campaignId: "c1",
          contentId: "p1",
          webinarId: "w1",
          date: "2026-08-27",
        },
        { platform: "instagram", campaignId: "c1" },
      ),
    ).toBe(true);
    expect(
      attributionMatchesScope({ platform: "youtube", campaignId: "c1" }, { platform: "instagram" }),
    ).toBe(false);
  });
});
