import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Today's USD -> CAD/EUR/GBP display rates, real-source (Frankfurter), cached
 * daily. Deliberately NOT gated behind requireSupabaseAuth: these are global
 * reference rates (not org- or user-scoped, computed via the service-role
 * client), so there's no identity this handler needs from the caller — and
 * gating a non-sensitive read behind auth was the actual cause of "FX
 * unavailable" persisting for real logged-in sessions (a 401 on this call
 * before/without a fully attached session token), not a genuine missing-rate
 * case.
 */
export const getDisplayFxRatesFn = createServerFn({ method: "GET" }).handler(async () => {
  const { getDisplayFxRates } = await import("./fx.server");
  return { rates: await getDisplayFxRates(), fetchedAt: new Date().toISOString() };
});

/**
 * Historical USD<-quote rates for a batch of (currency, date) pairs — used
 * to normalize non-USD `original_currency` rows (setter_activity/calls
 * money columns, which store the amount exactly as entered, unconverted —
 * see 20260912090000_eod_original_currency.sql) into canonical USD cents
 * BEFORE aggregation, reusing the same real fx_rates cache/Frankfurter
 * source as the display-currency toggle. Same not-auth-gated rationale as
 * getDisplayFxRatesFn — global reference data. A pair with no resolvable
 * rate comes back `null` in the map (never a fabricated 1:1 guess); callers
 * must treat that as "exclude from the normalized total, surface as
 * incomplete," never as "treat as USD."
 */
export const getHistoricalFxRatesFn = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        pairs: z.array(z.object({ currency: z.string().min(1), date: z.string().min(1) })).max(200),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { getHistoricalFxRate } = await import("./fx.server");
    const uniqueKeys = Array.from(
      new Set(data.pairs.map((p) => `${p.currency.toUpperCase()}|${p.date}`)),
    );
    const entries = await Promise.all(
      uniqueKeys.map(async (key) => {
        const [currency, date] = key.split("|");
        if (currency === "USD") return [key, { rate: 1, date, source: "identity" }] as const;
        const info = await getHistoricalFxRate(currency, date);
        return [key, info] as const;
      }),
    );
    return {
      rates: Object.fromEntries(entries) as Record<
        string,
        { rate: number; date: string; source: string } | null
      >,
    };
  });
