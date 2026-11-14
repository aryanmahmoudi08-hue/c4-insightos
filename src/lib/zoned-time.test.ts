import { describe, expect, it } from "vitest";
import {
  addCalendarDays,
  isValidTimeZone,
  localDateIn,
  localHourIn,
  localWeekdayIn,
  zonedDayRangeUtc,
  zonedMidnightUtc,
} from "./zoned-time";

const NY = "America/New_York";

describe("zonedMidnightUtc", () => {
  it("puts New York midnight at 05:00 UTC in winter", () => {
    expect(zonedMidnightUtc("2026-11-13", NY).toISOString()).toBe("2026-11-13T05:00:00.000Z");
  });

  it("puts New York midnight at 04:00 UTC in summer", () => {
    expect(zonedMidnightUtc("2026-07-01", NY).toISOString()).toBe("2026-07-01T04:00:00.000Z");
  });

  it("handles the day DST starts and the day it ends", () => {
    // 2026-03-08 and 2026-11-01 are the US transition days; midnight is
    // before the 2am switch on both, so it uses the pre-switch offset.
    expect(zonedMidnightUtc("2026-03-08", NY).toISOString()).toBe("2026-03-08T05:00:00.000Z");
    expect(zonedMidnightUtc("2026-11-01", NY).toISOString()).toBe("2026-11-01T04:00:00.000Z");
  });

  it("works east of UTC too", () => {
    expect(zonedMidnightUtc("2026-11-13", "Asia/Tokyo").toISOString()).toBe(
      "2026-11-12T15:00:00.000Z",
    );
  });

  it("is plain UTC midnight for UTC", () => {
    expect(zonedMidnightUtc("2026-11-13", "UTC").toISOString()).toBe("2026-11-13T00:00:00.000Z");
  });
});

describe("zonedDayRangeUtc", () => {
  it("covers the whole local day, evening included", () => {
    const { startIso, endIso } = zonedDayRangeUtc("2026-11-12", "2026-11-12", NY);
    expect(startIso).toBe("2026-11-12T05:00:00.000Z");
    expect(endIso).toBe("2026-11-13T05:00:00.000Z");
    // The submission that vanished from "Today": 8:59:59 PM EST.
    const eveningSubmission = "2026-11-13T01:59:59.000Z";
    expect(eveningSubmission >= startIso && eveningSubmission < endIso).toBe(true);
  });

  it("spans several days, half-open at the end", () => {
    const { startIso, endIso } = zonedDayRangeUtc("2026-11-01", "2026-11-07", NY);
    expect(startIso).toBe("2026-11-01T04:00:00.000Z");
    expect(endIso).toBe("2026-11-08T05:00:00.000Z");
  });

  it("crosses a month and a year boundary", () => {
    const { endIso } = zonedDayRangeUtc("2026-12-31", "2026-12-31", NY);
    expect(endIso).toBe("2027-01-01T05:00:00.000Z");
  });
});

describe("local readers", () => {
  const evening = new Date("2026-11-13T01:59:59Z"); // 8:59:59 PM Nov 12 in NY

  it("reads the local date, not the UTC one", () => {
    expect(localDateIn(NY, evening)).toBe("2026-11-12");
    expect(localDateIn("UTC", evening)).toBe("2026-11-13");
  });

  it("reads the local hour", () => {
    expect(localHourIn(NY, evening)).toBe(20);
  });

  it("reads the local weekday (Thursday)", () => {
    expect(localWeekdayIn(NY, evening)).toBe(4);
  });
});

describe("addCalendarDays", () => {
  it("rolls over months and years", () => {
    expect(addCalendarDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addCalendarDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addCalendarDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("isValidTimeZone", () => {
  it("accepts real zones and rejects everything else", () => {
    expect(isValidTimeZone(NY)).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus_Mons")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
    expect(isValidTimeZone(null)).toBe(false);
  });
});
