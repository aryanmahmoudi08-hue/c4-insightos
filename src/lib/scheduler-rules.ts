/**
 * Pure "is it due?" decisions for the minute-by-minute scheduler, kept apart
 * from the database so the timing rules can be tested directly.
 */
import {
  addCalendarDays,
  isValidTimeZone,
  localDateIn,
  localHourIn,
  localWeekdayIn,
  zonedTimeUtc,
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
  "callback.logged",
  "callback.due",
  "followup.short_term_due",
  "followup.long_term_due",
  "report.daily_sales",
  "report.weekly_sales",
  "report.monthly_sales",
  "content.schedule_daily",
  "report.top_sources_daily",
  "report.top_sources_weekly",
  "report.top_sources_monthly",
  "lead.applied_not_booked",
  "eod.missing",
  "calls.today",
  "payment.followup_logged",
  "payment.followup_due",
  "precall.progress",
  // Not produced by the scheduler itself, but an org listening for it gets
  // the Google Calendar invite check, which confirms calls.
  "call.confirmed",
] as const;

/**
 * The #calls-unconfirmed schedule: while a call is still unconfirmed, alert
 * at 10 PM (business time) the night before, then 3 h, 2 h, 1 h and 30 min
 * before it. The first three ping setters; from an hour out closers too.
 */
export const UNCONFIRMED_ALERTS = [
  { n: 1, nightBeforeHour: 22, pings: ["setter"] },
  { n: 2, minutesBefore: 180, pings: ["setter"] },
  { n: 3, minutesBefore: 120, pings: ["setter"] },
  { n: 4, minutesBefore: 60, pings: ["setter", "closer"] },
  { n: 5, minutesBefore: 30, pings: ["setter", "closer"] },
] as const;

/** No alert fires this soon after the booking: someone who books for two
 *  hours from now should not be chased minutes later. */
export const MIN_MINUTES_AFTER_BOOKING = 15;
/** An alert this late (the scheduler was down) is skipped, not sent stale. */
export const ALERT_STALE_MINUTES = 15;
/** How far ahead a call can be and still have an alert due: the night-before
 *  alert for a call just before midnight is ~26 h out. */
export const UNCONFIRMED_LOOKAHEAD_MS = 27 * 60 * 60 * 1000;

export type UnconfirmedAlert = { n: number; at: Date; pings: ReadonlyArray<"setter" | "closer"> };

/**
 * The alerts a call gets, in time order. Any whose time had already passed
 * when the call was booked — or would land within MIN_MINUTES_AFTER_BOOKING
 * of it — are dropped, so a same-day booking only gets the ones still ahead.
 * Without a business timezone "10 PM the night before" means nothing, so
 * that alert is dropped rather than guessed in UTC.
 */
export function unconfirmedAlertSchedule(
  scheduledFor: Date,
  bookedAt: Date | null,
  timeZone: string | null | undefined,
): UnconfirmedAlert[] {
  const out: UnconfirmedAlert[] = [];
  for (const a of UNCONFIRMED_ALERTS) {
    let at: Date | null = null;
    if ("minutesBefore" in a) at = new Date(scheduledFor.getTime() - a.minutesBefore * 60_000);
    else if (isValidTimeZone(timeZone)) {
      const callDay = localDateIn(timeZone, scheduledFor);
      at = zonedTimeUtc(addCalendarDays(callDay, -1), a.nightBeforeHour, 0, timeZone);
    }
    if (at) out.push({ n: a.n, at, pings: a.pings });
  }
  out.sort((x, y) => x.at.getTime() - y.at.getTime());
  // A call just after midnight puts "10 PM the night before" after the 3 h
  // alert; it then says nothing the next alert does not.
  const ordered = out.filter((a, i) => !(a.n === 1 && i > 0));
  const earliest = bookedAt ? bookedAt.getTime() + MIN_MINUTES_AFTER_BOOKING * 60_000 : -Infinity;
  return ordered.filter((a) => a.at.getTime() >= earliest);
}

/** The alert due for this call right now, if any — the latest whose time has
 *  come, provided it is not stale and the call has not started. */
export function unconfirmedAlertDue(
  scheduledFor: Date,
  bookedAt: Date | null,
  timeZone: string | null | undefined,
  now: Date,
): UnconfirmedAlert | null {
  if (now.getTime() >= scheduledFor.getTime()) return null;
  const due = unconfirmedAlertSchedule(scheduledFor, bookedAt, timeZone).filter(
    (a) => a.at.getTime() <= now.getTime(),
  );
  const latest = due[due.length - 1];
  if (!latest) return null;
  return now.getTime() - latest.at.getTime() <= ALERT_STALE_MINUTES * 60_000 ? latest : null;
}

export function followUpEventType(eodLeadStatus: string | null | undefined) {
  if (eodLeadStatus === "Follow Up (short term)") return "followup.short_term_due" as const;
  if (eodLeadStatus === "Follow Up (long term)") return "followup.long_term_due" as const;
  return null;
}

/** The "logged" event that pairs with a follow-up's "due" event. */
export function followUpLoggedType(
  due: "followup.short_term_due" | "followup.long_term_due",
): "followup.short_term_logged" | "followup.long_term_logged" {
  return due === "followup.short_term_due"
    ? "followup.short_term_logged"
    : "followup.long_term_logged";
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

/**
 * The monthly report is due on the month's last local day from `hour`,
 * covering the whole calendar month — the same "period ending today" shape as
 * the daily and weekly reports, and a complete month rather than a rolling 30
 * days, so two months can be compared.
 */
export function monthlyReportWindow(
  timeZone: string | null | undefined,
  hour: number,
  now: Date,
): ReportWindow {
  if (!isValidTimeZone(timeZone)) return { due: false, reason: "no workspace timezone set" };
  const today = localDateIn(timeZone, now);
  if (!addCalendarDays(today, 1).endsWith("-01")) return { due: false, reason: "not month end" };
  if (localHourIn(timeZone, now) < hour) return { due: false, reason: "before send hour" };
  return { due: true, from: `${today.slice(0, 7)}-01`, to: today, key: today.slice(0, 7) };
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
