import { supabaseAdmin } from "@/integrations/supabase/client.server";

// fx_rates is a new table (supabase/migrations/20260907100000_currency_fx_foundation.sql)
// not yet reflected in the generated supabase types — same `as any` convention
// used elsewhere in this repo for tables ahead of a fresh `supabase gen types` run.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- fx_rates isn't in generated Supabase types yet (added post-typegen), same convention used elsewhere in this repo for pre-typegen tables.
const fxRatesTable = () => (supabaseAdmin as any).from("fx_rates");

export const DISPLAY_QUOTE_CURRENCIES = ["CAD", "EUR", "GBP"] as const;
export type DisplayQuoteCurrency = (typeof DISPLAY_QUOTE_CURRENCIES)[number];

export type FxRateInfo = { rate: number; date: string; source: string };

/**
 * Today's USD -> {CAD,EUR,GBP} display rates. Reads the cache first; on a
 * miss, fetches once from Frankfurter (free, no key, ECB reference rates)
 * and upserts. Never fabricates a rate — a currency missing from the
 * returned map means "unavailable," not zero/guessed.
 */
export async function getDisplayFxRates(): Promise<
  Record<DisplayQuoteCurrency, FxRateInfo | null>
> {
  const today = new Date().toISOString().slice(0, 10);
  const result: Record<string, FxRateInfo | null> = { CAD: null, EUR: null, GBP: null };

  // Cache read is best-effort: a failure (unreachable DB, table not migrated
  // yet) falls straight through to the live Frankfurter fetch below rather
  // than surfacing as an error — a slow/broken cache must never block a
  // real rate that's otherwise available.
  const { data: cached, error: cacheError } = await fxRatesTable()
    .select("quote_currency, rate, rate_date, source")
    .eq("base_currency", "USD")
    .eq("rate_date", today)
    .in("quote_currency", DISPLAY_QUOTE_CURRENCIES as unknown as string[]);
  if (cacheError) console.error("[fx] cache read failed (non-fatal):", cacheError.message);

  for (const row of cached ?? []) {
    result[row.quote_currency] = {
      rate: Number(row.rate),
      date: row.rate_date,
      source: row.source,
    };
  }

  const missing = DISPLAY_QUOTE_CURRENCIES.filter((c) => !result[c]);
  if (missing.length === 0) return result as Record<DisplayQuoteCurrency, FxRateInfo | null>;

  try {
    const res = await fetch(`https://api.frankfurter.app/latest?from=USD&to=${missing.join(",")}`);
    if (!res.ok) return result as Record<DisplayQuoteCurrency, FxRateInfo | null>;
    const body = (await res.json()) as { date: string; rates: Record<string, number> };
    const rows = Object.entries(body.rates).map(([quote_currency, rate]) => ({
      base_currency: "USD",
      quote_currency,
      rate,
      rate_date: body.date,
      source: "frankfurter",
    }));
    if (rows.length > 0) {
      // Best-effort cache write — a failure here (e.g. the cache table
      // unreachable) must not block returning the real rate we already have.
      const { error: upsertError } = await fxRatesTable().upsert(rows, {
        onConflict: "base_currency,quote_currency,rate_date",
      });
      if (upsertError) console.error("[fx] cache upsert failed (non-fatal):", upsertError.message);
    }
    for (const row of rows) {
      result[row.quote_currency] = { rate: row.rate, date: row.rate_date, source: row.source };
    }
  } catch (e) {
    console.error("[fx] Frankfurter fetch failed:", e);
    // Network/provider failure — leave missing entries null ("unavailable"),
    // never invent a rate.
  }

  return result as Record<DisplayQuoteCurrency, FxRateInfo | null>;
}

/**
 * Historical USD -> quote rate for a specific transaction date (used to
 * normalize a non-USD payment at capture time, not for today's display
 * toggle). Prefers the cache, falls back to Frankfurter's historical
 * endpoint, and returns null rather than guessing if both fail.
 */
export async function getHistoricalFxRate(
  quoteCurrency: string,
  isoDate: string,
): Promise<FxRateInfo | null> {
  const { data: cached } = await fxRatesTable()
    .select("rate, rate_date, source")
    .eq("base_currency", "USD")
    .eq("quote_currency", quoteCurrency)
    .eq("rate_date", isoDate)
    .maybeSingle();
  if (cached) return { rate: Number(cached.rate), date: cached.rate_date, source: cached.source };

  try {
    const res = await fetch(`https://api.frankfurter.app/${isoDate}?from=USD&to=${quoteCurrency}`);
    if (!res.ok) return null;
    const body = (await res.json()) as { date: string; rates: Record<string, number> };
    const rate = body.rates?.[quoteCurrency];
    if (typeof rate !== "number") return null;
    await fxRatesTable().upsert(
      {
        base_currency: "USD",
        quote_currency: quoteCurrency,
        rate,
        rate_date: body.date,
        source: "frankfurter",
      },
      { onConflict: "base_currency,quote_currency,rate_date" },
    );
    return { rate, date: body.date, source: "frankfurter" };
  } catch {
    return null;
  }
}

