import { describe, expect, it } from "vitest";
import { aggregateMix, classifyPerformance, percentiles, type Baseline, type PieceMetrics } from "./content-performance";
import { emptyWeights, type MechanismWeights } from "./content-mechanisms";

const BUCKET = { mechanism: "credibility" as const, platform: "reel" };

function baselineFrom(
  values: { views?: number[]; retention?: number[]; engagement?: number[]; dropOff?: number[] },
  sampleSize: number,
): Baseline {
  return {
    bucket: BUCKET,
    views: percentiles(values.views ?? []),
    retention: percentiles(values.retention ?? []),
    engagement: percentiles(values.engagement ?? []),
    dropOff: percentiles(values.dropOff ?? []),
    sampleSize,
  };
}

describe("percentiles", () => {
  it("returns zeros for an empty array", () => {
    expect(percentiles([])).toEqual({ p25: 0, p50: 0, p75: 0, n: 0 });
  });

  it("collapses to the single value for n=1", () => {
    expect(percentiles([42])).toEqual({ p25: 42, p50: 42, p75: 42, n: 1 });
  });

  it("collapses to the same value for identical inputs regardless of n", () => {
    expect(percentiles([10, 10, 10, 10, 10])).toEqual({ p25: 10, p50: 10, p75: 10, n: 5 });
  });

  it("computes known percentiles on an evenly-spaced array (R-7 interpolation)", () => {
    // 9 values 10..90 step 10 — p25 index = 0.25*8=2 -> 30, p50 index=4 -> 50, p75 index=6 -> 70
    const p = percentiles([10, 20, 30, 40, 50, 60, 70, 80, 90]);
    expect(p).toEqual({ p25: 30, p50: 50, p75: 70, n: 9 });
  });
});

describe("classifyPerformance — sparse-data / cold-start", () => {
  it("returns insufficient_data when sampleSize is below minSample, with no reasons", () => {
    const baseline = baselineFrom({ retention: [40, 60] }, 2);
    const piece: PieceMetrics = { converted: false, retentionPct: 50 };
    const result = classifyPerformance(piece, baseline, 6);
    expect(result.verdict).toBe("insufficient_data");
    expect(result.reasons).toEqual([]);
    expect(result.sampleSize).toBe(2);
    expect(result.minSample).toBe(6);
  });

  it("does not crash on a single-data-point baseline even when minSample allows it", () => {
    const baseline = baselineFrom({ retention: [55], engagement: [4], views: [900], dropOff: [20] }, 1);
    const piece: PieceMetrics = { converted: false, retentionPct: 55, engagementPct: 4, views: 900, dropOffPct: 20 };
    const result = classifyPerformance(piece, baseline, 1);
    // n=1 means zero variance on every metric — nothing to rank against, so it
    // must resolve to "typical", never a false strong/underperforming.
    expect(result.verdict).toBe("typical");
  });
});

describe("classifyPerformance — degenerate / zero-variance baseline", () => {
  it("resolves to typical when every piece in the bucket has the same value on every metric (no divide-by-zero, no false verdict)", () => {
    const baseline = baselineFrom(
      { views: [500, 500, 500, 500, 500, 500], retention: [50, 50, 50, 50, 50, 50], engagement: [4, 4, 4, 4, 4, 4], dropOff: [25, 25, 25, 25, 25, 25] },
      6,
    );
    const piece: PieceMetrics = { converted: false, views: 500, retentionPct: 50, engagementPct: 4, dropOffPct: 25 };
    const result = classifyPerformance(piece, baseline, 6);
    expect(result.verdict).toBe("typical");
  });
});

describe("classifyPerformance — conversion always wins", () => {
  it("classifies a converted piece as strong even with terrible engagement metrics", () => {
    const baseline = baselineFrom(
      { retention: [60, 65, 70, 75, 80, 85], engagement: [5, 6, 7, 8, 9, 10], dropOff: [10, 15, 20, 25, 30, 35] },
      6,
    );
    const piece: PieceMetrics = { converted: true, retentionPct: 5, engagementPct: 1, dropOffPct: 90 };
    const result = classifyPerformance(piece, baseline, 6);
    expect(result.verdict).toBe("strong");
    expect(result.reasons[0].metric).toBe("conversion");
  });
});

