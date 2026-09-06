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
