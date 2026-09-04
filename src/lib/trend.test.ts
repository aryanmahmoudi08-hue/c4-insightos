import { describe, expect, it } from "vitest";
import { mergeBySourceTotal, mergeMax, type SeriesPoint } from "./trend";

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
