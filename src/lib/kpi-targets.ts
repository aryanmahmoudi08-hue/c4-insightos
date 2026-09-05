// Rep KPI Target Engine — pure calculation core (Priority 2). No Supabase
// imports here on purpose: every period/pace/status computation is a plain
// function of its inputs so it can be unit-tested exhaustively without a
// database, and so dashboards/admin UI/team tables all derive from the same
// single source of truth for "what does behind/ahead/at-risk mean."

export type KpiRole = "dm_setter" | "inbound_dialer" | "closer";
export type TargetPeriod = "daily" | "weekly" | "monthly";
export type KpiFormat = "count" | "money_cents" | "percent";

export interface KpiDefinition {
  key: string;
  label: string;
  format: KpiFormat;
}

// Only metrics with a real, existing, defensible data source are listed here
// — this catalogue is the single gate for what can ever be targeted. Kept in
// exact sync with the metric_key CHECK constraint in the
// 20260907090000_rep_kpi_targets.sql migration.
export const KPI_DEFINITIONS: Record<KpiRole, KpiDefinition[]> = {
  dm_setter: [
    { key: "outbound_dms_sent", label: "Outbound DMs", format: "count" },
    { key: "inbound_dms_sent", label: "Inbound DMs", format: "count" },
    { key: "replies", label: "Replies", format: "count" },
    { key: "qualified_convos_setter", label: "Qualified Conversations", format: "count" },
    { key: "calls_on_calendar_setter", label: "Calls Booked", format: "count" },
    { key: "live_calls_setter", label: "Showed Calls", format: "count" },
  ],
  inbound_dialer: [
    { key: "dials", label: "Dial Attempts", format: "count" },
    { key: "connections", label: "Connections", format: "count" },
    { key: "leads_contacted", label: "Leads Contacted", format: "count" },
    { key: "qualified_convos_dialer", label: "Qualified Conversations", format: "count" },
    { key: "calls_on_calendar_dialer", label: "Calls Booked", format: "count" },
    { key: "live_calls_dialer", label: "Showed Calls", format: "count" },
    { key: "speed_to_lead_sla_pct", label: "Speed-to-Lead SLA Compliance", format: "percent" },
  ],
  closer: [
    { key: "shows", label: "Shows", format: "count" },
    { key: "offers_made", label: "Offers Made", format: "count" },
    { key: "closes", label: "Closes", format: "count" },
    { key: "close_rate_pct", label: "Close Rate", format: "percent" },
    { key: "cash_collected_cents", label: "Cash Collected", format: "money_cents" },
    { key: "contract_value_cents", label: "Contracted Revenue", format: "money_cents" },
    { key: "follow_ups_logged", label: "Follow-ups Logged", format: "count" },
  ],
};

export function kpiDefinition(role: KpiRole, metricKey: string): KpiDefinition | undefined {
  return KPI_DEFINITIONS[role].find((d) => d.key === metricKey);
}

export interface TargetRecord {
  id: string;
  role: KpiRole;
  teamMemberName: string;
  metricKey: string;
  period: TargetPeriod;
  targetValue: number;
  isActive: boolean;
  /** YYYY-MM-DD — the date this version takes effect. */
  effectiveFrom: string;
  createdAt: string;
}

/**
 * The historically-correct target as of a given date: the version with the
 * latest effective_from that is not after `asOfISODate`. Returns null when
 * no version applies yet, or when the applicable version was archived
 * (is_active=false) — archiving is just a later version with no live target,
 * so periods before the archive date still resolve to the prior real target.
 */
export function resolveActiveTarget(
  records: TargetRecord[],
  asOfISODate: string,
): TargetRecord | null {
  const applicable = records
    .filter((r) => r.effectiveFrom <= asOfISODate)
    .sort((a, b) =>
      a.effectiveFrom < b.effectiveFrom ? 1 : a.effectiveFrom > b.effectiveFrom ? -1 : 0,
    );
  const latest = applicable[0];
  if (!latest || !latest.isActive) return null;
  return latest;
}

/**
 * One row per (role, rep, metric, period) group that currently has an active
 * target as of `asOfISODate` — the shared basis for both the admin's "current
 * targets" listing and the team-wide performance table. Groups whose latest
 * version is archived are simply omitted (there's nothing "current" to show).
 */
