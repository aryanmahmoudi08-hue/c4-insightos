import { describe, expect, it } from "vitest";
import {
  dailyReportWindow,
  followUpEventType,
  periodLabel,
  unconfirmedCallWindow,
  weeklyReportWindow,
} from "./scheduler-rules";

const NY = "America/New_York";

describe("dailyReportWindow", () => {
  it("is not due before the send hour, local time", () => {
    // 22:30 NY on Thu Nov 12 = 03:30 UTC Nov 13.
    expect(dailyReportWindow(NY, 23, new Date("2026-11-13T03:30:00Z")).due).toBe(false);
  });

  it("is due at the send hour and covers the local day, not the UTC one", () => {
    // 23:05 NY on Nov 12 is already Nov 13 in UTC.
    const w = dailyReportWindow(NY, 23, new Date("2026-11-13T04:05:00Z"));
    expect(w).toEqual({ due: true, from: "2026-11-12", to: "2026-11-12", key: "2026-11-12" });
  });

  it("refuses to run without a timezone rather than guessing UTC", () => {
    expect(dailyReportWindow("", 23, new Date())).toEqual({
      due: false,
      reason: "no workspace timezone set",
    });
    expect(dailyReportWindow("Not/A_Zone", 23, new Date()).due).toBe(false);
  });
});

describe("weeklyReportWindow", () => {
  it("is due on the report day and covers the seven days ending that day", () => {
    // Sun Nov 15 2026, 23:10 NY = 04:10 UTC Nov 16.
    const w = weeklyReportWindow(NY, 0, 23, new Date("2026-11-16T04:10:00Z"));
    expect(w).toEqual({ due: true, from: "2026-11-09", to: "2026-11-15", key: "2026-11-15" });
  });

  it("is not due on any other day", () => {
    expect(weeklyReportWindow(NY, 0, 23, new Date("2026-11-13T04:10:00Z")).due).toBe(false);
  });
});

describe("unconfirmedCallWindow", () => {
  const now = new Date("2026-11-13T15:00:00Z");

  it("uses the touchpoint's own window close as the deadline", () => {
    // Morning closes 60 minutes before the call.
    expect(unconfirmedCallWindow("morning", now)).toEqual({
      fromIso: "2026-11-13T14:50:00.000Z",
      toIso: "2026-11-13T16:00:00.000Z",
    });
  });

  it("still catches calls when the deadline is the call's own start", () => {
    const w = unconfirmedCallWindow("ten_min", now);
    expect(w.toIso).toBe("2026-11-13T15:00:00.000Z");
    expect(w.fromIso < w.toIso).toBe(true);
  });
});

describe("followUpEventType", () => {
  it("routes by which follow-up status the closer chose", () => {
    expect(followUpEventType("Follow Up (short term)")).toBe("followup.short_term_due");
    expect(followUpEventType("Follow Up (long term)")).toBe("followup.long_term_due");
    expect(followUpEventType("Closed")).toBeNull();
    expect(followUpEventType(null)).toBeNull();
  });
});

describe("periodLabel", () => {
  it("names a single day with its weekday and a range without", () => {
    expect(periodLabel("2026-11-13", "2026-11-13")).toBe("Fri, Nov 13");
    expect(periodLabel("2026-11-09", "2026-11-15")).toBe("Nov 9 – Nov 15");
  });
});
