export type DateRange = { from: string; to: string; label: string };

export type RangeKey = "today" | "yesterday" | "last7" | "last30" | "mtd" | "all";

/** The label stored on a range, and the only thing that identifies which
 *  preset produced it — `use-date-range` round-trips these through
 *  localStorage, so they are persisted values, not display strings to edit
 *  freely. Renaming one orphans every stored range carrying the old name
 *  (normalizeStoredRange falls back to the default for an unknown label). */
export const RANGE_LABELS: Record<RangeKey, string> = {
  today: "Today",
  yesterday: "Yesterday",
  last7: "Last 7d",
  last30: "Last 30d",
  mtd: "MTD",
  all: "All time",
};

export const CUSTOM_LABEL = "Custom";

/** Earliest date "All time" reaches back to — before this product existed. */
const EPOCH = "2000-01-01";

type CalendarDay = { y: number; m: number; d: number };

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * The viewer's own calendar date as YYYY-MM-DD.
 *
 * NOT `toISOString().slice(0, 10)`, which is the UTC date. Anywhere west of
 * UTC that silently returns *tomorrow* for most of the evening: at 20:12 in
 * Toronto on 27 Oct it yields 2026-10-28. Every preset here is a statement
 * about the user's own calendar — "today", "this month" — so every one of
 * them has to be built from local parts.
 */
export function localISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Calendar-shift a day by `n` days. Done in UTC deliberately: these are
 *  bare calendar numbers with no time or zone attached, so UTC arithmetic
 *  is pure day counting and cannot be perturbed by a DST transition that
 *  happens to land at local midnight. */
function shiftDays({ y, m, d }: CalendarDay, n: number): string {
  const t = new Date(Date.UTC(y, m, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/**
 * Build a preset range from an explicit calendar day.
 *
 * Split out from `presetRange` so the behaviour is testable without the test
 * runner's own timezone being part of the result.
 */
export function presetRangeFrom(day: CalendarDay, key: RangeKey): DateRange {
  const label = RANGE_LABELS[key];
  const today = shiftDays(day, 0);
  switch (key) {
    case "today":
      return { from: today, to: today, label };
    case "yesterday": {
      const y = shiftDays(day, -1);
      return { from: y, to: y, label };
    }
    case "last7":
      // Inclusive of today, so 7 days total — not today minus 7.
      return { from: shiftDays(day, -6), to: today, label };
    case "last30":
      return { from: shiftDays(day, -29), to: today, label };
    case "mtd":
      return { from: `${day.y}-${pad(day.m + 1)}-01`, to: today, label };
    case "all":
      return { from: EPOCH, to: today, label };
  }
}

export function presetRange(key: RangeKey, now: Date = new Date()): DateRange {
  return presetRangeFrom({ y: now.getFullYear(), m: now.getMonth(), d: now.getDate() }, key);
}

export function rangeKeyForLabel(label: string): RangeKey | null {
  const found = (Object.keys(RANGE_LABELS) as RangeKey[]).find(
    (key) => RANGE_LABELS[key] === label,
  );
  return found ?? null;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Re-resolve a range that came back from storage.
 *
 * A preset is a *rule* ("today"), but what gets persisted is the dates that
 * rule produced at the moment it was clicked. Restoring those verbatim means
 * a tab left open overnight, or reopened the next morning, shows the "Today"
 * chip highlighted over yesterday's numbers — the chip and the data disagree
 * and nothing on screen explains why. So a stored preset is recomputed
 * against the current date and only its label is trusted.
 *
 * A custom range is the opposite: the dates *are* the user's choice, so they
 * are kept exactly, and only sanity-checked.
 */
export function normalizeStoredRange(stored: unknown, now: Date = new Date()): DateRange {
  const fallback = presetRange("last30", now);
  if (!stored || typeof stored !== "object") return fallback;
  const { from, to, label } = stored as Partial<DateRange>;
  if (typeof label !== "string") return fallback;

  const key = rangeKeyForLabel(label);
  if (key) return presetRange(key, now);

  if (label !== CUSTOM_LABEL) return fallback;
  if (typeof from !== "string" || typeof to !== "string") return fallback;
  if (!ISO_DATE.test(from) || !ISO_DATE.test(to)) return fallback;
  // A backwards custom range returns nothing from every query on the page,
  // which reads as "the app is broken" rather than "these dates are wrong".
  return from <= to ? { from, to, label } : { from: to, to: from, label };
}
