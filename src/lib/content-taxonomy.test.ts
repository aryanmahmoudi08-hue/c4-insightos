import { describe, expect, it } from "vitest";
import {
  aggregateContentByTaxonomy,
  normalizeFaqSignal,
  normalizeOnboardingSignal,
  normalizeSettingCallSignal,
  normalizeTaxonomy,
} from "./content-taxonomy";

describe("content taxonomy", () => {
  it("normalizes known dimensions and preserves unknown values", () => {
    expect(
      normalizeTaxonomy({
        funnelStage: "TOF",
        mechanism: "Problem-Solution",
        variation: null,
        platform: "instagram",
        format: null,
      }),
    ).toEqual({
      funnelStage: "tof",
      mechanism: "unknown",
      variation: "unknown",
      platform: "instagram",
      format: "unknown",
    });
    expect(
      normalizeTaxonomy({
        funnelStage: "bottom_of_funnel",
        mechanism: "Educational",
        variation: "value",
        platform: "youtube",
        format: "short",
      }),
    ).toMatchObject({ funnelStage: "bof", mechanism: "educational" });
  });

  it("aggregates legitimate metrics by a selected cross-dimension", () => {
    const rows = aggregateContentByTaxonomy(
      [
        {
          funnelStage: "tof",
          mechanism: "educational",
          variation: "value",
          platform: "instagram",
          format: "reel",
          metrics: {
            views: 100,
            reach: 80,
            likes: 5,
            leads_generated: 2,
            closes: 1,
            cash_collected_cents: 5000,
            hook_retention_pct: 40,
          },
        },
        {
          funnelStage: "tof",
          mechanism: "educational",
          variation: "value",
          platform: "instagram",
          format: "reel",
          metrics: {
            views: 50,
            reach: 40,
            likes: 3,
            leads_generated: 1,
            closes: 0,
            cash_collected_cents: 0,
            hook_retention_pct: 60,
          },
        },
      ],
      ["funnelStage", "mechanism", "platform", "format"],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      pieces: 2,
      views: 150,
      reach: 120,
      interactions: 8,
      leads: 3,
      closes: 1,
      cashCents: 5000,
      retentionSum: 50,
      retentionSamples: 2,
    });
  });
});

describe("content signal normalization", () => {
  it("labels FAQ signals and does not invent frequency when metrics are absent", () => {
    expect(normalizeFaqSignal({ question: "How does this work?" })).toMatchObject({
      source: "FAQ",
      topic: "How does this work?",
      frequency: null,
      answerState: "unknown",
    });
  });

  it("labels onboarding and setting-call signals with raw source text", () => {
    expect(
      normalizeOnboardingSignal({
        responses: { goal: "Improve show rate" },
        mechanism_signals: null,
      }),
    ).toMatchObject({ source: "Client Onboarding", rawText: "Improve show rate" });
    expect(
      normalizeSettingCallSignal({
        setter_name: "Rep A",
        call_date: "2026-08-27",
        objections: ["Need proof"],
      }),
    ).toMatchObject({ source: "Setting Calls", detail: "Rep A · 2026-08-27" });
  });

  it("returns null for records with no usable signal text", () => {
    expect(normalizeFaqSignal({})).toBeNull();
    expect(normalizeOnboardingSignal({ responses: {} })).toBeNull();
    expect(normalizeSettingCallSignal({ setter_name: "Rep A" })).toBeNull();
  });
});
