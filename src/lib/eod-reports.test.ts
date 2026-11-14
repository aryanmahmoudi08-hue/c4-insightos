import { describe, expect, it } from "vitest";
import {
  CLOSER_EOD_SCHEMA,
  DM_SETTER_EOD_SCHEMA,
  INBOUND_DIALER_EOD_SCHEMA,
  buildClosureCallPayload,
  buildSetterActivityPayload,
  eodToday,
} from "./eod-reports";
import { browserTimeZone, localDateIn } from "./zoned-time";
import { tableColumnsFromMigrations } from "./__test-support__/migration-columns";

// Remediation (metric-dictionary audit, SALE-0394): calls.payment_plan must
// be written from explicit closer intent (the new Payment Plan checkbox
// question), never inferred from deposit/installment amounts.
describe("buildClosureCallPayload — payment_plan", () => {
  const baseValues = {
    status: "Closed",
    closer_name: "Jordan",
    lead_email: "lead@example.com",
    date_of_call: "2026-06-01T10:00",
    offer_made: true,
    cash_collected: 500,
    total_revenue: 2000,
    summary: "Closed on the call.",
    recording_url: "https://example.com/rec",
  };

  it("writes payment_plan: true when the checkbox was checked", () => {
    const payload = buildClosureCallPayload("org-1", { ...baseValues, payment_plan: true });
    expect(payload?.payment_plan).toBe(true);
  });

  it("writes payment_plan: false when the checkbox was left unchecked", () => {
    const payload = buildClosureCallPayload("org-1", { ...baseValues, payment_plan: false });
    expect(payload?.payment_plan).toBe(false);
  });

  it("defaults to false when the field is entirely absent, not inferred from cash/deposit amounts", () => {
    // cash_collected (500) is less than total_revenue (2000) here — a
    // real-world payment-plan-shaped submission — but payment_plan must
    // still default to false rather than being guessed from that gap.
    const payload = buildClosureCallPayload("org-1", baseValues);
    expect(payload?.payment_plan).toBe(false);
  });

  it("a non-boolean value never coerces to true", () => {
    const payload = buildClosureCallPayload("org-1", {
      ...baseValues,
      payment_plan: "on" as unknown as boolean,
    });
    expect(payload?.payment_plan).toBe(false);
  });
});

describe("EOD rows only write columns the tables really have", () => {
  // Same guard as calendly.test.ts: a builder can pass every unit test while
  // writing a column the database never had, and the insert then fails in
  // production. Checked against the columns the migrations actually create.
  it("closer post-call row fits public.calls", () => {
    const cols = tableColumnsFromMigrations("calls");
    const row = buildClosureCallPayload("org-1", {
      status: "Follow Up (short term)",
      closer_name: "Sam",
      lead_email: "a@b.c",
      date_of_call: "2026-11-13",
      followup_requested_at: "2026-11-14T15:00",
      followup_amount_pitched: 1500,
      followup_reason: "money",
      cash_collected: 100,
      total_revenue: 500,
    });
    expect(Object.keys(row!).filter((k) => !cols.has(k))).toEqual([]);
  });

  it("setter EOD row fits public.setter_activity", () => {
    const cols = tableColumnsFromMigrations("setter_activity");
    for (const role of ["dm_setter", "inbound_dialer"] as const) {
      const row = buildSetterActivityPayload(role, "org-1", { team_member_name: "Jo", dials: 10 });
      expect(Object.keys(row).filter((k) => !cols.has(k))).toEqual([]);
    }
  });
});

describe("eodToday", () => {
  // 10:30 PM Nov 13 in Toronto is already Nov 14 in UTC. The UTC default
  // filed evening EODs under tomorrow, so they fell out of that night's
  // sales report.
  const evening = new Date("2026-11-14T03:30:00Z");

  it("uses the business timezone, not UTC", () => {
    expect(eodToday("America/Toronto", evening)).toBe("2026-11-13");
  });

  it("matches the day the nightly report counts", () => {
    expect(eodToday("America/Toronto", evening)).toBe(localDateIn("America/Toronto", evening));
  });

  it("falls back to the browser's zone, never silently to UTC, when none is set", () => {
    expect(eodToday(null, evening)).toBe(localDateIn(browserTimeZone(), evening));
    expect(eodToday("Not/A_Zone", evening)).toBe(localDateIn(browserTimeZone(), evening));
  });
});

describe("EOD date questions", () => {
  it("resolve today when the form opens instead of carrying a fixed value", () => {
    // A value computed at module load goes stale for a page left open past
    // midnight; every date default has to be resolved per form instead.
    for (const schema of [DM_SETTER_EOD_SCHEMA, INBOUND_DIALER_EOD_SCHEMA, CLOSER_EOD_SCHEMA]) {
      for (const q of schema.filter((x) => x.type === "date")) {
        expect(q.defaultValue, q.key).toBeUndefined();
        expect(q.defaultToday, q.key).toBe(true);
      }
    }
  });
});
