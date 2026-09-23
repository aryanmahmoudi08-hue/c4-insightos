export type DisplayCurrency = "USD" | "CAD" | "EUR" | "GBP";
export const DISPLAY_CURRENCIES: DisplayCurrency[] = ["USD", "CAD", "EUR", "GBP"];

/** Canonical money formatter — cents in the given currency, no decimals, e.g. "$1,234" / "€1,234". */
export function formatCurrency(cents: number, currency: DisplayCurrency): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format((cents ?? 0) / 100);
}

/**
 * Remediation (metric-dictionary audit): setter_activity/calls money columns
 * (cash_collected_cents, total_revenue_cents, contract_value_cents,
 * deposit_cents) store whatever amount was typed in, tagged with a real
 * `original_currency` but never converted (see
 * 20260912090000_eod_original_currency.sql) — unlike `payments`, which
 * normalizes to USD at capture time. Summing these raw cents across rows
 * with different original_currency values silently treats e.g. 500 CAD as
 * 500 USD. This helper converts each row to USD cents using a historical
 * USD->quote rate (from getHistoricalFxRatesFn, keyed "CURRENCY|date") BEFORE
 * summing, and never guesses a rate: a row whose currency/date has no
 * resolvable rate is excluded from `usdCents` and counted in
 * `incompleteCount`/`excludedCents` instead — callers must surface that as
 * an honest "incomplete" signal, never fold it into the total as if it were
 * USD or zero.
 */
export type HistoricalFxRateMap = Record<string, { rate: number } | null | undefined>;

const fxKey = (currency: string, date: string) => `${currency.toUpperCase()}|${date}`;

/** Every distinct non-USD (currency, date) pair present in `rows`, ready to pass to getHistoricalFxRatesFn. */
export function collectFxPairs<T>(
  rows: T[],
  getCurrency: (r: T) => string | null | undefined,
  getDate: (r: T) => string | null | undefined,
): { currency: string; date: string }[] {
  const seen = new Set<string>();
  const pairs: { currency: string; date: string }[] = [];
  for (const r of rows) {
    const currency = (getCurrency(r) || "USD").toUpperCase();
    if (currency === "USD") continue;
    const date = getDate(r);
    if (!date) continue;
    const key = fxKey(currency, date);
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push({ currency, date });
  }
  return pairs;
}

export type NormalizedCentsSum = {
  /** Sum of every row that could be reliably converted to USD cents (USD rows plus resolvable non-USD rows). */
  usdCents: number;
  /** Sum (in each row's OWN original currency's cents — not directly comparable across rows) of rows that could NOT be converted. Never fold this into usdCents. */
  excludedCents: number;
  /** How many rows were excluded for lack of a resolvable rate. */
  incompleteCount: number;
  /** True only when every non-zero row was either USD or successfully converted. */
  isComplete: boolean;
};

/** Sums `getCents(row)` across `rows`, converting each non-USD row to USD cents via `rates` (from getHistoricalFxRatesFn) before summing. Never fabricates a rate for a missing pair. */
export function sumNormalizedCents<T>(
  rows: T[],
  getCents: (r: T) => number | null | undefined,
  getCurrency: (r: T) => string | null | undefined,
  getDate: (r: T) => string | null | undefined,
  rates: HistoricalFxRateMap,
): NormalizedCentsSum {
  let usdCents = 0;
  let excludedCents = 0;
  let incompleteCount = 0;
  for (const r of rows) {
    const cents = Number(getCents(r) ?? 0) || 0;
    if (!cents) continue;
    const currency = (getCurrency(r) || "USD").toUpperCase();
    if (currency === "USD") {
      usdCents += cents;
      continue;
    }
    const date = getDate(r);
    const info = date ? rates[fxKey(currency, date)] : null;
    if (info && Number.isFinite(info.rate) && info.rate > 0) {
      // getHistoricalFxRatesFn returns USD->quote rates: quote-currency cents / rate = USD cents.
      usdCents += Math.round(cents / info.rate);
      continue;
    }
    excludedCents += cents;
    incompleteCount += 1;
  }
  return { usdCents, excludedCents, incompleteCount, isComplete: incompleteCount === 0 };
}

export type NormalizedRowCents = { usd: number; excluded: boolean };

/** Per-row counterpart to `sumNormalizedCents` — for grouped/bucketed
 * aggregation (per-rep leaderboards, per-day chart series, per-call lookup
 * maps) where rows need to land in different buckets rather than one total.
 * Same exclude-don't-guess rule: a row whose currency/date has no resolvable
 * rate contributes 0 and reports `excluded: true`, never treated as USD. */
export function usdCentsForRow(
  cents: number | null | undefined,
  currency: string | null | undefined,
  date: string | null | undefined,
  rates: HistoricalFxRateMap,
): NormalizedRowCents {
  const c = Number(cents ?? 0) || 0;
  if (!c) return { usd: 0, excluded: false };
  const cur = (currency || "USD").toUpperCase();
  if (cur === "USD") return { usd: c, excluded: false };
  const info = date ? rates[fxKey(cur, date)] : null;
  if (info && Number.isFinite(info.rate) && info.rate > 0) {
    return { usd: Math.round(c / info.rate), excluded: false };
  }
  return { usd: 0, excluded: true };
}