describe("classifyPerformance — exactly-at-threshold boundary", () => {
  it("treats retention exactly equal to p75 as strong (inclusive boundary)", () => {
    // 8 evenly spaced values 10..80: p75 index = 0.75*7=5.25 -> interpolate
    // sorted[5]=60 and sorted[6]=70 at 0.25 -> 62.5
    const retentionPop = [10, 20, 30, 40, 50, 60, 70, 80];
    const baseline = baselineFrom({ retention: retentionPop, engagement: [1, 1, 1, 1, 1, 1, 1, 1], dropOff: [10, 10, 10, 10, 10, 10, 10, 10] }, 8);
    expect(baseline.retention.p75).toBe(62.5);
    const piece: PieceMetrics = { converted: false, retentionPct: 62.5, engagementPct: 1, dropOffPct: 10 };
    const result = classifyPerformance(piece, baseline, 6);
    expect(result.verdict).toBe("strong");
    expect(result.reasons.some((r) => r.metric === "retention" && r.comparisonType === "p75")).toBe(true);
  });
});

describe("classifyPerformance — dropOff is a permissive floor, not a quality bar", () => {
  it("does NOT classify a piece as strong when retention is excellent but drop-off is catastrophic (worst decile)", () => {
    // dropOff population 0..90 step 10 (10 values): p75 index=0.75*9=6.75 -> interpolated 67.5
    const dropOffPop = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90];
    const baseline = baselineFrom(
      { retention: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100], engagement: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1], dropOff: dropOffPop },
      10,
    );
    // Best-decile retention (100, well above p75) but worst-decile drop-off (90, above p75=67.5)
    const piece: PieceMetrics = { converted: false, retentionPct: 100, engagementPct: 1, dropOffPct: 90 };
    const result = classifyPerformance(piece, baseline, 6);
    expect(result.verdict).not.toBe("strong");
  });

  it("classifies as strong when retention is excellent and drop-off is merely 'not catastrophic' (at p75, not top-quartile)", () => {
    const dropOffPop = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90];
    const baseline = baselineFrom(
      { retention: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100], engagement: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1], dropOff: dropOffPop },
      10,
    );
    // drop-off sits AT p75 (67.5) — the permissive floor — not top-quartile-best.
    const piece: PieceMetrics = { converted: false, retentionPct: 100, engagementPct: 1, dropOffPct: 67.5 };
    const result = classifyPerformance(piece, baseline, 6);
    expect(result.verdict).toBe("strong");
  });
});

describe("classifyPerformance — old-vs-new disagreement (the account's own bar moved)", () => {
  // Old absolute rule (content-signals.server.ts, pre-fix): retention >= 45
  // OR engagement >= 6, AND dropOff < 40 => "strong". This account's Reels
  // actually run 70-95% retention, so 46% is nowhere near this bucket's own
  // top quartile.
  function oldAbsoluteRuleIsStrong(piece: PieceMetrics): boolean {
    const retention = piece.retentionPct ?? 0;
    const engagement = piece.engagementPct ?? 0;
    const dropOff = piece.dropOffPct;
    const heldAttention = retention >= 45 || engagement >= 6;
    const lowDropOff = dropOff == null || dropOff < 40;
    return heldAttention && lowDropOff;
  }

  it("old absolute rule calls a 46% piece 'strong'; new bucket-relative rule calls the same piece 'underperforming'", () => {
    const piece: PieceMetrics = { converted: false, retentionPct: 46, engagementPct: 2, dropOffPct: 20, views: 200 };
    expect(oldAbsoluteRuleIsStrong(piece)).toBe(true);

    // This account's real Reels for this bucket run 70-95% retention — 46% is
    // this bucket's own bottom quartile, not a strong performer here.
    const baseline = baselineFrom(
      { retention: [70, 75, 80, 85, 90, 95], engagement: [1, 2, 3, 4, 5, 6], views: [400, 500, 600, 700, 800, 900], dropOff: [10, 15, 20, 25, 30, 35] },
      6,
    );
    const result = classifyPerformance(piece, baseline, 6);
    expect(result.verdict).toBe("underperforming");
  });
});

