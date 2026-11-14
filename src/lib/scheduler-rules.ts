/**
 * Pure "is it due?" decisions for the minute-by-minute scheduler, kept apart
 * from the database so the timing rules can be tested directly.
 */
import { TOUCHPOINT_WINDOWS, type Touchpoint } from "./call-confirmations";
import {
  addCalendarDays,
  isValidTimeZone,
  localDateIn,
  localHourIn,
  localWeekdayIn,
} from "./zoned-time";

/**
 * How far back a due item may be and still fire.
 *
 * Without a bound the first tick after deploy would announce every callback
 * and follow-up that ever came due — months of them, all at once. A day
 * covers the scheduler being down for a while without turning its first run
 * into a flood.
 */
export const DUE_LOOKBACK_MS = 24 * 60 * 60 * 1000;

/** Event types the scheduler produces, i.e. the ones worth ticking for. */
export const SCHEDULED_EVENT_TYPES = [
  "call.unconfirmed",
  "callback.due",
  "followup.short_term_due",
  "followup.long_term_due",
  "report.daily_sales",
  "report.weekly_sales",
] as const;

/**
 * The `scheduled_for` range of calls whose confirmation deadline has passed
 * but which have not started yet (with a ten-minute grace so a missed tick,
 * or a deadline at the call's own start, still catches them).
 *
 * The deadline is the configured touchpoint's own window close — the same
 * point the calendar already marks that touchpoint "not sent". No new number.
 */
export function unconfirmedCallWindow(touchpoint: Touchpoint, now: Date) {
  const closes = TOUCHPOINT_WINDOWS[touchpoint].closesMinutesBefore;
  return {
    fromIso: new Date(now.getTime() - 10 * 60_000).toISOString(),
    toIso: new Date(now.getTime() + closes * 60_000).toISOString(),
  };
}

export function followUpEventType(eodLeadStatus: string | null | undefined) {
  if (eodLeadStatus === "Follow Up (short term)") return "followup.short_term_due" as const;
  if (eodLeadStatus === "Follow Up (long term)") return "followup.long_term_due" as const;
  return null;
}

export type ReportWindow =
  { due: true; from: string; to: string; key: string } | { due: false; reason: string };

/** The daily report is due from `hour` local time until midnight, once per local date. */
export function dailyReportWindow(
  timeZone: string | null | undefined,
  hour: number,
  now: Date,
): ReportWindow {
  if (!isValidTimeZone(timeZone)) return { due: false, reason: "no workspace timezone set" };
  if (localHourIn(timeZone, now) < hour) return { due: false, reason: "before send hour" };
  const today = localDateIn(timeZone, now);
  return { due: true, from: today, to: today, key: today };
}

/** The weekly report is due on `weekday` from `hour`, covering the 7 days ending that day. */
export function weeklyReportWindow(
  timeZone: string | null | undefined,
  weekday: number,
  hour: number,
  now: Date,
): ReportWindow {
  if (!isValidTimeZone(timeZone)) return { due: false, reason: "no workspace timezone set" };
  if (localWeekdayIn(timeZone, now) !== weekday) return { due: false, reason: "not report day" };
  if (localHourIn(timeZone, now) < hour) return { due: false, reason: "before send hour" };
  const today = localDateIn(timeZone, now);
  return { due: true, from: addCalendarDays(today, -6), to: today, key: today };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Thu, Nov 13" or "Nov 7 – Nov 13" for a local date range. */
export function periodLabel(from: string, to: string) {
  const fmt = (d: string, withDay: boolean) => {
    const [y, m, day] = d.split("-").map(Number);
    const dow = DAYS[new Date(Date.UTC(y, m - 1, day)).getUTCDay()];
    return `${withDay ? `${dow}, ` : ""}${MONTHS[m - 1]} ${day}`;
  };
  return from === to ? fmt(to, true) : `${fmt(from, false)} – ${fmt(to, false)}`;
}
