import { useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getHistoricalFxRatesFn } from "@/lib/fx.functions";
import { collectFxPairs, type HistoricalFxRateMap } from "@/lib/currency";

/**
 * Thin, reusable wrapper around the currency-normalization infrastructure
 * already proven on `_authenticated.closer.tsx` (Phase 1) and
 * `weekly-report.server.ts` (Prompt 13) — not a second normalization system,
 * just removing the need to hand-copy the same
 * collectFxPairs/useServerFn/useQuery boilerplate into every client route
 * that also needs to normalize `calls`/`setter_activity` cash fields before
 * summing them. Server-side (`.server.ts`) files should keep calling
 * `getHistoricalFxRate` directly (as `weekly-report.server.ts` does) rather
 * than use this — this hook exists for client components only.
 *
 * Pass every row group that carries `original_currency` + a date; the
 * returned map covers every distinct non-USD (currency, date) pair across
 * all of them in one request, ready to pass into `sumNormalizedCents()`.
 */
type FxRowGroup<T> = {
  rows: T[];
  getCurrency: (r: T) => string | null | undefined;
  getDate: (r: T) => string | null | undefined;
};

// `any` below: each group can carry a different row shape (calls vs
// setter_activity); the group's own callbacks stay correctly typed to that
// group's T at every real call site, this signature just can't name every
// possible T in one variadic list.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useFxRates(...groups: FxRowGroup<any>[]): HistoricalFxRateMap {
  const getFxFn = useServerFn(getHistoricalFxRatesFn);

  const pairs = useMemo(() => {
    const dedupe = new Map<string, { currency: string; date: string }>();
    for (const g of groups) {
      for (const p of collectFxPairs(g.rows, g.getCurrency, g.getDate)) {
        dedupe.set(`${p.currency}|${p.date}`, p);
      }
    }
    return Array.from(dedupe.values());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups.map((g) => g.rows.length).join(","), groups.length]);

  const { data } = useQuery({
    queryKey: ["fx-rates", pairs.map((p) => `${p.currency}|${p.date}`).join(",")],
    enabled: pairs.length > 0,
    staleTime: 1000 * 60 * 60,
    queryFn: () => getFxFn({ data: { pairs } }),
  });

  return data?.rates ?? {};
}

/** Non-hook version for use inside a plain async function (e.g. a module-level
 * data-fetching function called from within a `useQuery` `queryFn`, which
 * cannot itself call hooks) — takes the already-bound server-fn reference
 * (obtained via `useServerFn(getHistoricalFxRatesFn)` at the component level)
 * and resolves rates directly, no React Query cache layer. Same underlying
 * infrastructure, just callable outside render. */
export async function fetchFxRates(
  fxFn: (opts: {
    data: { pairs: { currency: string; date: string }[] };
  }) => Promise<{ rates: HistoricalFxRateMap }>,
  // Same heterogeneous-groups reasoning as useFxRates' `any` above.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ...groups: FxRowGroup<any>[]
): Promise<HistoricalFxRateMap> {
  const dedupe = new Map<string, { currency: string; date: string }>();
  for (const g of groups) {
    for (const p of collectFxPairs(g.rows, g.getCurrency, g.getDate)) {
      dedupe.set(`${p.currency}|${p.date}`, p);
    }
  }
  const pairs = Array.from(dedupe.values());
  if (pairs.length === 0) return {};
  const { rates } = await fxFn({ data: { pairs } });
  return rates;
}