describe("classifyPerformance — 6.2: the two previously-divergent systems now agree", () => {
  // The old computeDemand() reel-strength rule and the old content-signals.tsx
  // weekly-check "worst reason" rule used different math and could classify
  // the SAME piece inconsistently:
  //  - old computeDemand: retention>=45 => "strong" driver.
  //  - old weekly-check:  avgViews < overallAvgViews*0.5 => "Low reach"
  //    (comparing across ALL mechanisms/platforms combined, not bucket-relative).
  // This fixture is constructed so both old rules fire on the same piece with
  // opposite verdicts. The new shared classifyPerformance must give ONE answer
  // when "called" from both sites (simulated here by invoking it twice with
  // the same inputs, standing in for computeDemand's and the weekly-check's
  // call sites both routing through the same function).
  it("gives one consistent verdict regardless of which caller invokes it", () => {
    const piece: PieceMetrics = { converted: false, retentionPct: 46, engagementPct: 3, views: 150, dropOffPct: 15 };

    // Old computeDemand's rule (isolated, reimplemented here as ground truth
    // for "what it used to do"):
    const oldComputeDemandStrong = (piece.retentionPct ?? 0) >= 45 || (piece.engagementPct ?? 0) >= 6;
    expect(oldComputeDemandStrong).toBe(true); // old computeDemand: "strong" driver

    // Old weekly-check's rule, using an org-wide-average views figure that's
    // MUCH higher than this bucket's own typical views (the exact flaw the
    // user called out — comparing a Reel to Story/YouTube view counts):
    const orgWideAvgViews = 1000;
    const oldWeeklyCheckLowReach = piece.views! < orgWideAvgViews * 0.5;
    expect(oldWeeklyCheckLowReach).toBe(true); // old weekly-check: "Low reach"
    // -> the two old systems disagreed: "strong" vs. "underperforming (low reach)".

    const baseline = baselineFrom(
      { retention: [70, 75, 80, 85, 90, 95], engagement: [1, 2, 3, 4, 5, 6], views: [400, 500, 600, 700, 800, 900], dropOff: [10, 15, 20, 25, 30, 35] },
      6,
    );

    // Simulate both call sites routing through the same shared function.
    const fromComputeDemand = classifyPerformance(piece, baseline, 6);
    const fromWeeklyCheck = classifyPerformance(piece, baseline, 6);

    expect(fromComputeDemand.verdict).toBe(fromWeeklyCheck.verdict);
    expect(fromComputeDemand.reasons).toEqual(fromWeeklyCheck.reasons);
    // Bucket-relative: 46% retention is below this bucket's own p75 (90) so it
    // doesn't win on retention; 150 views is below this bucket's own p25 (525)
    // so it correctly lands on "underperforming" via the views signal, not the
    // org-wide-average comparison that produced the old disagreement.
    expect(fromComputeDemand.verdict).toBe("underperforming");
    expect(fromComputeDemand.reasons[0].metric).toBe("views");
  });
});

describe("aggregateMix", () => {
  const zero: MechanismWeights = emptyWeights();

  it("flags insufficientData and returns an even split when there is zero signal", () => {
    const result = aggregateMix(zero, 15);
    expect(result.insufficientData).toBe(true);
    expect(result.totalWeight).toBe(0);
    expect(result.mix.educational).toBe(25);
    expect(result.mix.credibility).toBe(25);
    expect(result.mix.authoritative).toBe(25);
    expect(result.mix.relatability).toBe(25);
  });

  it("flags insufficientData when total weight is below the configured minimum, but still produces a real distribution", () => {
    const weights: MechanismWeights = { educational: 2, credibility: 4, authoritative: 1, relatability: 1 };
    const result = aggregateMix(weights, 15);
    expect(result.totalWeight).toBe(8);
    expect(result.insufficientData).toBe(true);
    expect(result.mix.credibility).toBeGreaterThan(result.mix.authoritative);
  });

  it("does not flag insufficientData once total weight clears the minimum, and percentages sum to 100", () => {
    const weights: MechanismWeights = { educational: 10, credibility: 30, authoritative: 5, relatability: 5 };
    const result = aggregateMix(weights, 15);
    expect(result.totalWeight).toBe(50);
    expect(result.insufficientData).toBe(false);
    const sum = Object.values(result.mix).reduce((s, v) => s + v, 0);
    expect(sum).toBe(100);
  });

  it("never lets a mechanism with real positive weight round down to 0%", () => {
    const weights: MechanismWeights = { educational: 1, credibility: 97, authoritative: 1, relatability: 1 };
    const result = aggregateMix(weights, 15);
    expect(result.mix.educational).toBeGreaterThan(0);
    expect(result.mix.authoritative).toBeGreaterThan(0);
    expect(result.mix.relatability).toBeGreaterThan(0);
  });
});
