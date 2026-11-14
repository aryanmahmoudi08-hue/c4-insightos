/**
 * The daily / weekly sales team leaderboard, from what reps actually logged.
 *
 * Two sources, and each role's numbers come from its own:
 *   - setters and dialers: their EOD rows (`setter_activity`) — dials, sets,
 *     calls on calendar, live calls, closes, cash.
 *   - closers: their post-call rows (`calls` with a closer name) — one row per
 *     call taken, with showed / closed / cash on it.
 *
 * Team totals take sets and dials from setters and show/close from closers.
 * Closes and cash use the larger of the two sides rather than their sum: an
 * inbound dialer who closes on the phone logs it on their EOD, and a closer's
 * sale can also appear on the setter's EOD, so adding them would count one
 * sale twice. Same rule as the weekly digest (weekly-report.server.ts).
 *
 * Cash is only summed in USD. A row logged in another currency is counted
 * and reported as excluded rather than silently added as if it were dollars.
 */
import type { LeaderboardRow } from "./discord-format";

export type SetterActivityRow = {
  team_member_name: string | null;
  dials: number | null;
  sets: number | null;
  calls_on_calendar: number | null;
  live_calls: number | null;
  closes: number | null;
  cash_collected_cents: number | null;
  original_currency: string | null;
};

export type CloserCallRow = {
  closer_name: string | null;
  showed: boolean | null;
  closed: boolean | null;
  status: string | null;
  eod_lead_status: string | null;
  cash_collected_cents: number | null;
  original_currency: string | null;
};

export type Leaderboard = {
  setters: LeaderboardRow[];
  closers: LeaderboardRow[];
  team: LeaderboardRow;
  setter_totals: LeaderboardRow;
  closer_totals: LeaderboardRow;
  /** Rows whose cash was in a currency other than USD and so not summed. */
  non_usd_rows_excluded: number;
};

const n = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const isUsd = (c: string | null | undefined) => !c || c.toUpperCase() === "USD";

/** A call the closer logged as a no-show, by either the enum or the EOD label. */
export function isNoShow(c: Pick<CloserCallRow, "status" | "eod_lead_status" | "showed">) {
  if (c.showed) return false;
  return c.status === "no_show" || c.eod_lead_status === "No Show";
}

function sumRows(name: string, rows: LeaderboardRow[]): LeaderboardRow {
  const t: LeaderboardRow = {
    name,
    dials: 0,
    sets: 0,
    booked: 0,
    showed: 0,
    noShows: 0,
    closed: 0,
    cashCents: 0,
  };
  for (const r of rows) {
    t.dials! += r.dials ?? 0;
    t.sets! += r.sets ?? 0;
    t.booked! += r.booked ?? 0;
    t.showed! += r.showed ?? 0;
    t.noShows! += r.noShows ?? 0;
    t.closed! += r.closed ?? 0;
    t.cashCents! += r.cashCents ?? 0;
  }
  return t;
}

const byCashThenClosed = (a: LeaderboardRow, b: LeaderboardRow) =>
  (b.cashCents ?? 0) - (a.cashCents ?? 0) ||
  (b.closed ?? 0) - (a.closed ?? 0) ||
  (b.sets ?? 0) - (a.sets ?? 0) ||
  (b.dials ?? 0) - (a.dials ?? 0) ||
  a.name.localeCompare(b.name);

export function buildLeaderboard(
  setterRows: SetterActivityRow[],
  closerRows: CloserCallRow[],
): Leaderboard {
  let nonUsd = 0;

  const setters = new Map<string, LeaderboardRow>();
  for (const r of setterRows) {
    const name = (r.team_member_name ?? "").trim();
    if (!name) continue;
    const row = setters.get(name) ?? {
      name,
      dials: 0,
      sets: 0,
      booked: 0,
      showed: 0,
      closed: 0,
      cashCents: 0,
    };
    row.dials! += n(r.dials);
    row.sets! += n(r.sets);
    row.booked! += n(r.calls_on_calendar);
    row.showed! += n(r.live_calls);
    row.closed! += n(r.closes);
    if (isUsd(r.original_currency)) row.cashCents! += n(r.cash_collected_cents);
    else if (n(r.cash_collected_cents)) nonUsd += 1;
    setters.set(name, row);
  }

  const closers = new Map<string, LeaderboardRow>();
  for (const c of closerRows) {
    const name = (c.closer_name ?? "").trim();
    if (!name) continue;
    const row = closers.get(name) ?? {
      name,
      booked: 0,
      showed: 0,
      noShows: 0,
      closed: 0,
      cashCents: 0,
    };
    row.booked! += 1;
    if (c.showed) row.showed! += 1;
    if (isNoShow(c)) row.noShows! += 1;
    if (c.closed) row.closed! += 1;
    if (isUsd(c.original_currency)) row.cashCents! += n(c.cash_collected_cents);
    else if (n(c.cash_collected_cents)) nonUsd += 1;
    closers.set(name, row);
  }

  const setterList = [...setters.values()].sort(byCashThenClosed);
  const closerList = [...closers.values()].sort(byCashThenClosed);
  const setterTotals = sumRows("All setters", setterList);
  const closerTotals = sumRows("All closers", closerList);

  const team: LeaderboardRow = {
    name: "Team",
    dials: setterTotals.dials,
    sets: setterTotals.sets,
    booked: setterTotals.booked,
    showed: closerTotals.showed,
    noShows: closerTotals.noShows,
    closed: Math.max(closerTotals.closed ?? 0, setterTotals.closed ?? 0),
    cashCents: Math.max(closerTotals.cashCents ?? 0, setterTotals.cashCents ?? 0),
  };

  return {
    setters: setterList,
    closers: closerList,
    team,
    setter_totals: setterTotals,
    closer_totals: closerTotals,
    non_usd_rows_excluded: nonUsd,
  };
}