export function currentTargetsAsOf(records: TargetRecord[], asOfISODate: string): TargetRecord[] {
  const groups = new Map<string, TargetRecord[]>();
  for (const r of records) {
    const key = `${r.role}|${r.teamMemberName}|${r.metricKey}|${r.period}`;
    const arr = groups.get(key) ?? [];
    arr.push(r);
    groups.set(key, arr);
  }
  const out: TargetRecord[] = [];
  for (const arr of groups.values()) {
    const resolved = resolveActiveTarget(arr, asOfISODate);
    if (resolved) out.push(resolved);
  }
  return out;
}

interface YMD {
  y: number;
  m: number; // 1-indexed
  d: number;
}

function parseISODate(iso: string): YMD {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
}

function utcMs(ymd: YMD): number {
  return Date.UTC(ymd.y, ymd.m - 1, ymd.d);
}

function toISODate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

const DAY_MS = 86_400_000;
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export interface PeriodWindow {
  period: TargetPeriod;
  start: string;
  end: string;
  daysTotal: number;
  label: string;
}

/**
 * The real calendar period (day / Monday-start week / calendar month)
 * containing `anchorISODate` — computed purely from calendar rules, never
 * from whatever preset the page's date-range picker happens to show. This is
 * what keeps a "monthly" target honest even when the dashboard's own filter
 * is set to a custom or partial range (Priority 5's requirement) — the two
 * are deliberately independent concepts.
 */
export function periodWindow(period: TargetPeriod, anchorISODate: string): PeriodWindow {
  const anchor = parseISODate(anchorISODate);
  const anchorMs = utcMs(anchor);

  if (period === "daily") {
    return {
      period,
      start: anchorISODate,
      end: anchorISODate,
      daysTotal: 1,
      label: new Date(anchorMs).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      }),
    };
  }

  if (period === "weekly") {
    const dow = new Date(anchorMs).getUTCDay(); // 0=Sun..6=Sat
    const sinceMonday = (dow + 6) % 7;
    const startMs = anchorMs - sinceMonday * DAY_MS;
    const endMs = startMs + 6 * DAY_MS;
    const start = toISODate(startMs);
    const end = toISODate(endMs);
    const startLabel = new Date(startMs).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
    const endLabel = new Date(endMs).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
    return { period, start, end, daysTotal: 7, label: `Week of ${startLabel} – ${endLabel}` };
  }

  // monthly
  const startMs = Date.UTC(anchor.y, anchor.m - 1, 1);
  const endMs = Date.UTC(anchor.y, anchor.m, 0); // day 0 of next month = last day of this month
  const daysTotal = Math.round((endMs - startMs) / DAY_MS) + 1;
  return {
    period,
    start: toISODate(startMs),
    end: toISODate(endMs),
    daysTotal,
    label: `${MONTH_NAMES[anchor.m - 1]} ${anchor.y}`,
  };
}

/** Days elapsed within the window, inclusive of the anchor date, clamped to [1, daysTotal]. */
export function elapsedDays(window: PeriodWindow, anchorISODate: string): number {
  const startMs = utcMs(parseISODate(window.start));
  const anchorMs = utcMs(parseISODate(anchorISODate));
  const raw = Math.round((anchorMs - startMs) / DAY_MS) + 1;
  return Math.min(window.daysTotal, Math.max(1, raw));
}

export type TargetStatus =
  | "no_target"
  | "insufficient_data"
  | "ahead"
  | "on_pace"
  | "behind"
  | "at_risk";

export interface TargetProgress {
  status: TargetStatus;
  reason: string;
  format: KpiFormat;
  targetValue: number | null;
  actualValue: number | null;
  variance: number | null;
  percentOfTarget: number | null;
  expectedByNow: number | null;
  varianceVsExpected: number | null;
  daysElapsed: number;
  daysTotal: number;
  daysRemaining: number;
  remainingNeeded: number | null;
  requiredDailyPace: number | null;
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
}

const AHEAD_RATIO = 1.05;
const ON_PACE_RATIO = 0.9;
const COMPLETE_ON_PACE_RATIO = 0.9;

/**
 * Target → Actual → Variance → Pace → Required pace → Status, in one place.
 * `actualValue: null` means "not measurable this period" (e.g. zero EOD
 * submissions logged) and is always kept distinct from a real logged zero —
 * callers must never pass 0 as a stand-in for "unknown."
 */
