/**
 * The daily / weekly / monthly sales team reports: a team scoreboard, one
 * ranked leaderboard per role, and callouts (Aryan's remodel, 2026-11-15).
 *
 * Where each number comes from:
 *   - DM setters and dialers: their EOD rows (`setter_activity`), split by
 *     the row's role.
 *   - Closers: their post-call rows (`calls` with a closer name), one row
 *     per call taken.
 *   - A setter's cash and revenue: the closed calls in the period whose
 *     `setter_id` is that setter. Calls with no setter are counted in
 *     `unassigned_closes` so the gap is visible instead of silently $0.
 *
 * Team cash and revenue take the larger of the closer side and the setter
 * EOD side rather than their sum (an inbound dialer who closes on the phone
 * logs it on their EOD, and a closer's sale can also appear there). Only USD
 * is summed; other currencies are counted as excluded.
 *
 * Pure: every input is passed in, so it is unit-tested without a database.
 */
import { isNoShow } from "./sales-leaderboard";

export type ReportKind = "Daily" | "Weekly" | "Monthly";

export type EodRow = {
  user_id?: string | null;
  team_member_name: string | null;
  role: string | null;
  dials?: number | null;
  connections?: number | null;
  sets?: number | null;
  replies?: number | null;
  qualified_convos?: number | null;
  outbound_dms_sent?: number | null;
  calls_on_calendar?: number | null;
  closes?: number | null;
  cash_collected_cents?: number | null;
  total_revenue_cents?: number | null;
  original_currency?: string | null;
};

export type CloserCall = {
  closer_name: string | null;
  setter_id?: string | null;
  showed: boolean | null;
  closed: boolean | null;
  status: string | null;
  eod_lead_status: string | null;
  cash_collected_cents: number | null;
  contract_value_cents?: number | null;
  original_currency: string | null;
};

export type RosterMember = { name: string; role: string | null; active: boolean | null };

export type RepLine = {
  name: string;
  /** Closers */
  taken?: number;
  showed?: number;
  noShows?: number;
  closed?: number;
  cashCents?: number;
  revenueCents?: number;
  /** Setters / dialers */
  sets?: number;
  dials?: number;
  connections?: number;
  replies?: number;
  qualified?: number;
  /** Key metric in the previous period, for ▲▼ (weekly / monthly). */
  prev?: number;
};

export type TeamTotals = {
  cashCents: number;
  revenueCents: number;
  closes: number;
  booked: number;
  onCalendar: number;
  showed: number;
  noShows: number;
};

export type SalesReport = {
  kind: ReportKind;
  team: TeamTotals;
  prev_team?: TeamTotals | null;
  closers: RepLine[];
  dm_setters: RepLine[];
  dialers: RepLine[];
  /** Reps on the roster (or with a row) who logged nothing in the period. */
  no_activity: string[];
  /** Daily: active setters/dialers on the roster with no EOD filed. */
  missing_eods: string[];
  /** Closed calls in the period with no setter on them. */
  unassigned_closes: number;
  /** Monthly: sum of the closers' monthly cash targets, when any are set. */
  cash_target_cents?: number | null;
  /** Weekly / monthly: the top lead source in the period. */
  top_source?: { name: string; leads: number; booked: number } | null;
  non_usd_rows_excluded: number;
};

const n = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const isUsd = (c: string | null | undefined) => !c || c.toUpperCase() === "USD";
const nameOf = (s: string | null | undefined) => (s ?? "").trim();

/** The number each role is ranked by, also used for ▲▼ and "most improved". */
export const keyMetric = (role: "closer" | "setter", r: RepLine) =>
  role === "closer" ? n(r.cashCents) : n(r.sets);

const byCloser = (a: RepLine, b: RepLine) =>
  n(b.cashCents) - n(a.cashCents) ||
  n(b.closed) - n(a.closed) ||
  n(b.closed) / Math.max(1, n(b.showed)) - n(a.closed) / Math.max(1, n(a.showed)) ||
  a.name.localeCompare(b.name);

