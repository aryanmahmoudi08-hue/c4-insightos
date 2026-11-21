import { describe, expect, it } from "vitest";
import { isPifClose, pifRate, type PifCall } from "./pif-rate";

const NOW = "2026-11-20T15:00:00Z";
const close = (over: Partial<PifCall> = {}): PifCall => ({
  closed: true,
  payment_plan: false,
  eod_lead_status: "Closed",
  deposit_cents: 0,
  created_at: NOW,
  ...over,
});

describe("pifRate", () => {
  it("is paid-in-full closes over all closes", () => {
    const r = pifRate([
      close(),
      close(),
      close({ payment_plan: true }),
      close({ eod_lead_status: "Deposit", deposit_cents: 50000 }),
    ]);
    expect(r).toEqual({ pif: 2, closes: 4, unrecorded: 0, pct: 50 });
  });

  it("ignores calls that did not close", () => {
    const r = pifRate([close(), { closed: false, payment_plan: false, created_at: NOW }]);
    expect(r).toMatchObject({ pif: 1, closes: 1, pct: 100 });
  });

  it("does not count a deposit as paid in full, however it was recorded", () => {
    expect(isPifClose(close({ eod_lead_status: "Deposit" }))).toBe(false);
    expect(isPifClose(close({ eod_lead_status: null, deposit_cents: 20000 }))).toBe(false);
  });

  it("leaves out closes logged before the payment-plan question existed", () => {
    const r = pifRate([close(), close({ created_at: "2026-09-01T12:00:00Z" })]);
    expect(r).toEqual({ pif: 1, closes: 1, unrecorded: 1, pct: 100 });
  });

  it("has no rate when nothing closed, rather than 0%", () => {
    expect(pifRate([]).pct).toBeNull();
    expect(pifRate([close({ created_at: "2026-08-01T00:00:00Z" })]).pct).toBeNull();
  });
});
