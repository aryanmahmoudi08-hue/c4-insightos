import { describe, expect, it } from "vitest";
import { groupBySourcePlatform } from "./attribution-flow";

describe("groupBySourcePlatform", () => {
  it("multiple sources merging into one destination: real per-platform counts, sorted descending", () => {
    const rows = [
      { platform: "instagram" },
      { platform: "instagram" },
      { platform: "instagram" },
      { platform: "tiktok" },
      { platform: "tiktok" },
      { platform: "youtube" },
    ];
    const groups = groupBySourcePlatform(rows, (r) => r.platform);
    expect(groups).toEqual([
      { label: "Instagram", count: 3 },
      { label: "TikTok", count: 2 },
      { label: "YouTube", count: 1 },
    ]);
  });

  it("a single source feeding the destination collapses to one group, not a false split", () => {
    const rows = [{ platform: "instagram" }, { platform: "instagram" }];
    const groups = groupBySourcePlatform(rows, (r) => r.platform);
    expect(groups).toEqual([{ label: "Instagram", count: 2 }]);
  });

  it("empty attribution: no rows produces no groups, never a fabricated placeholder", () => {
    expect(groupBySourcePlatform([], () => null)).toEqual([]);
  });

  it("unknown/unattributed rows are grouped honestly, never dropped silently", () => {
    const rows = [{ platform: null }, { platform: "instagram" }, { platform: undefined }];
    const groups = groupBySourcePlatform(rows, (r) => r.platform);
    expect(groups).toContainEqual({ label: "Unknown / Unattributed", count: 2 });
    expect(groups).toContainEqual({ label: "Instagram", count: 1 });
  });

  it("prefers an explicit platform field over a raw/free-text source string", () => {
    const rows = [{ raw: "some campaign name", explicit: "tiktok" }];
    const groups = groupBySourcePlatform(
      rows,
      (r) => r.raw,
      (r) => r.explicit,
    );
    expect(groups).toEqual([{ label: "TikTok", count: 1 }]);
  });

  it("partial attribution: a mix of known and unknown sources both show up as real, distinct groups", () => {
    const rows = [{ platform: "youtube" }, { platform: "youtube" }, { platform: null }];
    const groups = groupBySourcePlatform(rows, (r) => r.platform);
    expect(groups).toEqual([
      { label: "YouTube", count: 2 },
      { label: "Unknown / Unattributed", count: 1 },
    ]);
  });
});
