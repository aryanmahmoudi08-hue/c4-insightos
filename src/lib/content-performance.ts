import { MECHANISM_KEYS, type MechanismKey, type MechanismWeights } from "./content-mechanisms";

export type Bucket = { mechanism: MechanismKey; platform: string };

export type PercentileSet = { p25: number; p50: number; p75: number; n: number };

/** Percentile via linear interpolation on the sorted array (the R-7 method —
 * same convention numpy/Excel default to). Deterministic and stable at the
 * small n this app actually runs at. */
export function percentiles(values: number[]): PercentileSet {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return { p25: 0, p50: 0, p75: 0, n: 0 };
  const at = (p: number) => {
    if (n === 1) return sorted[0];
    const idx = p * (n - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  };
  return { p25: at(0.25), p50: at(0.5), p75: at(0.75), n };
}

/** A population with zero spread (including n<=1, where percentiles() always
 * collapses to a single repeated value) carries no comparative signal — every
 * piece would trivially satisfy both ">= p75" and "<= p25" at once. Metrics
 * with no variance are excluded from strong/underperforming checks rather
 * than arbitrarily favoring one verdict. */
export function hasVariance(p: PercentileSet): boolean {
  return p.p75 > p.p25;
}

export type PieceMetrics = {
  converted: boolean; // leads_generated > 0 || cash_collected_cents > 0
  views?: number;
  retentionPct?: number; // hook_retention_pct
  engagementPct?: number; // engagement_rate_pct
  dropOffPct?: number; // drop_off_rate_pct
};

export type Baseline = {
  bucket: Bucket;
  views: PercentileSet;
  retention: PercentileSet;
  engagement: PercentileSet;
  dropOff: PercentileSet;
  sampleSize: number; // pieces WITH metrics logged in this bucket's trailing window
};

export type Verdict = "strong" | "typical" | "underperforming" | "insufficient_data";

export type DerivationReason = {
  metric: "views" | "retention" | "engagement" | "dropOff" | "conversion";
  value: number;
  comparedTo: number; // the bucket's own p25/p50/p75 for that metric
  comparisonType: "p25" | "p50" | "p75";
  bucketLabel: string;
};

export type PerformanceVerdict = {
  verdict: Verdict;
  reasons: DerivationReason[]; // populated whenever verdict isn't insufficient_data
  bucket: Bucket;
  sampleSize: number;
  minSample: number;
};

function bucketLabel(bucket: Bucket, n: number): string {
  return `${bucket.mechanism} · ${bucket.platform}, last ${n} posted`;
}

/**
 * Classifies a single content piece against its OWN account's
 * (mechanism × platform) baseline — never an absolute threshold. A real
 * cash/lead outcome always wins over an engagement proxy (magnitude-blind:
 * 1 lead reads the same as 20 leads and $8,500 — acceptable at this
 * account's current volume, a documented limitation rather than a silent
 * one; revisit once converted volume is large enough to rank by size).
 */
export function classifyPerformance(piece: PieceMetrics, baseline: Baseline, minSample: number): PerformanceVerdict {
  const { bucket, sampleSize } = baseline;
  const label = bucketLabel(bucket, sampleSize);
  const base = { bucket, sampleSize, minSample };

  if (sampleSize < minSample) {
    return { ...base, verdict: "insufficient_data", reasons: [] };
  }

  if (piece.converted) {
    return {
      ...base,
      verdict: "strong",
      reasons: [{ metric: "conversion", value: 1, comparedTo: 0, comparisonType: "p75", bucketLabel: label }],
    };
  }

  const retention = piece.retentionPct ?? 0;
  const engagement = piece.engagementPct ?? 0;
  const dropOff = piece.dropOffPct;
  const views = piece.views ?? 0;

  const retentionStrong = hasVariance(baseline.retention) && retention >= baseline.retention.p75;
  const engagementStrong = hasVariance(baseline.engagement) && engagement >= baseline.engagement.p75;

  // dropOff <= p75 is a PERMISSIVE floor (excludes only the account's own
  // worst quartile), not a quality bar — "strong" doesn't require top-quartile
  // drop-off AND top-quartile retention/engagement simultaneously, which would
  // make "strong" nearly unreachable at low volume. A bucket with no drop-off
  // variance never blocks "strong" on this metric (nothing to distinguish
  // catastrophic from fine).
  const dropOffOk = dropOff == null || !hasVariance(baseline.dropOff) || dropOff <= baseline.dropOff.p75;

  if ((retentionStrong || engagementStrong) && dropOffOk) {
    const reasons: DerivationReason[] = [];
    if (retentionStrong) reasons.push({ metric: "retention", value: retention, comparedTo: baseline.retention.p75, comparisonType: "p75", bucketLabel: label });
    if (engagementStrong) reasons.push({ metric: "engagement", value: engagement, comparedTo: baseline.engagement.p75, comparisonType: "p75", bucketLabel: label });
    return { ...base, verdict: "strong", reasons };
  }

  const retentionLow = hasVariance(baseline.retention) && retention <= baseline.retention.p25;
  const engagementLow = hasVariance(baseline.engagement) && engagement <= baseline.engagement.p25;
  if (retentionLow && engagementLow) {
    return {
      ...base,
      verdict: "underperforming",
      reasons: [
        { metric: "retention", value: retention, comparedTo: baseline.retention.p25, comparisonType: "p25", bucketLabel: label },
        { metric: "engagement", value: engagement, comparedTo: baseline.engagement.p25, comparisonType: "p25", bucketLabel: label },
      ],
    };
  }

  const viewsLow = hasVariance(baseline.views) && views <= baseline.views.p25;
  if (viewsLow) {
    return {
      ...base,
      verdict: "underperforming",
      reasons: [{ metric: "views", value: views, comparedTo: baseline.views.p25, comparisonType: "p25", bucketLabel: label }],
    };
  }

  return {
    ...base,
    verdict: "typical",
    reasons: [{ metric: "retention", value: retention, comparedTo: baseline.retention.p50, comparisonType: "p50", bucketLabel: label }],
  };
}

export type MixResult = {
  mix: Record<MechanismKey, number>;
  totalWeight: number;
  minTotalWeight: number;
  insufficientData: boolean;
};

/**
 * Converts raw per-mechanism signal weights into a recommended posting mix.
 * Replaces content-mechanisms.ts's toMix(): below minTotalWeight this still
 * returns an even split (so the UI has something to render) but flags
 * insufficientData so the caller can badge it — never a silent,
 * indistinguishable "confident" 25/25/25/25.
 */
export function aggregateMix(weights: MechanismWeights, minTotalWeight: number, minPct = 10): MixResult {
  const totalWeight = MECHANISM_KEYS.reduce((s, k) => s + weights[k], 0);
  const insufficientData = totalWeight < minTotalWeight;

  if (totalWeight <= 0) {
    const even = Math.round(100 / MECHANISM_KEYS.length);
    const mix = {} as Record<MechanismKey, number>;
    for (const k of MECHANISM_KEYS) mix[k] = even;
    return { mix, totalWeight, minTotalWeight, insufficientData: true };
  }

  const floor = minPct * MECHANISM_KEYS.length;
  const scaled = MECHANISM_KEYS.map((k) => ({ k, v: Math.round(((weights[k] / totalWeight) * (100 - floor)) + minPct) }));
  const diff = 100 - scaled.reduce((s, x) => s + x.v, 0);
  scaled.sort((a, b) => b.v - a.v);
  if (scaled[0]) scaled[0].v += diff;
  const mix = {} as Record<MechanismKey, number>;
  for (const x of scaled) mix[x.k] = x.v;

  return { mix, totalWeight, minTotalWeight, insufficientData };
}
