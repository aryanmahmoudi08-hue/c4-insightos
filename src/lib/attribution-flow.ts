import { normalizeSocialPlatform } from "./social-platform";

export interface AttributionSourceGroup {
  label: string;
  count: number;
}

/**
 * Groups real per-record rows into real per-platform source nodes for a
 * branching/merging attribution visual (Priority 5). Never fabricates a
 * platform or a count — every group here is a genuine tally over rows that
 * were actually fetched; records with no identifiable platform land in
 * normalizeSocialPlatform's own "Unknown / Unattributed" bucket rather than
 * being silently dropped, so the merge is honest about what it doesn't know
 * too. Sorted by count descending so the dominant source renders first.
 */
export function groupBySourcePlatform<T>(
  rows: T[],
  getRaw: (row: T) => string | null | undefined,
  getExplicit?: (row: T) => string | null | undefined,
): AttributionSourceGroup[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const platform = normalizeSocialPlatform(getRaw(row), getExplicit?.(row));
    counts.set(platform, (counts.get(platform) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}
