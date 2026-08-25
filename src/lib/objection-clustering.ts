import type { ObjectionCluster } from "@/lib/objection-clustering.server";

export type { ObjectionCluster };

export type RawObjectionCount = { key: string; total: number; resolved?: number };

/** Client-safe remap from raw exact-string buckets to AI-clustered canonical
 * buckets — `clusterObjections` itself is server-only (calls the AI
 * Gateway), this is the pure grouping logic both `closer.tsx` and
 * `activity-module.tsx` share. `clusters` is `null`/`undefined` whenever AI
 * clustering isn't available (not configured, call failed, still loading) —
 * callers pass that through and get the raw per-string buckets back
 * unchanged, the same exact-match bucketing this app already had. */
export function applyObjectionClusters(
  currRaw: RawObjectionCount[],
  prevRaw: Map<string, number>,
  clusters: ObjectionCluster[] | null | undefined,
): { key: string; label: string; total: number; resolved: number; prevTotal: number }[] {
  if (!clusters || clusters.length === 0) {
    return currRaw.map((r) => ({
      key: r.key,
      label: r.key,
      total: r.total,
      resolved: r.resolved ?? 0,
      prevTotal: prevRaw.get(r.key) ?? 0,
    }));
  }

  const memberToCanonical = new Map<string, string>();
  for (const c of clusters) for (const m of c.members) memberToCanonical.set(m, c.canonical);

  const grouped = new Map<string, { total: number; resolved: number; prevTotal: number }>();
  for (const r of currRaw) {
    const canonical = memberToCanonical.get(r.key) ?? r.key;
    const g = grouped.get(canonical) ?? { total: 0, resolved: 0, prevTotal: 0 };
    g.total += r.total;
    g.resolved += r.resolved ?? 0;
    grouped.set(canonical, g);
  }
  // Best-effort prior-period mapping: only prior raw texts that are exact
  // members of a *current* cluster get folded in (we only ever cluster the
  // current period's distinct texts, never persist a mapping) — a prior
  // phrase that would now cluster differently just contributes to its own
  // raw-text bucket instead of silently vanishing.
  for (const [prevKey, prevCount] of prevRaw) {
    const canonical = memberToCanonical.get(prevKey);
    if (canonical && grouped.has(canonical)) {
      grouped.get(canonical)!.prevTotal += prevCount;
    } else if (!canonical) {
      const g = grouped.get(prevKey);
      if (g) g.prevTotal += prevCount;
    }
  }

  return Array.from(grouped.entries()).map(([canonical, g]) => ({
    key: canonical,
    label: canonical,
    ...g,
  }));
}
