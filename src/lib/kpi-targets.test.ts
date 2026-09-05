import { describe, expect, it } from "vitest";
import {
  computeTargetProgress,
  currentTargetsAsOf,
  elapsedDays,
  formatKpiValue,
  periodWindow,
  resolveActiveTarget,
  type TargetRecord,
} from "./kpi-targets";

describe("periodWindow", () => {
  it("daily: a single day, regardless of anchor", () => {
    const w = periodWindow("daily", "2026-09-04");
    expect(w).toMatchObject({ start: "2026-09-04", end: "2026-09-04", daysTotal: 1 });
  });

  it("weekly: Monday-start, anchor mid-week", () => {
    // 2026-09-03 is a Thursday.
    const w = periodWindow("weekly", "2026-09-03");
    expect(w.start).toBe("2026-08-31"); // Monday
    expect(w.end).toBe("2026-09-06"); // Sunday
    expect(w.daysTotal).toBe(7);
  });

  it("weekly: anchor on Sunday belongs to the week that just ended, not a new one", () => {
    // 2026-09-06 is a Sunday.
    const w = periodWindow("weekly", "2026-09-06");
    expect(w.start).toBe("2026-08-31");
    expect(w.end).toBe("2026-09-06");
  });

  it("weekly: anchor on Monday starts a fresh week", () => {
    const w = periodWindow("weekly", "2026-08-31");
    expect(w.start).toBe("2026-08-31");
    expect(w.end).toBe("2026-09-06");
  });

  it("monthly: a real calendar month regardless of what a page date-range picker shows", () => {
    const w = periodWindow("monthly", "2026-09-15");
    expect(w.start).toBe("2026-09-01");
    expect(w.end).toBe("2026-09-30");
    expect(w.daysTotal).toBe(30);
    expect(w.label).toBe("September 2026");
  });

  it("monthly: correctly sizes a leap-year February", () => {
    // 2028 is a leap year.
    const w = periodWindow("monthly", "2028-02-10");
    expect(w.end).toBe("2028-02-29");
    expect(w.daysTotal).toBe(29);
  });

  it("monthly: correctly sizes a non-leap-year February", () => {
    const w = periodWindow("monthly", "2026-02-10");
    expect(w.end).toBe("2026-02-28");
    expect(w.daysTotal).toBe(28);
  });
});

describe("elapsedDays", () => {
  it("first day of a monthly period elapses as day 1, not 0", () => {
    const w = periodWindow("monthly", "2026-09-01");
    expect(elapsedDays(w, "2026-09-01")).toBe(1);
  });

  it("last day of a monthly period elapses as the full daysTotal", () => {
    const w = periodWindow("monthly", "2026-09-15");
    expect(elapsedDays(w, "2026-09-30")).toBe(30);
  });

  it("clamps to daysTotal even if asOf is somehow past the window end", () => {
    const w = periodWindow("monthly", "2026-09-15");
    expect(elapsedDays(w, "2026-10-05")).toBe(30);
  });
});

describe("resolveActiveTarget", () => {
  const base: Omit<TargetRecord, "effectiveFrom" | "isActive" | "targetValue" | "id"> = {
    role: "closer",
    teamMemberName: "Jordan",
    metricKey: "closes",
    period: "monthly",
    createdAt: "2026-09-01T00:00:00Z",
  };

  it("picks the version effective as of the given date", () => {
    const records: TargetRecord[] = [
      { ...base, id: "1", targetValue: 10, isActive: true, effectiveFrom: "2026-08-01" },
    ];
    expect(resolveActiveTarget(records, "2026-08-15")?.targetValue).toBe(10);
  });

  it("a target changed between periods does not retroactively alter the earlier period's reporting", () => {
    // September target = 100, October target = 120.
    const records: TargetRecord[] = [
      { ...base, id: "sep", targetValue: 100, isActive: true, effectiveFrom: "2026-09-01" },
      { ...base, id: "oct", targetValue: 120, isActive: true, effectiveFrom: "2026-10-01" },
    ];
    expect(resolveActiveTarget(records, "2026-09-15")?.targetValue).toBe(100);
    expect(resolveActiveTarget(records, "2026-09-30")?.targetValue).toBe(100);
    expect(resolveActiveTarget(records, "2026-10-01")?.targetValue).toBe(120);
    expect(resolveActiveTarget(records, "2026-10-15")?.targetValue).toBe(120);
  });

  it("returns null before any version takes effect", () => {
    const records: TargetRecord[] = [
      { ...base, id: "1", targetValue: 10, isActive: true, effectiveFrom: "2026-09-01" },
    ];
    expect(resolveActiveTarget(records, "2026-08-15")).toBeNull();
  });

  it("an archived (is_active=false) current version resolves to no target from its effective date forward", () => {
    const records: TargetRecord[] = [
      { ...base, id: "live", targetValue: 10, isActive: true, effectiveFrom: "2026-08-01" },
      { ...base, id: "archived", targetValue: 10, isActive: false, effectiveFrom: "2026-09-10" },
    ];
    expect(resolveActiveTarget(records, "2026-09-05")?.targetValue).toBe(10);
    expect(resolveActiveTarget(records, "2026-09-15")).toBeNull();
  });

  it("same-day edits (identical effectiveFrom) resolve to the single stored row, never a duplicate", () => {
    const records: TargetRecord[] = [
      { ...base, id: "1", targetValue: 15, isActive: true, effectiveFrom: "2026-09-01" },
    ];
    expect(resolveActiveTarget(records, "2026-09-01")?.targetValue).toBe(15);
  });
});

