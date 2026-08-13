/**
 * A client is at-risk purely on renewal-date proximity. `health_score` is a
 * dead DB column — `default 100` at creation (supabase/migrations/
 * 20260518151934...sql:98), never computed or written by any app code, no
 * edit UI anywhere — and is no longer read here. Previously this exact
 * `health_score < 50` check was duplicated verbatim in two files
 * (clients.tsx, weekly-report.functions.ts); this is the one definition.
 * See the Content Signals / Bottleneck Engine de-fabrication plan, Part 4,
 * and feedback_dont_relocate_fabrication (a manual health-score entry field
 * was explicitly considered and rejected — it would relocate the
 * fabrication to a human, not fix it).
 */

/** Calendar-day difference, not a raw-instant one — `date` is a bare
 * YYYY-MM-DD; parsing it plain reads it as UTC midnight, which can shift by
 * a day in negative-UTC-offset timezones once diffed against a local `now`.
 * Appending T00:00:00 parses it as local midnight, compared against local
 * midnight today (not the current instant) so the count doesn't creep down
 * as the day goes on. */
export function daysUntilDate(date: string | null | undefined, now: Date = new Date()): number | null {
  if (!date) return null;
  const target = new Date(`${date}T00:00:00`).getTime();
  const todayLocalMidnight = new Date(now.toDateString()).getTime();
  return Math.round((target - todayLocalMidnight) / 86400e3);
}

export type ClientRiskInput = {
  renewal_date: string | null;
  renewal_conv_started: boolean | null;
};

/** Returns a human-readable at-risk reason, or null if the client isn't
 * flagged. `atRiskDays` is the workspace's configured renewalAtRiskDays
 * setting (Settings → Content Engine & Alerts → Clients). */
export function clientAtRiskReason(c: ClientRiskInput, atRiskDays: number, now: Date = new Date()): string | null {
  const days = daysUntilDate(c.renewal_date, now);
  if (days === null) return null;
  if (days < 0) return `renewal ${Math.abs(days)}d overdue`;
  if (days < atRiskDays && !c.renewal_conv_started) return `renewal in ${days}d, no convo`;
  return null;
}
