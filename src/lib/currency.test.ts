import { describe, expect, it } from "vitest";
import { collectFxPairs, sumNormalizedCents, usdCentsForRow } from "./currency";

describe("collectFxPairs", () => {
  it("collects only distinct non-USD (currency, date) pairs", () => {
    const rows = [
      { cents: 100, original_currency: "USD", activity_date: "2026-01-01" },
      { cents: 200, original_currency: "CAD", activity_date: "2026-01-01" },
      { cents: 300, original_currency: "CAD", activity_date: "2026-01-01" },
      { cents: 400, original_currency: "EUR", activity_date: "2026-01-02" },
    ];
    const pairs = collectFxPairs(
      rows,
      (r) => r.original_currency,
      (r) => r.activity_date,
    );
    expect(pairs).toEqual([
      { currency: "CAD", date: "2026-01-01" },
      { currency: "EUR", date: "2026-01-02" },
    ]);
  });

  it("skips rows with no date (can't be resolved to a historical rate)", () => {
    const rows = [{ cents: 100, original_currency: "CAD", activity_date: null }];
    const pairs = collectFxPairs(
      rows,
      (r) => r.original_currency,
      (r) => r.activity_date,
    );
    expect(pairs).toEqual([]);
  });
});

describe("sumNormalizedCents", () => {
  it("sums same-currency (USD) rows without needing any rate", () => {
    const rows = [
      { cents: 1000, currency: "USD", date: "2026-01-01" },
      { cents: 2500, currency: "USD", date: "2026-01-02" },
    ];
    const result = sumNormalizedCents(
      rows,
      (r) => r.cents,
      (r) => r.currency,
      (r) => r.date,
      {},
    );
    expect(result).toEqual({
      usdCents: 3500,
      excludedCents: 0,
      incompleteCount: 0,
      isComplete: true,
    });
  });

  it("converts a resolvable non-USD row to USD cents before summing (never treats it as USD 1:1)", () => {
    const rows = [
      { cents: 1000, currency: "USD", date: "2026-01-01" },
      // 500 CAD at a USD->CAD rate of 1.25 => 500/1.25 = 400 USD cents.
      { cents: 500, currency: "CAD", date: "2026-01-01" },
    ];
    const result = sumNormalizedCents(
      rows,
      (r) => r.cents,
      (r) => r.currency,
      (r) => r.date,
      { "CAD|2026-01-01": { rate: 1.25 } },
    );
    expect(result.usdCents).toBe(1400);
    expect(result.isComplete).toBe(true);
    expect(result.excludedCents).toBe(0);
  });

  it("excludes a row whose currency/date has no resolvable rate — never guesses, never folds it into the USD total", () => {
    const rows = [
      { cents: 1000, currency: "USD", date: "2026-01-01" },
      { cents: 700, currency: "GBP", date: "2026-01-01" },
    ];
    const result = sumNormalizedCents(
      rows,
      (r) => r.cents,
      (r) => r.currency,
      (r) => r.date,
      {}, // no rate available for GBP
    );
    expect(result.usdCents).toBe(1000);
    expect(result.excludedCents).toBe(700);
    expect(result.incompleteCount).toBe(1);
    expect(result.isComplete).toBe(false);
  });

  it("excludes a row when the resolved rate is explicitly null (a real 'unavailable' answer, not a missing key)", () => {
    const rows = [{ cents: 500, currency: "EUR", date: "2026-01-01" }];
    const result = sumNormalizedCents(
      rows,
      (r) => r.cents,
      (r) => r.currency,
      (r) => r.date,
      { "EUR|2026-01-01": null },
    );
    expect(result.usdCents).toBe(0);
    expect(result.excludedCents).toBe(500);
    expect(result.isComplete).toBe(false);
  });

  it("treats a missing/undefined currency as USD (default), not as excluded", () => {
    const rows = [{ cents: 900, currency: undefined, date: "2026-01-01" }];
    const result = sumNormalizedCents(
      rows,
      (r) => r.cents,
      (r) => r.currency,
      (r) => r.date,
      {},
    );
    expect(result.usdCents).toBe(900);
    expect(result.isComplete).toBe(true);
  });

  it("ignores zero/falsy cents rows entirely (no phantom exclusion for a $0 non-USD row)", () => {
    const rows = [{ cents: 0, currency: "CAD", date: "2026-01-01" }];
    const result = sumNormalizedCents(
      rows,
      (r) => r.cents,
      (r) => r.currency,
      (r) => r.date,
      {},
    );
    expect(result.usdCents).toBe(0);
    expect(result.incompleteCount).toBe(0);
    expect(result.isComplete).toBe(true);
  });
});