export function computeTargetProgress(params: {
  format: KpiFormat;
  period: TargetPeriod;
  anchorISODate: string;
  targetValue: number | null;
  actualValue: number | null;
}): TargetProgress {
  const { format, period, anchorISODate, targetValue, actualValue } = params;
  const window = periodWindow(period, anchorISODate);
  const daysElapsed = elapsedDays(window, anchorISODate);
  const daysRemaining = window.daysTotal - daysElapsed;

  const base = {
    format,
    daysElapsed,
    daysTotal: window.daysTotal,
    daysRemaining,
    periodLabel: window.label,
    periodStart: window.start,
    periodEnd: window.end,
  };

  if (targetValue == null || targetValue <= 0) {
    return {
      ...base,
      status: "no_target",
      reason: "No target configured",
      targetValue: null,
      actualValue,
      variance: null,
      percentOfTarget: null,
      expectedByNow: null,
      varianceVsExpected: null,
      remainingNeeded: null,
      requiredDailyPace: null,
    };
  }

  if (actualValue == null) {
    return {
      ...base,
      status: "insufficient_data",
      reason: "Data unavailable for this period",
      targetValue,
      actualValue: null,
      variance: null,
      percentOfTarget: null,
      expectedByNow: null,
      varianceVsExpected: null,
      remainingNeeded: null,
      requiredDailyPace: null,
    };
  }

  const elapsedFraction = Math.min(1, daysElapsed / window.daysTotal);
  const expectedByNow = targetValue * elapsedFraction;
  const varianceVsExpected = actualValue - expectedByNow;
  const variance = actualValue - targetValue;
  const percentOfTarget = (actualValue / targetValue) * 100;
  const remainingNeeded = Math.max(0, targetValue - actualValue);
  const requiredDailyPace = daysRemaining > 0 ? remainingNeeded / daysRemaining : null;
  const periodComplete = daysRemaining <= 0;
  const attainment = actualValue / targetValue;
  // The target's own steady-state daily rate — a stable yardstick for "is the
  // catch-up pace still realistic," unlike dividing by the rep's
  // current run-rate, which degenerates to 0 (and would always look
  // catastrophic) on a day with a genuine zero logged.
  const targetDailyRate = targetValue / window.daysTotal;

  let status: TargetStatus;
  let reason: string;
  const fmt = (n: number) => formatKpiValue(format, n);

  if (periodComplete) {
    if (attainment >= 1) {
      status = "ahead";
      reason = `Exceeded target — ${fmt(actualValue)} / ${fmt(targetValue)}`;
    } else if (attainment >= COMPLETE_ON_PACE_RATIO) {
      status = "on_pace";
      reason = `Hit target — ${fmt(actualValue)} / ${fmt(targetValue)}`;
    } else {
      status = "behind";
      reason = `Missed target — ${fmt(actualValue)} / ${fmt(targetValue)}`;
    }
  } else {
    const relativeToExpected =
      expectedByNow > 0 ? varianceVsExpected / expectedByNow : actualValue > 0 ? 1 : 0;
    if (relativeToExpected >= AHEAD_RATIO - 1) {
      status = "ahead";
      reason = `Ahead of pace — ${fmt(actualValue)} / ${fmt(Math.round(expectedByNow * 100) / 100)} expected`;
    } else if (relativeToExpected >= ON_PACE_RATIO - 1) {
      status = "on_pace";
      reason = `On pace — ${fmt(actualValue)} / ${fmt(Math.round(expectedByNow * 100) / 100)} expected`;
    } else {
      const atRisk = requiredDailyPace != null && requiredDailyPace > targetDailyRate * 2;
      status = atRisk ? "at_risk" : "behind";
      reason =
        status === "at_risk"
          ? `At risk — needs ${fmt(requiredDailyPace ?? 0)}/day to reach target, vs a normal pace of ${fmt(targetDailyRate)}/day`
          : `Behind pace — ${fmt(actualValue)} / ${fmt(Math.round(expectedByNow * 100) / 100)} expected`;
    }
  }

  return {
    ...base,
    status,
    reason,
    targetValue,
    actualValue,
    variance,
    percentOfTarget,
    expectedByNow,
    varianceVsExpected,
    remainingNeeded,
    requiredDailyPace,
  };
}

export function formatKpiValue(format: KpiFormat, value: number): string {
  if (!Number.isFinite(value)) return "—";
  switch (format) {
    case "money_cents":
      return `$${Math.round(value / 100).toLocaleString()}`;
    case "percent":
      return `${value.toFixed(1)}%`;
    case "count":
    default:
      return Math.round(value).toLocaleString();
  }
}

export const STATUS_LABELS: Record<TargetStatus, string> = {
  no_target: "No Target",
  insufficient_data: "Insufficient Data",
  ahead: "Ahead",
  on_pace: "On Pace",
  behind: "Behind",
  at_risk: "At Risk",
};
