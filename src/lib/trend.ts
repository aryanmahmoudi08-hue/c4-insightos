/**
 * Shared day-bucketed trend helpers for KPI tiles — real per-day series and
 * period-over-period deltas, computed from rows already fetched for the page's
 * date range. Never fabricate a spark shape or a delta: when there's no prior
 * baseline to compare against, omit the delta rather than inventing one.
 */

export interface SeriesPoint {
  d: string;
  [key: string]: number | string;
}

/** One point per calendar day across [from, to], each metric summed via its reducer. */
export function dailySeries<T>(
  rows: T[],
  from: string,
  to: string,
  getDate: (row: T) => string | null | undefined,
  metrics: Record<string, (row: T) => number>,
): SeriesPoint[] {
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  const totalDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
  const keys = Object.keys(metrics);
  const days: SeriesPoint[] = [];
  for (let i = 0; i < totalDays; i++) {
    const dt = new Date(start.getTime() + i * 86400000);
    const point: SeriesPoint = { d: dt.toISOString().slice(0, 10) };
    for (const key of keys) point[key] = 0;
    days.push(point);
  }
  const indexByDay = new Map(days.map((p, i) => [p.d, i]));
  for (const row of rows) {
    const iso = getDate(row);
    if (!iso) continue;
    const idx = indexByDay.get(iso.slice(0, 10));
    if (idx === undefined) continue;
    for (const key of keys) (days[idx][key] as number) += metrics[key](row);
  }
  // Sparklines render small — cap at the most recent 30 days for legibility.
  return days.length > 30 ? days.slice(-30) : days;
}

export function seriesValues(points: SeriesPoint[], key: string): number[] {
  return points.map((p) => Number(p[key] ?? 0));
}

/** Per-day ratio (as a 0-100 percent), skipping days with a zero denominator rather than plotting a fake 0. */
export function seriesRate(points: SeriesPoint[], numKey: string, denKey: string): number[] {
  return points
    .filter((p) => Number(p[denKey] ?? 0) > 0)
    .map((p) => (Number(p[numKey]) / Number(p[denKey])) * 100);
}

/** Same as seriesRate but keeps the date on each point — for axis-labeled rate charts (RateSmallMultiples). */
export function seriesRatePoints(
  points: SeriesPoint[],
  numKey: string,
  denKey: string,
): { d: string; pct: number }[] {
  return points
    .filter((p) => Number(p[denKey] ?? 0) > 0)
    .map((p) => ({ d: p.d, pct: (Number(p[numKey]) / Number(p[denKey])) * 100 }));
}

/** Elementwise max across two same-length, same-day-aligned series — for metrics tracked in more than one source table. */
export function mergeMax(a: SeriesPoint[], b: SeriesPoint[], keys: string[]): SeriesPoint[] {
  return a.map((pt, i) => {
    const out: SeriesPoint = { ...pt };
    const bp = b[i];
    for (const key of keys) out[key] = Math.max(Number(pt[key] ?? 0), Number(bp?.[key] ?? 0));
    return out;
  });
}

/**
 * Like mergeMax, but picks ONE winning source per metric key for the whole
 * series — whichever source's range total is larger — instead of picking
 * day-by-day. Day-by-day picking (mergeMax) can silently disagree with a
 * headline total computed as Math.max(totalA, totalB) over the same two
 * sources: whenever the larger source flips between days within the range,
 * summing the per-day max no longer equals the max of the two range totals.
 * Use this when a chart needs to visually reconcile with a Math.max(...)
 * headline number built from the same two source series.
 */
export function mergeBySourceTotal(
  a: SeriesPoint[],
  b: SeriesPoint[],
  keys: string[],
): SeriesPoint[] {
  const preferA: Record<string, boolean> = {};
  for (const key of keys) {
    const totalA = a.reduce((s, p) => s + Number(p[key] ?? 0), 0);
    const totalB = b.reduce((s, p) => s + Number(p[key] ?? 0), 0);
    preferA[key] = totalA >= totalB;
  }
  return a.map((pt, i) => {
    const out: SeriesPoint = { ...pt };
    const bp = b[i];
    for (const key of keys) out[key] = Number((preferA[key] ? pt : bp)?.[key] ?? 0);
    return out;
  });
}

/** [from, to] shifted back by its own length — the prior equivalent period for a delta comparison. */
export function priorPeriod(from: string, to: string): { from: string; to: string } {
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
  const prevTo = new Date(start.getTime() - 86400000);
  const prevFrom = new Date(start.getTime() - days * 86400000);
  return { from: prevFrom.toISOString().slice(0, 10), to: prevTo.toISOString().slice(0, 10) };
}

/** Signed percent change vs. `prev`. Undefined (not 0, not Infinity) when there's no prior baseline — a delta from zero is not a real magnitude. */
export function pctDelta(curr: number, prev: number): number | undefined {
  if (prev === 0) return undefined;
  return ((curr - prev) / prev) * 100;
}

/**
 * A concise, dynamic period label for date-range-sensitive metrics (e.g.
 * "Deals Expected to Close"). Preset labels (Today/Yesterday/Last 7d/MTD/
 * All time) are already meaningful as-is; only "Custom" — the one label
 * that told the user nothing about which days were actually selected —
 * gets expanded into an explicit "Sep 1–Sep 12" style range.
 */
export function formatRangeLabel(range: { from: string; to: string; label: string }): string {
  if (range.label !== "Custom") return range.label;
  const from = new Date(`${range.from}T00:00:00`);
  const to = new Date(`${range.to}T00:00:00`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return range.label;
  const sameYear = from.getFullYear() === to.getFullYear();
  const fmt = (d: Date, withYear: boolean) =>
    d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: withYear ? "numeric" : undefined,
    });
  return `${fmt(from, !sameYear)}–${fmt(to, !sameYear)}`;
}
