import { describe, expect, it } from "vitest";
import {
  buildRecommendationEvidence,
  buildVslFunnel,
  buildVslMetricSnapshot,
  contentCashPathStrength,
  deriveLargestLeak,
  deriveVideoActionQueue,
  normalizeObjectionEvidence,
  VSL_CATEGORIES,
} from "./media-intelligence";

describe("media intelligence", () => {
  it("preserves the required VSL category taxonomy", () => {
    expect(VSL_CATEGORIES).toEqual([
      "Main VSL",
      "Webinar VSL",
      "Post-booking Confirmation",
      "Testimonial Videos",
      "FAQ / Objection Videos",
    ]);
  });

  it("returns an actionable provider boundary when Wistia is unavailable", () => {
    expect(
      deriveVideoActionQueue({
        mediaId: "vsl-1",
        category: "Main VSL",
        playRate: null,
        completionRate: null,
        ctaRate: null,
        viewerToLead: null,
        viewerToBooking: null,
        viewerToClose: null,
        viewerToRevenueCents: null,
        providerAvailable: false,
      }),
    ).toEqual([
      {
        action: "connect_provider",
        reason: "Wistia is not connected; video telemetry is unavailable.",
      },
    ]);
  });

  it("finds review actions from available telemetry without inventing conversions", () => {
    const actions = deriveVideoActionQueue({
      mediaId: "vsl-1",
      category: "FAQ / Objection Videos",
      playRate: 60,
      completionRate: 20,
      ctaRate: 3,
      viewerToLead: null,
      viewerToBooking: null,
      viewerToClose: null,
      viewerToRevenueCents: null,
      providerAvailable: true,
    });
    expect(actions.map((x) => x.action)).toEqual([
      "review_retention",
      "review_cta",
      "review_conversion",
    ]);
  });

  it("normalizes objection evidence and clamps confidence", () => {
    expect(
      normalizeObjectionEvidence({ objection: "  price  ", confidence: 2, speaker: "closer" }),
    ).toEqual({
      objection: "price",
      category: null,
      speaker: "closer",
      timestampSeconds: null,
      callId: null,
      transcriptId: null,
      decisionFactor: null,
      outcome: null,
      confidence: 1,
      evidenceRef: null,
    });
  });

  it("requires verified IDs for direct Content-to-Cash strength", () => {
    expect(
      contentCashPathStrength({
        platformId: "p",
        campaignId: "c",
        contentId: "content",
        leadId: "lead",
        setterId: "setter",
        bookingId: "booking",
        callId: "call",
        closerId: "closer",
        paymentId: "payment",
        cashCents: 1000,
      }),
    ).toBe("direct");
    expect(
      contentCashPathStrength({
        platformId: "p",
        campaignId: null,
        contentId: "content",
        leadId: "lead",
        setterId: null,
        bookingId: null,
        callId: null,
        closerId: null,
        paymentId: null,
        cashCents: null,
      }),
    ).toBe("partial");
    expect(
      contentCashPathStrength({
        platformId: null,
        campaignId: null,
        contentId: null,
        leadId: null,
        setterId: null,
        bookingId: null,
        callId: null,
        closerId: null,
        paymentId: null,
        cashCents: 1000,
      }),
    ).toBe("unavailable");
  });

  describe("buildVslMetricSnapshot", () => {
    it("derives completionRate as a percentage of viewers, not the raw milestone count (B1)", () => {
      const snapshot = buildVslMetricSnapshot({
        mediaId: "vsl-1",
        category: "Main VSL",
        wistiaConnected: true,
        totalPlays: 1200,
        uniqueViewers: 1000,
        playRate: 60,
        pct100Reached: 200, // a raw headcount, not a percentage
        ctaClicks: null,
        ctaClickRate: null,
        taggedLeads: null,
        taggedBookings: null,
        taggedCloses: null,
        taggedCashCents: null,
      });
      // 200 / 1000 viewers = 20%, not the raw 200.
      expect(snapshot.completionRate).toBe(20);
      // And that 20% correctly trips the < 25 review_retention threshold —
      // the raw count (200) never would have.
      const actions = deriveVideoActionQueue(snapshot);
      expect(actions.map((a) => a.action)).toContain("review_retention");
    });

    it("falls back to totalPlays as the denominator when uniqueViewers is unavailable", () => {
      const snapshot = buildVslMetricSnapshot({
        mediaId: "vsl-1",
        category: "Main VSL",
        wistiaConnected: true,
        totalPlays: 500,
        uniqueViewers: null,
        playRate: null,
        pct100Reached: 250,
        ctaClicks: null,
        ctaClickRate: null,
        taggedLeads: null,
        taggedBookings: null,
        taggedCloses: null,
        taggedCashCents: null,
      });
      expect(snapshot.completionRate).toBe(50); // 250 / 500 plays
    });

    it("leaves completionRate null with no valid denominator, rather than dividing by zero", () => {
      const snapshot = buildVslMetricSnapshot({
        mediaId: "vsl-1",
        category: "Main VSL",
        wistiaConnected: true,
        totalPlays: null,
        uniqueViewers: null,
        playRate: null,
        pct100Reached: 250,
        ctaClicks: null,
        ctaClickRate: null,
        taggedLeads: null,
        taggedBookings: null,
        taggedCloses: null,
        taggedCashCents: null,
      });
      expect(snapshot.completionRate).toBeNull();
    });

    it("only computes viewer-to-lifecycle rates when leads/calls are tagged to this VSL", () => {
      const snapshot = buildVslMetricSnapshot({
        mediaId: "vsl-1",
        category: "Main VSL",
        wistiaConnected: true,
        totalPlays: 500,
        uniqueViewers: 400,
        playRate: 62.5,
        pct100Reached: 30,
        ctaClicks: 40,
        ctaClickRate: null,
        taggedLeads: 20,
        taggedBookings: 10,
        taggedCloses: 4,
        taggedCashCents: 200000,
      });
      expect(snapshot.ctaRate).toBe(10); // 40 / 400 * 100
      expect(snapshot.viewerToLead).toBe(5); // 20 / 400 * 100
      expect(snapshot.viewerToBooking).toBe(2.5);
      expect(snapshot.viewerToClose).toBe(1);
      expect(snapshot.viewerToRevenueCents).toBe(200000);
    });

    it("leaves viewer-to-lifecycle rates null with zero tagged records, not zero", () => {
      const snapshot = buildVslMetricSnapshot({
        mediaId: "vsl-1",
        category: "Main VSL",
        wistiaConnected: true,
        totalPlays: 500,
        uniqueViewers: 400,
        playRate: 62.5,
        pct100Reached: null,
        ctaClicks: null,
        ctaClickRate: null,
        taggedLeads: null,
        taggedBookings: null,
        taggedCloses: null,
        taggedCashCents: null,
      });
      expect(snapshot.viewerToLead).toBeNull();
      expect(snapshot.viewerToBooking).toBeNull();
      expect(snapshot.completionRate).toBeNull();
    });
  });

  describe("buildVslFunnel / deriveLargestLeak", () => {
    const connectedFunnel = () =>
      buildVslFunnel({
        pageLoads: 1000,
        totalPlays: 700,
        pct25Reached: 500,
        pct50Reached: 400,
        pct75Reached: 300,
        pct90Reached: 250,
        pct100Reached: 200,
        ctaClicks: 150,
        applicationCount: 20,
        showCount: 10,
        closeCount: 2,
        cashCents: 100000,
        wistiaConfigured: true,
        metricIngestionSource: "csv",
      });

    it("marks each stage's real data source, and unavailable when a value is null", () => {
      const funnel = buildVslFunnel({
        pageLoads: 1000,
        totalPlays: 700,
        pct25Reached: null,
        pct50Reached: null,
        pct75Reached: null,
        pct90Reached: null,
        pct100Reached: null,
        ctaClicks: null,
        applicationCount: null,
        showCount: null,
        closeCount: null,
        cashCents: null,
        wistiaConfigured: true,
        metricIngestionSource: "csv",
      });
      expect(funnel.find((s) => s.key === "landing")?.source).toBe("page_event");
      expect(funnel.find((s) => s.key === "play")?.source).toBe("wistia_native");
      expect(funnel.find((s) => s.key === "milestone_25")?.source).toBe("unavailable");
      expect(funnel.find((s) => s.key === "application")?.source).toBe("unavailable");
    });

    it("confirms a real zero (a resolved join with no matches) is a connected value, not unavailable", () => {
      const funnel = buildVslFunnel({
        pageLoads: 1000,
        totalPlays: 700,
        pct25Reached: 500,
        pct50Reached: 400,
        pct75Reached: 300,
        pct90Reached: 250,
        pct100Reached: 200,
        ctaClicks: 150,
        applicationCount: 0,
        showCount: 0,
        closeCount: 0,
        cashCents: 0,
        wistiaConfigured: true,
        metricIngestionSource: "csv",
      });
      const application = funnel.find((s) => s.key === "application");
      expect(application?.source).toBe("crm");
      expect(application?.value).toBe(0);
    });

    it("labels a wistia_native stage's ingestion source, never implying a live API sync", () => {
      const csvFunnel = buildVslFunnel({
        pageLoads: 1000,
        totalPlays: 700,
        pct25Reached: null,
        pct50Reached: null,
        pct75Reached: null,
        pct90Reached: null,
        pct100Reached: null,
        ctaClicks: null,
        applicationCount: null,
        showCount: null,
        closeCount: null,
        cashCents: null,
        wistiaConfigured: true,
        metricIngestionSource: "csv",
      });
      const play = csvFunnel.find((s) => s.key === "play");
      expect(play?.ingestionSource).toBe("csv");
      expect(play?.detail).toContain("CSV import");
      expect(play?.detail.toLowerCase()).not.toContain("live");

      const manualFunnel = buildVslFunnel({
        pageLoads: null,
        totalPlays: 700,
        pct25Reached: null,
        pct50Reached: null,
        pct75Reached: null,
        pct90Reached: null,
        pct100Reached: null,
        ctaClicks: null,
        applicationCount: null,
        showCount: null,
        closeCount: null,
        cashCents: null,
        wistiaConfigured: true,
        metricIngestionSource: "manual",
      });
      // The "landing" stage is page_event, not wistia_native — it must not
      // carry an ingestionSource label even though a metricIngestionSource
      // is set for the snapshot.
      expect(manualFunnel.find((s) => s.key === "landing")?.ingestionSource).toBeNull();
      expect(manualFunnel.find((s) => s.key === "play")?.ingestionSource).toBe("manual");
    });

    it("distinguishes a not-configured VSL from one configured with no snapshot yet", () => {
      const notConfigured = buildVslFunnel({
        pageLoads: null,
        totalPlays: null,
        pct25Reached: null,
        pct50Reached: null,
        pct75Reached: null,
        pct90Reached: null,
        pct100Reached: null,
        ctaClicks: null,
        applicationCount: 0,
        showCount: 0,
        closeCount: 0,
        cashCents: 0,
        wistiaConfigured: false,
        metricIngestionSource: null,
      });
      expect(notConfigured.find((s) => s.key === "play")?.detail).toContain("not connected");

      const configuredNoSnapshot = buildVslFunnel({
        pageLoads: null,
        totalPlays: null,
        pct25Reached: null,
        pct50Reached: null,
        pct75Reached: null,
        pct90Reached: null,
        pct100Reached: null,
        ctaClicks: null,
        applicationCount: 0,
        showCount: 0,
        closeCount: 0,
        cashCents: 0,
        wistiaConfigured: true,
        metricIngestionSource: null,
      });
      expect(configuredNoSnapshot.find((s) => s.key === "play")?.detail).toContain(
        "No metric snapshot",
      );
    });

    it("finds the largest proportional drop between consecutive connected stages", () => {
      const leak = deriveLargestLeak(connectedFunnel());
      // cta(150) -> application(20) is an 86.7% drop, the largest among all
      // consecutive connected pairs in this fixture.
      expect(leak?.fromKey).toBe("cta");
      expect(leak?.toKey).toBe("application");
      expect(leak?.dropRatePct).toBeCloseTo((130 / 150) * 100, 5);
      expect(leak?.recommendedTest).toContain("booking form");
    });

    it("never proposes close -> cash as the largest leak, even when cents < close count", () => {
      // Regression for B6: close(count) and cash(cents) are different units.
      // A tiny cash amount relative to the close count would otherwise look
      // like a huge, spurious "drop."
      const funnel = buildVslFunnel({
        pageLoads: 1000,
        totalPlays: 700,
        pct25Reached: 690,
        pct50Reached: 680,
        pct75Reached: 670,
        pct90Reached: 660,
        pct100Reached: 650,
        ctaClicks: 640,
        applicationCount: 600,
        showCount: 500,
        closeCount: 400,
        cashCents: 3, // absurdly small vs. closeCount — would fake a ~99% "drop"
        wistiaConfigured: true,
        metricIngestionSource: "csv",
      });
      const leak = deriveLargestLeak(funnel);
      expect(leak?.toKey).not.toBe("cash");
    });

    it("returns null when fewer than two consecutive stages have real data", () => {
      const funnel = buildVslFunnel({
        pageLoads: 1000,
        totalPlays: null,
        pct25Reached: null,
        pct50Reached: null,
        pct75Reached: null,
        pct90Reached: null,
        pct100Reached: null,
        ctaClicks: null,
        applicationCount: null,
        showCount: null,
        closeCount: null,
        cashCents: null,
        wistiaConfigured: false,
        metricIngestionSource: null,
      });
      expect(deriveLargestLeak(funnel)).toBeNull();
    });
  });

  describe("buildRecommendationEvidence (B8)", () => {
    it("carries the reason into evidence_json and never invents a confidence score", () => {
      const result = buildRecommendationEvidence({ reason: "Completion rate is below 25%." });
      expect(result.evidence_json.reason).toBe("Completion rate is below 25%.");
      expect(result.confidence).toBeNull();
    });
  });
});