describe("currentTargetsAsOf", () => {
  it("returns one resolved row per (role, rep, metric, period) group, across multiple reps/metrics", () => {
    const records: TargetRecord[] = [
      {
        id: "1",
        role: "closer",
        teamMemberName: "Jordan",
        metricKey: "closes",
        period: "monthly",
        targetValue: 20,
        isActive: true,
        effectiveFrom: "2026-09-01",
        createdAt: "2026-09-01T00:00:00Z",
      },
      {
        id: "2",
        role: "closer",
        teamMemberName: "Jordan",
        metricKey: "cash_collected_cents",
        period: "monthly",
        targetValue: 5000000,
        isActive: true,
        effectiveFrom: "2026-09-01",
        createdAt: "2026-09-01T00:00:00Z",
      },
      {
        id: "3",
        role: "dm_setter",
        teamMemberName: "Alex",
        metricKey: "dials",
        period: "daily",
        targetValue: 50,
        isActive: true,
        effectiveFrom: "2026-09-01",
        createdAt: "2026-09-01T00:00:00Z",
      },
    ];
    const current = currentTargetsAsOf(records, "2026-09-15");
    expect(current).toHaveLength(3);
  });

  it("omits a group whose latest version is archived", () => {
    const records: TargetRecord[] = [
      {
        id: "1",
        role: "closer",
        teamMemberName: "Jordan",
        metricKey: "closes",
        period: "monthly",
        targetValue: 20,
        isActive: true,
        effectiveFrom: "2026-09-01",
        createdAt: "2026-09-01T00:00:00Z",
      },
      {
        id: "2",
        role: "closer",
        teamMemberName: "Jordan",
        metricKey: "closes",
        period: "monthly",
        targetValue: 20,
        isActive: false,
        effectiveFrom: "2026-09-10",
        createdAt: "2026-09-10T00:00:00Z",
      },
    ];
    expect(currentTargetsAsOf(records, "2026-09-15")).toHaveLength(0);
    expect(currentTargetsAsOf(records, "2026-09-05")).toHaveLength(1);
  });
});

