import { describe, expect, it } from "vitest";
import { normalizePaymentToUsd, type FxRateInfo } from "./fx.server";

/** Real callers never pass a rate-fetcher — this stands in for
 * `getHistoricalFxRate` (network + DB, not worth mocking at the module level
 * — see the DI note on `normalizePaymentToUsd` itself) so these tests stay
 * deterministic and offline. */
function fakeFetchRate(rates: Record<string, FxRateInfo | null>) {
  return async (quoteCurrency: string, isoDate: string): Promise<FxRateInfo | null> => {
    return rates[`${quoteCurrency}|${isoDate}`] ?? null;
  };
}

// Remediation (currency-mixing audit, "Remaining currency risks" —
// docs/ascendos-currency-mixing-remediation.md): every payment webhook
// (stripe/paypal/fanbasis/wise/whop) previously wrote amount_cents/currency
// as the RAW native-currency figure while hardcoding fx_rate:1 — directly
// violating this table's own contract ("amount_cents/currency keep their
// current meaning (canonical USD)", 20260907100000_currency_fx_foundation.sql).
describe("normalizePaymentToUsd", () => {
  it("USD payment: passes through unchanged, fx_source='identity'", async () => {
    const result = await normalizePaymentToUsd(
      150000,
      "USD",
      "2026-09-01T12:00:00Z",
      fakeFetchRate({}),
    );
    expect(result).toEqual({
      amountCents: 150000,
      currency: "USD",
      fxRate: 1,
      fxRateDate: "2026-09-01",
      fxSource: "identity",
      unresolved: false,
    });
  });

  it("USD is case-insensitive (lowercase 'usd' from a processor payload)", async () => {
    const result = await normalizePaymentToUsd(
      50000,
      "usd",
      "2026-09-01T00:00:00Z",
      fakeFetchRate({}),
    );
    expect(result.fxSource).toBe("identity");
    expect(result.amountCents).toBe(50000);
  });

  it("mixed currency (CAD), resolvable rate: converts to USD and marks the real rate/source, never 1:1", async () => {
    // 500 CAD cents at a USD->CAD rate of 1.25 => 400 USD cents.
    const fetchRate = fakeFetchRate({
      "CAD|2026-09-01": { rate: 1.25, date: "2026-09-01", source: "frankfurter" },
    });
    const result = await normalizePaymentToUsd(500, "CAD", "2026-09-01T08:00:00Z", fetchRate);
    expect(result).toEqual({
      amountCents: 400,
      currency: "USD",
      fxRate: 1.25,
      fxRateDate: "2026-09-01",
      fxSource: "frankfurter",
      unresolved: false,
    });
  });

  it("mixed currency (EUR), resolvable rate: same conversion rule applies", async () => {
    // 900 EUR cents at a USD->EUR rate of 0.9 => 1000 USD cents.
    const fetchRate = fakeFetchRate({
      "EUR|2026-09-01": { rate: 0.9, date: "2026-09-01", source: "frankfurter" },
    });
    const result = await normalizePaymentToUsd(900, "EUR", "2026-09-01T08:00:00Z", fetchRate);
    expect(result.amountCents).toBe(1000);
    expect(result.currency).toBe("USD");
  });

  it("uses the payment's real collection date for the rate lookup, not today — a delayed webhook must convert at the historical rate", async () => {
    const fetchRate = fakeFetchRate({
      "CAD|2026-08-15": { rate: 1.4, date: "2026-08-15", source: "frankfurter" },
      // A different (wrong) rate for "today" — proves the function used the
      // payment's own date, not whatever day the test happens to run.
      "CAD|2099-01-01": { rate: 999, date: "2099-01-01", source: "frankfurter" },
    });
    const result = await normalizePaymentToUsd(1400, "CAD", "2026-08-15T10:00:00Z", fetchRate);
    expect(result.fxRateDate).toBe("2026-08-15");
    expect(result.amountCents).toBe(1000); // 1400 / 1.4, not 1400 / 999
  });

  it("missing FX rate: never guesses a 1:1 USD conversion — keeps the native currency/amount, flags unresolved and fx_source='unavailable'", async () => {
    const result = await normalizePaymentToUsd(
      700,
      "GBP",
      "2026-09-01T00:00:00Z",
      fakeFetchRate({}), // no rate available
    );
    expect(result.unresolved).toBe(true);
    expect(result.fxSource).toBe("unavailable");
    // Native amount/currency preserved — never silently treated as 700 USD cents.
    expect(result.amountCents).toBe(700);
    expect(result.currency).toBe("GBP");
  });

  it("explicitly null rate from the fetcher (a real 'unavailable' answer): same honest fallback, not a crash", async () => {
    const fetchRate = fakeFetchRate({ "EUR|2026-09-01": null });
    const result = await normalizePaymentToUsd(500, "EUR", "2026-09-01T00:00:00Z", fetchRate);
    expect(result.unresolved).toBe(true);
    expect(result.amountCents).toBe(500);
    expect(result.currency).toBe("EUR");
  });

  it("no double conversion: an already-USD payment is never run through a rate lookup even when one exists for that date", async () => {
    let called = false;
    const fetchRate = async () => {
      called = true;
      return { rate: 1.25, date: "2026-09-01", source: "frankfurter" };
    };
    await normalizePaymentToUsd(100000, "USD", "2026-09-01T00:00:00Z", fetchRate);
    expect(called).toBe(false);
  });
});
