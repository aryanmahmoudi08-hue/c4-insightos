import { percentiles, type Baseline, type Bucket, type PieceMetrics } from "./content-performance";

type Sb = { from: (t: string) => any };

type MetricRow = {
  views?: number | null;
  leads_generated?: number | null;
  cash_collected_cents?: number | null;
  hook_retention_pct?: number | null;
  engagement_rate_pct?: number | null;
  drop_off_rate_pct?: number | null;
};

export function toPieceMetrics(m: MetricRow | null | undefined): PieceMetrics {
  if (!m) return { converted: false };
  return {
    converted: Number(m.leads_generated ?? 0) > 0 || Number(m.cash_collected_cents ?? 0) > 0,
    views: m.views != null ? Number(m.views) : undefined,
    retentionPct: m.hook_retention_pct != null ? Number(m.hook_retention_pct) : undefined,
    engagementPct: m.engagement_rate_pct != null ? Number(m.engagement_rate_pct) : undefined,
    dropOffPct: m.drop_off_rate_pct != null ? Number(m.drop_off_rate_pct) : undefined,
  };
}

export function bucketKey(bucket: Bucket): string {
  return `${bucket.mechanism}::${bucket.platform}`;
}

/**
 * Pulls the trailing count-based window of content_pieces (+ each piece's
 * latest logged metrics snapshot) for ONE (mechanism, platform) bucket and
 * computes the account's own percentile baseline. Count-based, not calendar-
 * based, so low/uneven posting volume never thins the comparison set just
 * because a week was slow (see plan Part 1 windowing decision).
 *
 * The baseline is inclusive of whichever pieces are being scored against it
 * (no self-exclusion) — "how does this compare to your last N posted"
 * naturally includes the piece itself, same as a person eyeballing "is this
 * one of my best reels this month" would.
 */
export async function fetchBaseline(sb: Sb, orgId: string, bucket: Bucket, windowSize: number): Promise<Baseline> {
  const { data, error } = await sb
    .from("content_pieces")
    .select("id, posted_at, created_at, content_metrics(views, leads_generated, cash_collected_cents, hook_retention_pct, engagement_rate_pct, drop_off_rate_pct)")
    .eq("org_id", orgId)
    .eq("mechanism", bucket.mechanism)
    .eq("platform", bucket.platform)
    .order("posted_at", { ascending: false, nullsFirst: false })
    .limit(windowSize);
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as any[];
  const pieces: PieceMetrics[] = rows
    .map((r) => {
      const metrics = Array.isArray(r.content_metrics) ? r.content_metrics : r.content_metrics ? [r.content_metrics] : [];
      return metrics[0] ? toPieceMetrics(metrics[0]) : null;
    })
    .filter((p): p is PieceMetrics => p !== null);

  return {
    bucket,
    views: percentiles(pieces.map((p) => p.views ?? 0)),
    retention: percentiles(pieces.map((p) => p.retentionPct ?? 0)),
    engagement: percentiles(pieces.map((p) => p.engagementPct ?? 0)),
    dropOff: percentiles(pieces.map((p) => p.dropOffPct ?? 0)),
    sampleSize: pieces.length,
  };
}

/** Fetches baselines for every unique (mechanism, platform) pair across a
 * set of buckets in parallel — one query per unique bucket, not one per
 * piece. Callers with many reels in the same bucket share a single fetch. */
export async function fetchBaselines(sb: Sb, orgId: string, buckets: Bucket[], windowSize: number): Promise<Map<string, Baseline>> {
  const unique = Array.from(new Map(buckets.map((b) => [bucketKey(b), b])).values());
  const results = await Promise.all(unique.map((b) => fetchBaseline(sb, orgId, b, windowSize)));
  const map = new Map<string, Baseline>();
  unique.forEach((b, i) => map.set(bucketKey(b), results[i]));
  return map;
}
