import { describe, expect, it } from "vitest";
import {
  mergeBySourceTotal,
  mergeMax,
  formatRangeLabel,
  seriesRatioPoints,
  type SeriesPoint,
} from "./trend";

describe("formatRangeLabel", () => {
  it("passes preset labels through unchanged — they're already meaningful", () => {
    for (const label of ["Today", "Yesterday", "Last 7d", "Last 30d", "MTD", "All time"]) {
      expect(formatRangeLabel({ from: "2026-09-01", to: "2026-09-05", label })).toBe(label);
    }
  });

  it("expands a same-year Custom range into a concise 'Sep 1–Sep 12' label", () => {
    expect(formatRangeLabel({ from: "2026-09-01", to: "2026-09-12", label: "Custom" })).toBe(
      "Sep 1–Sep 12",
    );
  });

  it("includes the year on the start date when a Custom range spans two years", () => {
    expect(formatRangeLabel({ from: "2025-12-28", to: "2026-01-03", label: "Custom" })).toBe(
      "Dec 28, 2025–Jan 3, 2026",
    );
  });

  it("falls back to the raw label if the custom range's dates are unparseable", () => {
    expect(formatRangeLabel({ from: "not-a-date", to: "2026-09-05", label: "Custom" })).toBe(
      "Custom",
    );
  });
});

describe("mergeBySourceTotal", () => {
  it("reconciles with Math.max(totalA, totalB) even when the winning source flips day to day", () => {
    // Regression for the Closer Cash vs Revenue chart/total discrepancy:
    // day 1 favors source A, day 2 favors source B. mergeMax (per-day) would
    // sum to 200 here, but the headline KPI is Math.max(totalA, totalB) =
    // Math.max(100, 100) = 100 — the two numbers on the page disagreed.
    const a: SeriesPoint[] = [
      { d: "2026-01-01", cash: 100 },
      { d: "2026-01-02", cash: 0 },
    ];
    const b: SeriesPoint[] = [
      { d: "2026-01-01", cash: 0 },
      { d: "2026-01-02", cash: 100 },
    ];
    const merged = mergeBySourceTotal(a, b, ["cash"]);
    const chartSum = merged.reduce((s, p) => s + Number(p.cash), 0);
    const totalA = a.reduce((s, p) => s + Number(p.cash), 0);
    const totalB = b.reduce((s, p) => s + Number(p.cash), 0);
    expect(chartSum).toBe(Math.max(totalA, totalB));

    // mergeMax, by contrast, genuinely does diverge here — confirms this is
    // testing a real behavioral difference, not a redundant assertion.
    const perDayMerged = mergeMax(a, b, ["cash"]);
    const perDaySum = perDayMerged.reduce((s, p) => s + Number(p.cash), 0);
    expect(perDaySum).not.toBe(Math.max(totalA, totalB));
  });

  it("picks the larger source wholesale per key, independently per key", () => {
    const a: SeriesPoint[] = [
      { d: "2026-01-01", cash: 10, revenue: 500 },
      { d: "2026-01-02", cash: 10, revenue: 500 },
    ];
    const b: SeriesPoint[] = [
      { d: "2026-01-01", cash: 100, revenue: 1 },
      { d: "2026-01-02", cash: 100, revenue: 1 },
    ];
    const merged = mergeBySourceTotal(a, b, ["cash", "revenue"]);
    // cash: b's total (200) > a's total (20) -> use b's values throughout.
    expect(merged.map((p) => p.cash)).toEqual([100, 100]);
    // revenue: a's total (1000) > b's total (2) -> use a's values throughout.
    expect(merged.map((p) => p.revenue)).toEqual([500, 500]);
  });

  it("never fabricates a value for a day missing from the losing source", () => {
    const a: SeriesPoint[] = [{ d: "2026-01-01", cash: 50 }];
    const b: SeriesPoint[] = [{ d: "2026-01-01", cash: 0 }];
    const merged = mergeBySourceTotal(a, b, ["cash"]);
    expect(merged).toEqual([{ d: "2026-01-01", cash: 50 }]);
  });
});

describe("seriesRatioPoints", () => {
  const days: SeriesPoint[] = [
    { d: "2026-01-01", revenue: 9000, closed: 3 },
    { d: "2026-01-02", revenue: 0, closed: 0 },
    { d: "2026-01-03", revenue: 5000, closed: 2 },
  ];

  it("divides in the numerator's own unit, not as a percent", () => {
    expect(seriesRatioPoints(days, "revenue", "closed")).toEqual([
      { d: "2026-01-01", value: 3000 },
      { d: "2026-01-03", value: 2500 },
    ]);
  });

  it("drops a zero-denominator day rather than plotting it as zero", () => {
    // A day with no closes has no average deal size. Plotting 0 would state
    // that the average deal that day was nothing, which is a claim about
    // deals that never happened.
    const out = seriesRatioPoints(days, "revenue", "closed");
    expect(out.map((p) => p.d)).not.toContain("2026-01-02");
  });

  it("keeps dates aligned with values so a chart can label its points", () => {
    const out = seriesRatioPoints(days, "revenue", "closed");
    expect(out.map((p) => p.d)).toEqual(["2026-01-01", "2026-01-03"]);
  });

  it("treats a missing key as a zero denominator", () => {
    expect(seriesRatioPoints([{ d: "2026-01-01", revenue: 100 }], "revenue", "closed")).toEqual([]);
  });
});
