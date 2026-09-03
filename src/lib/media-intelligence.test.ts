import { describe, expect, it } from "vitest";
import {
  contentCashPathStrength,
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
});
