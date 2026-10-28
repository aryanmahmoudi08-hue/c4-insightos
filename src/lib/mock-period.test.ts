import { describe, expect, it } from "vitest";
import {
  MOCK_BASELINE_DAYS,
  MOCK_MAX_DAYS,
  rangeDays,
  scaleMockPeriod,
  type MockPeriod,
} from "./mock-period";

const BASE: MockPeriod = {
  cash: 4_250_000,
  paymentsCash: 3_000_000,
  callsCash: 1_250_000,
  setterCash: 0,
  newLeads: 46,
  totalCalls: 24,
  showed: 18,
  offers: 14,
  closed: 8,
  contractValue: 9_600_000,
  views: 184_000,
  contentLeads: 22,
};

describe("rangeDays", () => {
  it("counts a single day as one, not zero", () => {
    expect(rangeDays("2026-10-27", "2026-10-27")).toBe(1);
  });

  it("is inclusive of both ends", () => {
    expect(rangeDays("2026-10-21", "2026-10-27")).toBe(7);
    expect(rangeDays("2026-09-28", "2026-10-27")).toBe(30);
  });

  it("flattens a range that reaches back to the epoch", () => {
    expect(rangeDays("2000-01-01", "2026-10-27")).toBe(MOCK_MAX_DAYS);
  });

  it("falls back to the baseline for an unparseable range", () => {
    expect(rangeDays("nope", "2026-10-27")).toBe(MOCK_BASELINE_DAYS);
  });
});

describe("scaleMockPeriod", () => {
  it("is deterministic — the same range always gives the same figures", () => {
    const a = scaleMockPeriod(BASE, "2026-10-01", "2026-10-27");
    const b = scaleMockPeriod(BASE, "2026-10-01", "2026-10-27");
    expect(a).toEqual(b);
  });

  it("gives different figures for different ranges, which is the whole point", () => {
    // The bug this exists to fix: every chip produced the identical object,
    // so the date control looked dead.
    const today = scaleMockPeriod(BASE, "2026-10-27", "2026-10-27");
    const month = scaleMockPeriod(BASE, "2026-09-28", "2026-10-27");
    expect(today.cash).not.toBe(month.cash);
    expect(today.newLeads).not.toBe(month.newLeads);
  });

  it("scales roughly with the length of the range", () => {
    const day = scaleMockPeriod(BASE, "2026-10-27", "2026-10-27");
    const week = scaleMockPeriod(BASE, "2026-10-21", "2026-10-27");
    const month = scaleMockPeriod(BASE, "2026-09-28", "2026-10-27");
    expect(day.cash).toBeLessThan(week.cash);
    expect(week.cash).toBeLessThan(month.cash);
    // A 30-day range lands near the authored baseline, give or take the wobble.
    expect(month.cash).toBeGreaterThan(BASE.cash * 0.85);
    expect(month.cash).toBeLessThan(BASE.cash * 1.15);
  });

  it("keeps the funnel monotonic, so no rate can exceed 100%", () => {
    for (const [from, to] of [
      ["2026-10-27", "2026-10-27"],
      ["2026-10-26", "2026-10-27"],
      ["2026-10-21", "2026-10-27"],
      ["2026-09-28", "2026-10-27"],
      ["2000-01-01", "2026-10-27"],
    ]) {
      const p = scaleMockPeriod(BASE, from, to);
      expect(p.showed).toBeLessThanOrEqual(p.totalCalls);
      expect(p.offers).toBeLessThanOrEqual(p.showed);
      expect(p.closed).toBeLessThanOrEqual(p.offers);
    }
  });

  it("keeps the cash split summing to the headline cash figure", () => {
    for (const [from, to] of [
      ["2026-10-27", "2026-10-27"],
      ["2026-10-21", "2026-10-27"],
      ["2000-01-01", "2026-10-27"],
    ]) {
      const p = scaleMockPeriod(BASE, from, to);
      expect(p.paymentsCash + p.callsCash + p.setterCash).toBe(p.cash);
    }
  });

  it("never goes negative on a one-day range", () => {
    const p = scaleMockPeriod(BASE, "2026-10-27", "2026-10-27");
    for (const value of Object.values(p)) expect(value).toBeGreaterThanOrEqual(0);
  });

  it("survives an all-zero baseline without dividing by zero", () => {
    const zero: MockPeriod = {
      cash: 0,
      paymentsCash: 0,
      callsCash: 0,
      setterCash: 0,
      newLeads: 0,
      totalCalls: 0,
      showed: 0,
      offers: 0,
      closed: 0,
      contractValue: 0,
      views: 0,
      contentLeads: 0,
    };
    const p = scaleMockPeriod(zero, "2026-10-21", "2026-10-27");
    expect(Object.values(p).every((v) => v === 0)).toBe(true);
  });
});
