import { describe, expect, it } from "vitest";
import { buildAttributionPathsForModel, aggregateCashByContent } from "./content-attribution";

const leads = [
  { id: "lead-1", created_at: "2026-08-01T00:00:00Z", source_content_id: "content-src" },
  { id: "lead-2", created_at: "2026-08-02T00:00:00Z", source_content_id: null },
];

const calls = [
  {
    id: "call-1",
    lead_id: "lead-1",
    created_at: "2026-08-10T00:00:00Z",
    closed: true,
    source_content_id: "content-booking",
  },
  {
    id: "call-2",
    lead_id: "lead-2",
    created_at: "2026-08-11T00:00:00Z",
    closed: false,
    source_content_id: null,
  },
];

const touches = [
  { lead_id: "lead-1", content_id: "content-first", touched_at: "2026-08-01T01:00:00Z" },
  { lead_id: "lead-1", content_id: "content-middle", touched_at: "2026-08-03T00:00:00Z" },
  { lead_id: "lead-1", content_id: "content-last", touched_at: "2026-08-09T00:00:00Z" },
];

describe("buildAttributionPathsForModel", () => {
  it("first_touch uses the earliest lead_content_touches row and is direct", () => {
    const paths = buildAttributionPathsForModel("first_touch", {
      leads,
      calls,
      touches,
      sampleSize: 10,
    });
    expect(paths).toHaveLength(1);
    expect(paths[0].contentId).toBe("content-first");
    expect(paths[0].evidence.coverage).toBe("direct");
  });

  it("last_touch uses the latest touch", () => {
    const paths = buildAttributionPathsForModel("last_touch", {
      leads,
      calls,
      touches,
      sampleSize: 10,
    });
    expect(paths[0].contentId).toBe("content-last");
  });

  it("lead_source uses leads.source_content_id and excludes leads without it", () => {
    const paths = buildAttributionPathsForModel("lead_source", {
      leads,
      calls,
      touches,
      sampleSize: 10,
    });
    expect(paths).toHaveLength(1);
    expect(paths[0].contentId).toBe("content-src");
  });

  it("booking_source uses calls.source_content_id", () => {
    const paths = buildAttributionPathsForModel("booking_source", {
      leads,
      calls,
      touches,
      sampleSize: 10,
    });
    expect(paths).toHaveLength(1);
    expect(paths[0].contentId).toBe("content-booking");
  });

  it("assisted_touch credits every touch except the last one, always inferred", () => {
    const paths = buildAttributionPathsForModel("assisted_touch", {
      leads,
      calls,
      touches,
      sampleSize: 10,
    });
    expect(paths.map((p) => p.contentId).sort()).toEqual(["content-first", "content-middle"]);
    for (const p of paths) {
      expect(p.evidence.coverage).toBe("inferred");
    }
  });

  it("excludes calls that aren't closed", () => {
    const paths = buildAttributionPathsForModel("first_touch", {
      leads,
      calls,
      touches: [{ lead_id: "lead-2", content_id: "x", touched_at: "2026-08-02T01:00:00Z" }],
      sampleSize: 10,
    });
    expect(paths.every((p) => p.outcomeKey !== "call-2")).toBe(true);
  });

  describe("aggregateCashByContent (Sankey cash source)", () => {
    it("sums real call cash per content, with no double count across content for a direct model", () => {
      const directPaths = buildAttributionPathsForModel("first_touch", {
        leads,
        calls,
        touches,
        sampleSize: 10,
      });
      const result = aggregateCashByContent(directPaths, { "call-1": 50000 });
      // Exactly one content node gets exactly one call's cash — not split,
      // not duplicated onto a second node.
      expect(result).toEqual([{ contentId: "content-first", cashCents: 50000, callCount: 1 }]);
    });

    it("never exceeds the real total cash of the calls it draws from, for a direct model", () => {
      const directPaths = buildAttributionPathsForModel("last_touch", {
        leads: [
          ...leads,
          { id: "lead-3", created_at: "2026-08-01T00:00:00Z", source_content_id: null },
        ],
        calls: [
          ...calls,
          {
            id: "call-3",
            lead_id: "lead-3",
            created_at: "2026-08-12T00:00:00Z",
            closed: true,
            source_content_id: null,
          },
        ],
        touches: [
          ...touches,
          { lead_id: "lead-3", content_id: "content-other", touched_at: "2026-08-02T00:00:00Z" },
        ],
        sampleSize: 10,
      });
      const callCash = { "call-1": 30000, "call-3": 20000 };
      const result = aggregateCashByContent(directPaths, callCash);
      const totalRealCash = Object.values(callCash).reduce((s, v) => s + v, 0);
      const totalAggregated = result.reduce((s, r) => s + r.cashCents, 0);
      expect(totalAggregated).toBe(totalRealCash);
      expect(totalAggregated).toBe(50000);
    });

    it("intentionally spreads one call's cash across multiple assisting content pieces", () => {
      const assistedPaths = buildAttributionPathsForModel("assisted_touch", {
        leads,
        calls,
        touches,
        sampleSize: 10,
      });
      const result = aggregateCashByContent(assistedPaths, { "call-1": 40000 });
      // Two assisting pieces (content-first, content-middle) both credited
      // the same call's cash — the sum legitimately exceeds the single
      // call's real amount, which is exactly why assisted_touch must never
      // be labeled as a direct/aggregate total by callers.
      expect(result).toHaveLength(2);
      expect(result.reduce((s, r) => s + r.cashCents, 0)).toBe(80000);
      expect(new Set(result.map((r) => r.contentId))).toEqual(
        new Set(["content-first", "content-middle"]),
      );
    });

    it("excludes paths with no cash on record rather than treating missing as zero-flow", () => {
      const directPaths = buildAttributionPathsForModel("first_touch", {
        leads,
        calls,
        touches,
        sampleSize: 10,
      });
      expect(aggregateCashByContent(directPaths, {})).toEqual([]);
      expect(aggregateCashByContent(directPaths, { "call-1": 0 })).toEqual([]);
      expect(aggregateCashByContent(directPaths, { "call-1": null })).toEqual([]);
    });
  });

  it("returns nothing for a lead with no touches under first_touch/last_touch", () => {
    const paths = buildAttributionPathsForModel("first_touch", {
      leads: [{ id: "lead-3", created_at: "2026-08-01T00:00:00Z", source_content_id: null }],
      calls: [
        {
          id: "call-3",
          lead_id: "lead-3",
          created_at: "2026-08-05T00:00:00Z",
          closed: true,
          source_content_id: null,
        },
      ],
      touches: [],
      sampleSize: 10,
    });
    expect(paths).toEqual([]);
  });
});