const bySetter = (a: RepLine, b: RepLine) =>
  n(b.sets) - n(a.sets) ||
  n(b.revenueCents) - n(a.revenueCents) ||
  n(b.sets) / Math.max(1, n(b.qualified) || n(b.connections)) -
    n(a.sets) / Math.max(1, n(a.qualified) || n(a.connections)) ||
  a.name.localeCompare(b.name);

const hasActivity = (r: RepLine) =>
  [r.taken, r.sets, r.dials, r.replies, r.qualified, r.closed, r.cashCents].some((v) => n(v) > 0);

export function buildSalesReport(input: {
  kind: ReportKind;
  eodRows: EodRow[];
  closerCalls: CloserCall[];
  /** setter_id (profile id) → display name, for calls whose setter filed no EOD. */
  setterNames?: Map<string, string>;
  roster?: RosterMember[];
  booked: number;
  onCalendar: number;
}): SalesReport {
  const { kind, eodRows, closerCalls } = input;
  let nonUsd = 0;

  // ---- setters and dialers, from their EODs
  const setterMap = new Map<string, RepLine & { role: string }>();
  const nameByUser = new Map<string, string>();
  let eodCash = 0;
  let eodRevenue = 0;
  for (const r of eodRows) {
    const name = nameOf(r.team_member_name);
    if (!name) continue;
    if (r.user_id) nameByUser.set(r.user_id, name);
    const role = r.role === "inbound_dialer" ? "inbound_dialer" : "dm_setter";
    const row = setterMap.get(name) ?? { name, role };
    row.dials = n(row.dials) + n(r.dials);
    row.connections = n(row.connections) + n(r.connections);
    row.sets = n(row.sets) + n(r.sets);
    row.replies = n(row.replies) + n(r.replies);
    row.qualified = n(row.qualified) + n(r.qualified_convos);
    setterMap.set(name, row);
    if (isUsd(r.original_currency)) {
      eodCash += n(r.cash_collected_cents);
      eodRevenue += n(r.total_revenue_cents);
    } else if (n(r.cash_collected_cents)) nonUsd += 1;
  }

  // ---- closers, and the money on each setter's sets
  const closerMap = new Map<string, RepLine>();
  let unassigned = 0;
  for (const c of closerCalls) {
    const usd = isUsd(c.original_currency);
    if (!usd && n(c.cash_collected_cents)) nonUsd += 1;
    const cash = usd ? n(c.cash_collected_cents) : 0;
    const revenue = usd && c.closed ? n(c.contract_value_cents) || cash : 0;

    const cn = nameOf(c.closer_name);
    if (cn) {
      const row = closerMap.get(cn) ?? {
        name: cn,
        taken: 0,
        showed: 0,
        noShows: 0,
        closed: 0,
        cashCents: 0,
        revenueCents: 0,
      };
      row.taken = n(row.taken) + 1;
      if (c.showed) row.showed = n(row.showed) + 1;
      if (isNoShow(c)) row.noShows = n(row.noShows) + 1;
      if (c.closed) row.closed = n(row.closed) + 1;
      row.cashCents = n(row.cashCents) + cash;
      row.revenueCents = n(row.revenueCents) + revenue;
      closerMap.set(cn, row);
    }

    if (c.closed && !c.setter_id) unassigned += 1;
    if (c.setter_id) {
      const sn = nameByUser.get(c.setter_id) ?? input.setterNames?.get(c.setter_id);
      if (!sn) continue;
      const row = setterMap.get(sn) ?? {
        name: sn,
        role:
          input.roster?.find((m) => nameOf(m.name) === sn)?.role === "inbound_dialer"
            ? "inbound_dialer"
            : "dm_setter",
      };
      if (c.showed) row.showed = n(row.showed) + 1;
      if (c.closed) row.closed = n(row.closed) + 1;
      row.cashCents = n(row.cashCents) + cash;
      row.revenueCents = n(row.revenueCents) + revenue;
      setterMap.set(sn, row);
    }
  }

  const closersAll = [...closerMap.values()];
  const settersAll = [...setterMap.values()];
  const closerTotals = closersAll.reduce(
    (t, r) => ({
      showed: t.showed + n(r.showed),
      noShows: t.noShows + n(r.noShows),
      closed: t.closed + n(r.closed),
      cash: t.cash + n(r.cashCents),
      revenue: t.revenue + n(r.revenueCents),
    }),
    { showed: 0, noShows: 0, closed: 0, cash: 0, revenue: 0 },
  );
  const eodCloses = eodRows.reduce((s, r) => s + n(r.closes), 0);

  // Everyone on the roster in a sales role, plus anyone with a row.
  const roster = (input.roster ?? []).filter(
    (m) => m.active !== false && ["dm_setter", "inbound_dialer", "closer"].includes(m.role ?? ""),
  );
  const seen = new Set([...closerMap.keys(), ...setterMap.keys()]);
  const noActivity = [
    ...roster.map((m) => nameOf(m.name)).filter((x) => x && !seen.has(x)),
    ...[...closersAll, ...settersAll].filter((r) => !hasActivity(r)).map((r) => r.name),
  ];
  const filed = new Set(eodRows.map((r) => nameOf(r.team_member_name)));
  const missingEods =
    kind === "Daily"
      ? roster
          .filter((m) => m.role === "dm_setter" || m.role === "inbound_dialer")
          .map((m) => nameOf(m.name))
          .filter((x) => x && !filed.has(x))
      : [];

  return {
    kind,
    team: {
      cashCents: Math.max(closerTotals.cash, eodCash),
      revenueCents: Math.max(closerTotals.revenue, eodRevenue),
      closes: Math.max(closerTotals.closed, eodCloses),
      booked: input.booked,
      onCalendar: input.onCalendar,
      showed: closerTotals.showed,
      noShows: closerTotals.noShows,
    },
    closers: closersAll.filter(hasActivity).sort(byCloser),
    dm_setters: settersAll.filter((r) => r.role === "dm_setter" && hasActivity(r)).sort(bySetter),
    dialers: settersAll.filter((r) => r.role === "inbound_dialer" && hasActivity(r)).sort(bySetter),
    no_activity: [...new Set(noActivity)].sort(),
    missing_eods: [...new Set(missingEods)].sort(),
    unassigned_closes: unassigned,
    non_usd_rows_excluded: nonUsd,
  };
}

