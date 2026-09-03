import { describe, expect, it } from "vitest";
import { buildAttributionPathsForModel } from "./content-attribution";

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
