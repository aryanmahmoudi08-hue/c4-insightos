/**
 * Calendar days in a named timezone, as UTC instants.
 *
 * Every "today" in this app was built as a naive string — `${date}T00:00:00`
 * to `${date}T23:59:59` — and compared against `timestamptz` columns.
 * Postgres reads a naive string in the session timezone, which is UTC on
 * Supabase, so the date was picked in one timezone and the window applied in
 * another. For a workspace in New York "today" ran 19:00 yesterday to 18:59
 * today: the evening, which is when calls happen, was the part that vanished.
 *
 * These helpers turn a local calendar date plus an IANA zone into the real
 * instants that bound it, DST included, using only `Intl` — no tz database
 * shipped in the bundle.
 */

const pad = (n: number) => String(n).padStart(2, "0");

/** Wall-clock parts of `instant` as read in `timeZone`. */
function partsIn(timeZone: string, instant: Date) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
  });
  const out: Record<string, string> = {};
  for (const p of fmt.formatToParts(instant)) out[p.type] = p.value;
  return {
    y: Number(out.year),
    m: Number(out.month),
    d: Number(out.day),
    // Some engines render midnight as "24" even with h23.
    h: Number(out.hour) % 24,
    min: Number(out.minute),
    s: Number(out.second),
    weekday: out.weekday,
  };
}

/** True when `timeZone` is a zone this runtime can actually resolve. */
export function isValidTimeZone(timeZone: string | null | undefined): timeZone is string {
  if (!timeZone) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

/** Offset of `timeZone` from UTC at `instant`, in milliseconds (EST = -5h). */
export function zoneOffsetMs(timeZone: string, instant: Date): number {
  const p = partsIn(timeZone, instant);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** "YYYY-MM-DD" for the calendar date `instant` falls on in `timeZone`. */
export function localDateIn(timeZone: string, instant: Date = new Date()): string {
  const p = partsIn(timeZone, instant);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}

/** 0–23 hour of `instant` in `timeZone`. */
export function localHourIn(timeZone: string, instant: Date = new Date()): number {
  return partsIn(timeZone, instant).h;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** 0 (Sunday) – 6 (Saturday) of `instant` in `timeZone`. */
export function localWeekdayIn(timeZone: string, instant: Date = new Date()): number {
  return WEEKDAYS.indexOf(partsIn(timeZone, instant).weekday);
}

/**
 * The UTC instant at which local midnight of `date` ("YYYY-MM-DD") begins in
 * `timeZone`.
 *
 * Resolved in two passes because the offset depends on the instant: a first
 * guess using the offset at UTC midnight, then corrected with the offset at
 * that guess. That lands on the right side of a DST change in both
 * directions.
 */
export function zonedMidnightUtc(date: string, timeZone: string): Date {
  return zonedTimeUtc(date, 0, 0, timeZone);
}

/** The UTC instant of local `hour:minute` on `date` in `timeZone` — same
 *  two-pass offset correction, so 10 PM stays 10 PM across a DST change. */
export function zonedTimeUtc(date: string, hour: number, minute: number, timeZone: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const naiveUtc = Date.UTC(y, m - 1, d, hour, minute);
  const first = naiveUtc - zoneOffsetMs(timeZone, new Date(naiveUtc));
  const second = naiveUtc - zoneOffsetMs(timeZone, new Date(first));
  return new Date(second);
}

/** "YYYY-MM-DD" + n days, on the calendar (no timezone involved). */
export function addCalendarDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/**
 * The half-open UTC window `[start, end)` covering local calendar dates
 * `from` through `to` inclusive in `timeZone`.
 *
 * Half-open on purpose: `end` is the next local midnight, so filter with
 * `.gte(col, start).lt(col, end)`. The old `T23:59:59` upper bound also
 * dropped the final second of every day.
 */
export function zonedDayRangeUtc(
  from: string,
  to: string,
  timeZone: string,
): { startIso: string; endIso: string } {
  return {
    startIso: zonedMidnightUtc(from, timeZone).toISOString(),
    endIso: zonedMidnightUtc(addCalendarDays(to, 1), timeZone).toISOString(),
  };
}

/** The browser's own IANA zone, or UTC when it cannot be read. */
export function browserTimeZone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isValidTimeZone(tz) ? tz : "UTC";
  } catch {
    return "UTC";
  }
}
