import { useQuery } from "@tanstack/react-query";
import { useDisplayCurrency } from "@/hooks/use-display-currency";
import { getDisplayFxRatesFn } from "@/lib/fx.functions";
import { formatCurrency } from "@/lib/currency";

/**
 * money(usdCents) formatter bound to the global display-currency selection.
 * Drop-in replacement for the local `money`/`fmt`-for-dollars helpers each
 * dashboard used to define — same signature, so call sites don't change.
 * Values are always stored/computed in USD cents; this only converts for
 * display, using real cached FX rates (never a fabricated one). When a rate
 * isn't available yet, it renders the USD amount with an honest note rather
 * than a wrong number.
 */
export function useMoney() {
  const { currency } = useDisplayCurrency();
  const { data } = useQuery({
    queryKey: ["fx-display-rates"],
    queryFn: () => getDisplayFxRatesFn(),
    staleTime: 1000 * 60 * 60 * 6,
    enabled: currency !== "USD",
  });

  return (usdCents: number) => {
    const cents = usdCents ?? 0;
    if (currency === "USD") return formatCurrency(cents, "USD");
    const info = data?.rates?.[currency as "CAD" | "EUR" | "GBP"];
    if (!info) return `${formatCurrency(cents, "USD")} · FX unavailable`;
    return formatCurrency(Math.round(cents * info.rate), currency);
  };
}