/** Puts the previous period's key metric on each rep, for ▲▼. */
export function attachPrevious(current: SalesReport, previous: SalesReport): SalesReport {
  const prevOf = (list: RepLine[], role: "closer" | "setter") =>
    new Map(list.map((r) => [r.name, keyMetric(role, r)]));
  const pc = prevOf(previous.closers, "closer");
  const ps = prevOf([...previous.dm_setters, ...previous.dialers], "setter");
  return {
    ...current,
    prev_team: previous.team,
    closers: current.closers.map((r) => ({ ...r, prev: pc.get(r.name) ?? 0 })),
    dm_setters: current.dm_setters.map((r) => ({ ...r, prev: ps.get(r.name) ?? 0 })),
    dialers: current.dialers.map((r) => ({ ...r, prev: ps.get(r.name) ?? 0 })),
  };
}

/** The period before a report window: the previous day, week or calendar month. */
export function previousWindow(kind: ReportKind, from: string): { from: string; to: string } {
  const d = (s: string) => {
    const [y, m, day] = s.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, day));
  };
  const iso = (x: Date) => x.toISOString().slice(0, 10);
  const start = d(from);
  if (kind === "Monthly") {
    const prevStart = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 1, 1));
    const prevEnd = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 0));
    return { from: iso(prevStart), to: iso(prevEnd) };
  }
  const len = kind === "Weekly" ? 7 : 1;
  const prevStart = new Date(start.getTime() - len * 86400e3);
  const prevEnd = new Date(start.getTime() - 86400e3);
  return { from: iso(prevStart), to: iso(prevEnd) };
}