export type NormalizedPaymentAmount = {
  /** Always the canonical USD figure — this is what payments.amount_cents/
   * currency must be written as, per the contract stated in
   * 20260907100000_currency_fx_foundation.sql's own comment ("payments.
   * amount_cents/currency keep their current meaning (canonical USD)"). */
  amountCents: number;
  currency: "USD";
  fxRate: number;
  fxRateDate: string;
  fxSource: string;
  /** True only when a real conversion could not be resolved — amountCents
   * falls back to the raw native-currency figure in this case (never
   * silently guessed as a 1:1 USD conversion), and the row must be treated
   * as needing reconciliation once a rate becomes available. */
  unresolved: boolean;
};

/**
 * Remediation (currency-mixing audit, docs/ascendos-currency-mixing-audit.md
 * — "Remaining currency risks"): every real payment-processor webhook
 * (stripe.ts/paypal.ts/fanbasis.ts/wise.ts/whop.ts) inserted
 * `original_currency`/`fx_rate:1` as pure provenance tags while leaving
 * `amount_cents`/`currency` as the RAW native-currency figure — directly
 * violating this table's own migration comment, which says amount_cents/
 * currency must always be canonical USD. This is the one shared conversion
 * step every webhook should call before its `.insert()`, using
 * `getHistoricalFxRate` — already built and already documented ("used to
 * normalize a non-USD payment at capture time") but never wired up until
 * now. `collectedAtISO` should be the processor's own real collection
 * timestamp, not "today" — a delayed/replayed webhook must convert at the
 * rate that applied when the money actually moved, not when the webhook
 * happened to be (re)processed.
 */
export async function normalizePaymentToUsd(
  originalAmountCents: number,
  originalCurrency: string,
  collectedAtISO: string,
  // Injectable for tests (same dependency-injection convention
  // content-signals.server.ts uses by taking `sb` as a parameter) — real
  // callers never pass this, defaulting to the live getHistoricalFxRate.
  fetchRate: (
    quoteCurrency: string,
    isoDate: string,
  ) => Promise<FxRateInfo | null> = getHistoricalFxRate,
): Promise<NormalizedPaymentAmount> {
  const currency = originalCurrency.toUpperCase();
  const collectedDate = (collectedAtISO || new Date().toISOString()).slice(0, 10);
  if (currency === "USD") {
    return {
      amountCents: originalAmountCents,
      currency: "USD",
      fxRate: 1,
      fxRateDate: collectedDate,
      fxSource: "identity",
      unresolved: false,
    };
  }
  const info = await fetchRate(currency, collectedDate);
  if (info && Number.isFinite(info.rate) && info.rate > 0) {
    return {
      // getHistoricalFxRate returns USD->quote rates: quote-currency cents /
      // rate = USD cents (same convention sumNormalizedCents/usdCentsForRow
      // already use elsewhere in this app).
      amountCents: Math.round(originalAmountCents / info.rate),
      currency: "USD",
      fxRate: info.rate,
      fxRateDate: info.date,
      fxSource: info.source,
      unresolved: false,
    };
  }
  // Never guess: a payment that genuinely happened must still be recorded
  // (a webhook can't just drop real money off the ledger), but it must not
  // silently claim a false 1:1 USD conversion either. amount_cents/currency
  // stay in the native currency here — a real, honest deviation from the
  // "always USD" contract, deliberately marked via fx_source='unavailable'
  // (distinct from 'identity', which means it really was USD) so these rows
  // are greppable for reconciliation once a rate can be resolved. Logged
  // (not just silently returned) so a real payment landing un-normalized is
  // actually visible somewhere, not just a queryable-if-you-know-to-look row.
  console.error(
    `[fx] could not resolve a ${currency}->USD rate for ${collectedDate} — payment recorded in its native currency (fx_source='unavailable'), needs reconciliation once a rate is available`,
  );
  return {
    amountCents: originalAmountCents,
    currency: currency as "USD", // see `unresolved: true` — not actually USD; callers must check this flag
    fxRate: 1,
    fxRateDate: collectedDate,
    fxSource: "unavailable",
    unresolved: true,
  };
}
