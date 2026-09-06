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

  const { data: cached } = await fxRatesTable()
    .select("quote_currency, rate, rate_date, source")
    .eq("base_currency", "USD")
    .eq("rate_date", today)
    .in("quote_currency", DISPLAY_QUOTE_CURRENCIES as unknown as string[]);

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
      await fxRatesTable().upsert(rows, { onConflict: "base_currency,quote_currency,rate_date" });
    }
    for (const row of rows) {
      result[row.quote_currency] = { rate: row.rate, date: row.rate_date, source: row.source };
    }
  } catch {
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
