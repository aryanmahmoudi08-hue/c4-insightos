import { describe, expect, it } from "vitest";
import {
  actualFromCalls,
  actualFromSetterActivity,
  sliceCallsToWindow,
  sliceSetterActivityToWindow,
} from "./rep-kpi-actuals";

describe("actualFromSetterActivity", () => {
  it("sums the mapped column across the rep's rows only", () => {
    const rows = [
      { team_member_name: "Alex", dials: 20, connections: 5 },
      { team_member_name: "Alex", dials: 15, connections: 3 },
      { team_member_name: "Jordan", dials: 100, connections: 40 },
    ];
    expect(actualFromSetterActivity(rows, "Alex", "dials")).toBe(35);
    expect(actualFromSetterActivity(rows, "Alex", "connections")).toBe(8);
  });

  it("returns null (not 0) when the rep has zero EOD submissions this period", () => {
    const rows = [{ team_member_name: "Jordan", dials: 10 }];
    expect(actualFromSetterActivity(rows, "Alex", "dials")).toBeNull();
  });

  it("returns null when the field was never asked of this role (not applicable), not a fabricated 0", () => {
    // Dialer rows never carry inbound_dms_sent — omitted, not zeroed.
    const rows = [{ team_member_name: "Alex", dials: 10 }];
    expect(actualFromSetterActivity(rows, "Alex", "inbound_dms_sent")).toBeNull();
  });

  it("a real logged zero is still a real number, not null", () => {
    const rows = [{ team_member_name: "Alex", dials: 10, connections: 0 }];
    expect(actualFromSetterActivity(rows, "Alex", "connections")).toBe(0);
  });

  it("unknown metric key resolves to null rather than throwing", () => {
    const rows = [{ team_member_name: "Alex", dials: 10 }];
    expect(actualFromSetterActivity(rows, "Alex", "not_a_real_metric")).toBeNull();
  });
});

describe("actualFromCalls", () => {
  const rows = [
    {
      closer_name: "Jordan",
      showed: true,
      offer_made: true,
      closed: true,
      cash_collected_cents: 200000,
      contract_value_cents: 500000,
      status: "closed",
    },
    {
      closer_name: "Jordan",
      showed: true,
      offer_made: true,
      closed: false,
      cash_collected_cents: 0,
      contract_value_cents: 0,
      status: "follow_up",
    },
    {
      closer_name: "Jordan",
      showed: false,
      offer_made: false,
      closed: false,
      cash_collected_cents: 0,
      contract_value_cents: 0,
      status: "no_show",
    },
    {
      closer_name: "Taylor",
      showed: true,
      offer_made: true,
      closed: true,
      cash_collected_cents: 999999,
      contract_value_cents: 999999,
      status: "closed",
    },
  ];

  it("counts shows/offers/closes scoped to the rep only", () => {
    expect(actualFromCalls(rows, "Jordan", "shows")).toBe(2);
    expect(actualFromCalls(rows, "Jordan", "offers_made")).toBe(2);
    expect(actualFromCalls(rows, "Jordan", "closes")).toBe(1);
  });

  it("close rate uses closes ÷ showed, matching the dashboard's own defensible denominator", () => {
    expect(actualFromCalls(rows, "Jordan", "close_rate_pct")).toBeCloseTo((1 / 2) * 100, 5);
  });

  it("close rate is null (not 0%) when the rep has zero shows to divide by", () => {
    const noShows = [{ closer_name: "Jordan", showed: false, closed: false }];
    expect(actualFromCalls(noShows, "Jordan", "close_rate_pct")).toBeNull();
  });

  it("sums cash collected and contracted revenue independently", () => {
    expect(actualFromCalls(rows, "Jordan", "cash_collected_cents")).toBe(200000);
    expect(actualFromCalls(rows, "Jordan", "contract_value_cents")).toBe(500000);
  });

  it("counts follow-ups from the real status field", () => {
    expect(actualFromCalls(rows, "Jordan", "follow_ups_logged")).toBe(1);
  });

  it("returns null when the closer has zero calls logged this period", () => {
    expect(actualFromCalls(rows, "Morgan", "closes")).toBeNull();
  });
});

describe("window slicing", () => {
  it("sliceSetterActivityToWindow keeps only rows within the inclusive date bounds", () => {
    const rows = [
      { team_member_name: "Alex", activity_date: "2026-08-31", dials: 1 },
      { team_member_name: "Alex", activity_date: "2026-09-01", dials: 2 },
      { team_member_name: "Alex", activity_date: "2026-09-15", dials: 3 },
      { team_member_name: "Alex", activity_date: "2026-10-01", dials: 4 },
    ];
    const sliced = sliceSetterActivityToWindow(rows, "2026-09-01", "2026-09-30");
    expect(sliced.map((r) => r.dials)).toEqual([2, 3]);
  });

  it("a daily target and a monthly target on the same rep slice the same raw rows into different actuals", () => {
    const rows = [
      { team_member_name: "Alex", activity_date: "2026-09-14", dials: 10 },
      { team_member_name: "Alex", activity_date: "2026-09-15", dials: 20 },
    ];
    const dailySlice = sliceSetterActivityToWindow(rows, "2026-09-15", "2026-09-15");
    const monthlySlice = sliceSetterActivityToWindow(rows, "2026-09-01", "2026-09-30");
    expect(actualFromSetterActivity(dailySlice, "Alex", "dials")).toBe(20);
    expect(actualFromSetterActivity(monthlySlice, "Alex", "dials")).toBe(30);
  });

  it("sliceCallsToWindow reads the timestamptz scheduled_for column into calendar-day bounds", () => {
    const rows = [
      { closer_name: "Jordan", scheduled_for: "2026-09-01T23:59:00Z", closed: true },
      { closer_name: "Jordan", scheduled_for: "2026-09-02T00:01:00Z", closed: true },
    ];
    const sliced = sliceCallsToWindow(rows, "2026-09-02", "2026-09-30");
    expect(sliced).toHaveLength(1);
  });
});