// Per-row counterpart used for grouped/bucketed aggregation (per-rep
// leaderboards, per-day chart series, per-call lookup maps) — dashboard.tsx,
// attribution.tsx, content.tsx, team.tsx, traffic.tsx, live-ticker.tsx,
// leads.tsx, vsl.functions.ts (docs/ascendos-currency-mixing-audit.md).
describe("usdCentsForRow", () => {
  it("USD-only row: returns the cents unchanged, never excluded", () => {
    expect(usdCentsForRow(150000, "USD", "2026-01-01", {})).toEqual({
      usd: 150000,
      excluded: false,
    });
  });

  it("mixed USD + CAD, resolvable rate: converts the CAD row correctly", () => {
    // 500 CAD cents at a USD->CAD rate of 1.25 => 400 USD cents.
    expect(usdCentsForRow(500, "CAD", "2026-01-01", { "CAD|2026-01-01": { rate: 1.25 } })).toEqual({
      usd: 400,
      excluded: false,
    });
  });

  it("mixed USD + EUR, resolvable rate: same conversion rule applies", () => {
    // 900 EUR cents at a USD->EUR rate of 0.9 => 1000 USD cents.
    expect(usdCentsForRow(900, "EUR", "2026-01-01", { "EUR|2026-01-01": { rate: 0.9 } })).toEqual({
      usd: 1000,
      excluded: false,
    });
  });

  it("missing FX rate: excluded, contributes 0 — never guessed as USD 1:1", () => {
    expect(usdCentsForRow(700, "GBP", "2026-01-01", {})).toEqual({ usd: 0, excluded: true });
  });

  it("explicitly null rate (a real 'unavailable' answer): also excluded, not a crash", () => {
    expect(usdCentsForRow(500, "EUR", "2026-01-01", { "EUR|2026-01-01": null })).toEqual({
      usd: 0,
      excluded: true,
    });
  });

  it("no double conversion: converting an already-USD amount through the same rates map twice yields the same value", () => {
    const rates = { "CAD|2026-01-01": { rate: 1.25 } };
    const first = usdCentsForRow(500, "CAD", "2026-01-01", rates);
    // Feeding the ALREADY-CONVERTED USD amount back through as a USD row
    // (the shape every downstream consumer in this codebase uses — normalize
    // once, then treat the result as plain USD cents) must not convert it
    // again just because a CAD rate happens to exist in the same map.
    const second = usdCentsForRow(first.usd, "USD", "2026-01-01", rates);
    expect(second).toEqual({ usd: first.usd, excluded: false });
  });

  it("prior-period comparison: two independent windows normalize against their own dates without cross-contaminating each other's totals", () => {
    // Same currency, different historical rate on each date — exactly the
    // curr/prev shape dashboard.tsx's fetchPeriod() and
    // weekly-report.server.ts's buildWeeklyReport() both compute.
    const rates = {
      "CAD|2026-09-01": { rate: 1.3 }, // this period
      "CAD|2026-08-01": { rate: 1.4 }, // prior period
    };
    const currRow = usdCentsForRow(1300, "CAD", "2026-09-01", rates);
    const prevRow = usdCentsForRow(1400, "CAD", "2026-08-01", rates);
    expect(currRow.usd).toBe(1000); // 1300 / 1.3
    expect(prevRow.usd).toBe(1000); // 1400 / 1.4
    // Each row resolves independently — using the wrong period's rate would
    // have produced a different (wrong) number for one of them.
  });

  it("date-bucket aggregation: each day's rows resolve against their own day's rate, not a single window-wide rate", () => {
    const rates = {
      "CAD|2026-09-01": { rate: 1.2 },
      "CAD|2026-09-02": { rate: 1.5 },
    };
    const buckets = new Map<string, number>();
    const rows = [
      { day: "2026-09-01", cents: 1200, currency: "CAD" },
      { day: "2026-09-02", cents: 1500, currency: "CAD" },
    ];
    for (const r of rows) {
      const { usd } = usdCentsForRow(r.cents, r.currency, r.day, rates);
      buckets.set(r.day, (buckets.get(r.day) ?? 0) + usd);
    }
    expect(buckets.get("2026-09-01")).toBe(1000); // 1200 / 1.2
    expect(buckets.get("2026-09-02")).toBe(1000); // 1500 / 1.5
  });
});
