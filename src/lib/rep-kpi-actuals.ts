// Pure "real records → actual number" extraction for the KPI Target Engine.
// Kept separate from kpi-targets.ts (period/pace math) and from any Supabase
// import so both halves stay independently unit-testable.
//
// `null` always means "not measurable this period" (zero EOD submissions /
// zero call rows logged for this rep in the window) — never conflated with a
// real, logged zero. This mirrors the observed()/optionalMetric() convention
// already established in activity-module.tsx.

/** Both bounds inclusive, comparing plain YYYY-MM-DD strings (lexicographic = chronological for this format). */
function withinWindow(dateISO: string | null | undefined, start: string, end: string): boolean {
  if (!dateISO) return false;
  const day = dateISO.slice(0, 10);
  return day >= start && day <= end;
}

export function sliceSetterActivityToWindow<T extends { activity_date?: string | null }>(
  rows: T[],
  start: string,
  end: string,
): T[] {
  return rows.filter((r) => withinWindow(r.activity_date, start, end));
}

export function sliceCallsToWindow<T extends { scheduled_for?: string | null }>(
  rows: T[],
  start: string,
  end: string,
): T[] {
  return rows.filter((r) => withinWindow(r.scheduled_for, start, end));
}

export interface SetterActivityActualRow {
  team_member_name: string | null;
  /** YYYY-MM-DD — used by callers to slice into a specific target's period window before extraction. */
  activity_date?: string | null;
  outbound_dms_sent?: number | null;
  inbound_dms_sent?: number | null;
  replies?: number | null;
  qualified_convos?: number | null;
  calls_on_calendar?: number | null;
  live_calls?: number | null;
  dials?: number | null;
  connections?: number | null;
  leads_contacted?: number | null;
}

type SetterColumn = keyof Omit<SetterActivityActualRow, "team_member_name">;

const SETTER_ACTIVITY_COLUMN: Record<string, SetterColumn> = {
  outbound_dms_sent: "outbound_dms_sent",
  inbound_dms_sent: "inbound_dms_sent",
  replies: "replies",
  qualified_convos_setter: "qualified_convos",
  calls_on_calendar_setter: "calls_on_calendar",
  live_calls_setter: "live_calls",
  dials: "dials",
  connections: "connections",
  leads_contacted: "leads_contacted",
  qualified_convos_dialer: "qualified_convos",
  calls_on_calendar_dialer: "calls_on_calendar",
  live_calls_dialer: "live_calls",
};

/**
 * `rows` should already be scoped to the target's own period window (not
 * necessarily the page's date-range filter) — callers fetch the outer bound
 * once (month start → anchor) and slice per period in memory.
 */
export function actualFromSetterActivity(
  rows: SetterActivityActualRow[],
  teamMemberName: string,
  metricKey: string,
): number | null {
  const repRows = rows.filter((r) => r.team_member_name === teamMemberName);
  if (repRows.length === 0) return null; // no EOD submissions logged this period
  const col = SETTER_ACTIVITY_COLUMN[metricKey];
  if (!col) return null;
  const anyHasCol = repRows.some((r) => Object.prototype.hasOwnProperty.call(r, col));
  if (!anyHasCol) return null; // field never asked of this role — not applicable, not zero
  return repRows.reduce((sum, r) => sum + (Number(r[col] ?? 0) || 0), 0);
}

export interface CallActualRow {
  closer_name: string | null;
  /** ISO timestamp (calls.scheduled_for) — used by callers to slice into a specific target's period window before extraction. */
  scheduled_for?: string | null;
  showed?: boolean | null;
  offer_made?: boolean | null;
  closed?: boolean | null;
  cash_collected_cents?: number | null;
  contract_value_cents?: number | null;
  status?: string | null;
  // Remediation (currency-mixing audit,
  // docs/ascendos-currency-mixing-audit.md — rep-kpi-actuals.ts item):
  // calls.cash_collected_cents/contract_value_cents carry a real
  // original_currency never converted before this fix. This module is
  // deliberately pure/synchronous (no Supabase import, independently unit-
  // testable — see the file header) and has no access to historical FX
  // rates, so it cannot convert a non-USD row to USD itself. The smallest
  // correct fix consistent with that constraint: extend the row type to
  // carry the real currency tag, and never fold a non-USD row into a money
  // total as if it were USD (see actualFromCalls below) — excluded, not
  // guessed, same rule sumNormalizedCents/usdCentsForRow enforce everywhere
  // else in this app.
  original_currency?: string | null;
}

/** True if any of this rep's rows for a money metric ("cash_collected_cents"
 * / "contract_value_cents") are in a non-USD currency — callers that want to
 * surface an honest "FX incomplete" disclosure (this module has no FX-rate
 * access to convert them, so those rows are excluded from
 * `actualFromCalls`'s totals below, not guessed as USD) can check this
 * without every caller needing to change its own return-type contract. */
export function callActualHasNonUsdRows(
  rows: CallActualRow[],
  closerName: string,
  metricKey: string,
): boolean {
  if (metricKey !== "cash_collected_cents" && metricKey !== "contract_value_cents") return false;
  return rows.some(
    (r) =>
      r.closer_name === closerName &&
      typeof r.original_currency === "string" &&
      r.original_currency.toUpperCase() !== "USD",
  );
}

export function actualFromCalls(
  rows: CallActualRow[],
  closerName: string,
  metricKey: string,
): number | null {
  const repRows = rows.filter((r) => r.closer_name === closerName);
  if (repRows.length === 0) return null; // no calls logged for this closer this period

  switch (metricKey) {
    case "shows":
      return repRows.filter((r) => r.showed).length;
    case "offers_made":
      return repRows.filter((r) => r.offer_made).length;
    // Remediation (metric-dictionary audit, SALE-0369): "closes" previously
    // counted only r.closed, while every other "Closes" tile on the Closer
    // page (Money & closing, Rate charts, Disposition mix, Revenue Source
    // Mix, Scorecard — closer.tsx) counts `closed || status === "closed"`.
    // A call can be marked closed via status without the boolean flag set
    // (or vice versa in older rows); this was the one outlier that could
    // under-count relative to every other Closes number on the same page.
    // Canonical predicate: `closed || status === "closed"`.
    case "closes":
      return repRows.filter((r) => r.closed || r.status === "closed").length;
    case "close_rate_pct": {
      // Closes ÷ Showed — the same defensible denominator the closer
      // dashboard itself already uses (not Offers, not all calls).
      const shows = repRows.filter((r) => r.showed).length;
      if (shows === 0) return null;
      const closes = repRows.filter((r) => r.closed || r.status === "closed").length;
      return (closes / shows) * 100;
    }
    // Remediation (currency-mixing audit): a row whose original_currency is
    // set and non-USD is excluded here, never summed as if it were USD —
    // this module has no FX rate access to convert it correctly. Rows with
    // no original_currency at all (demo/mock fixtures, or a value genuinely
    // unset) default to USD, same convention as sumNormalizedCents.
    case "cash_collected_cents":
      return repRows.reduce((sum, r) => {
        const cur = (r.original_currency || "USD").toUpperCase();
        return cur === "USD" ? sum + (r.cash_collected_cents ?? 0) : sum;
      }, 0);
    case "contract_value_cents":
      return repRows.reduce((sum, r) => {
        const cur = (r.original_currency || "USD").toUpperCase();
        return cur === "USD" ? sum + (r.contract_value_cents ?? 0) : sum;
      }, 0);
    case "follow_ups_logged":
      return repRows.filter((r) => r.status === "follow_up").length;
    default:
      return null;
  }
}