describe("computeTargetProgress", () => {
  const common = { format: "count" as const, period: "monthly" as const };

  it("no target configured — status is no_target, not a fabricated 0%", () => {
    const p = computeTargetProgress({
      ...common,
      anchorISODate: "2026-09-15",
      targetValue: null,
      actualValue: 40,
    });
    expect(p.status).toBe("no_target");
    expect(p.targetValue).toBeNull();
    expect(p.percentOfTarget).toBeNull();
    expect(p.actualValue).toBe(40);
  });

  it("actual data unavailable — status is insufficient_data, never silently 0", () => {
    const p = computeTargetProgress({
      ...common,
      anchorISODate: "2026-09-15",
      targetValue: 100,
      actualValue: null,
    });
    expect(p.status).toBe("insufficient_data");
    expect(p.actualValue).toBeNull();
    expect(p.targetValue).toBe(100);
    expect(p.percentOfTarget).toBeNull();
  });

  it("first day of period, zero actual — behind, not falsely 'at risk' this early", () => {
    // Day 1 of a 30-day month, target 100.
    const p = computeTargetProgress({
      ...common,
      anchorISODate: "2026-09-01",
      targetValue: 100,
      actualValue: 0,
    });
    expect(p.daysElapsed).toBe(1);
    expect(p.status).toBe("behind");
    expect(p.expectedByNow).toBeCloseTo(100 / 30, 5);
  });

  it("late in the period, far behind — genuinely at_risk (catch-up pace far exceeds normal rate)", () => {
    // Day 25 of 30, target 100, actual only 10.
    const p = computeTargetProgress({
      ...common,
      anchorISODate: "2026-09-25",
      targetValue: 100,
      actualValue: 10,
    });
    expect(p.status).toBe("at_risk");
    expect(p.daysRemaining).toBe(5);
    expect(p.requiredDailyPace).toBeCloseTo(90 / 5, 5);
  });

  it("actual above target mid-period — ahead", () => {
    const p = computeTargetProgress({
      ...common,
      anchorISODate: "2026-09-15",
      targetValue: 100,
      actualValue: 90,
    });
    expect(p.status).toBe("ahead");
    expect(p.varianceVsExpected).toBeGreaterThan(0);
  });

  it("actual tracking expected pace closely mid-period — on_pace", () => {
    // Day 15 of 30 -> expected ~50.
    const p = computeTargetProgress({
      ...common,
      anchorISODate: "2026-09-15",
      targetValue: 100,
      actualValue: 48,
    });
    expect(p.status).toBe("on_pace");
  });

  it("worked example from the brief: day 15 of 30, target 100, actual 42 — behind, expected 50", () => {
    const p = computeTargetProgress({
      ...common,
      anchorISODate: "2026-09-15",
      targetValue: 100,
      actualValue: 42,
    });
    expect(p.expectedByNow).toBeCloseTo(50, 5);
    expect(p.varianceVsExpected).toBeCloseTo(-8, 5);
    expect(p.remainingNeeded).toBeCloseTo(58, 5);
    expect(p.daysRemaining).toBe(15);
    expect(p.requiredDailyPace).toBeCloseTo(58 / 15, 5);
    expect(["behind", "at_risk"]).toContain(p.status);
  });

  it("period complete, target exceeded — ahead", () => {
    const p = computeTargetProgress({
      ...common,
      anchorISODate: "2026-09-30",
      targetValue: 100,
      actualValue: 110,
    });
    expect(p.daysRemaining).toBe(0);
    expect(p.status).toBe("ahead");
    expect(p.reason).toMatch(/Exceeded target/);
  });

  it("period complete, target essentially met — on_pace", () => {
    const p = computeTargetProgress({
      ...common,
      anchorISODate: "2026-09-30",
      targetValue: 100,
      actualValue: 92,
    });
    expect(p.status).toBe("on_pace");
    expect(p.reason).toMatch(/Hit target/);
  });

  it("period complete, target missed — behind", () => {
    const p = computeTargetProgress({
      ...common,
      anchorISODate: "2026-09-30",
      targetValue: 100,
      actualValue: 60,
    });
    expect(p.status).toBe("behind");
    expect(p.reason).toMatch(/Missed target/);
  });

  it("a custom, non-calendar-month page date range never gets treated as the monthly window", () => {
    // Even if the caller's page-level date range is some arbitrary partial
    // range (e.g. Aug 12 - Aug 19), the monthly period is always computed
    // from calendar rules off the anchor date alone.
    const p = computeTargetProgress({
      ...common,
      period: "monthly",
      anchorISODate: "2026-08-19",
      targetValue: 310,
      actualValue: 150,
    });
    expect(p.periodStart).toBe("2026-08-01");
    expect(p.periodEnd).toBe("2026-08-31");
    expect(p.daysTotal).toBe(31);
  });

  it("daily period, target and actual equal exactly at period end — on_pace boundary counts as hit", () => {
    const p = computeTargetProgress({
      format: "count",
      period: "daily",
      anchorISODate: "2026-09-04",
      targetValue: 20,
      actualValue: 20,
    });
    expect(p.daysRemaining).toBe(0);
    expect(p.status).toBe("ahead"); // attainment exactly 1.0
  });

  it("weekly period respects its own 7-day pacing independent of a monthly target on the same rep", () => {
    const w = computeTargetProgress({
      format: "count",
      period: "weekly",
      anchorISODate: "2026-09-03", // Thursday, day 4 of the Mon-Sun week
      targetValue: 35,
      actualValue: 20,
    });
    expect(w.daysElapsed).toBe(4);
    expect(w.daysTotal).toBe(7);
    expect(w.expectedByNow).toBeCloseTo(20, 5);
  });
});

describe("formatKpiValue", () => {
  it("formats money from cents", () => {
    expect(formatKpiValue("money_cents", 4200000)).toBe("$42,000");
  });
  it("formats a percent with one decimal", () => {
    expect(formatKpiValue("percent", 72.456)).toBe("72.5%");
  });
  it("formats a count rounded", () => {
    expect(formatKpiValue("count", 17.6)).toBe("18");
  });
});
