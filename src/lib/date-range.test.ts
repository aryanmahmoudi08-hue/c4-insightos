import { describe, expect, it } from "vitest";
import {
  CUSTOM_LABEL,
  localISODate,
  normalizeStoredRange,
  presetRange,
  presetRangeFrom,
  rangeKeyForLabel,
} from "./date-range";

// 27 Oct 2026, 20:12 — built from LOCAL parts, so it is that wall-clock time
// wherever this suite runs. Anywhere west of UTC its UTC date has already
// rolled over to the 28th, which is the exact condition that made every
// preset point at the wrong day.
const EVENING = new Date(2026, 9, 27, 20, 12);

describe("localISODate", () => {
  it("returns the viewer's calendar date, not the UTC one", () => {
    expect(localISODate(EVENING)).toBe("2026-10-27");
  });

  it("is stable across the whole local day", () => {
    expect(localISODate(new Date(2026, 9, 27, 0, 0))).toBe("2026-10-27");
    expect(localISODate(new Date(2026, 9, 27, 23, 59))).toBe("2026-10-27");
  });

  it("zero-pads single-digit months and days", () => {
    expect(localISODate(new Date(2026, 0, 5, 12, 0))).toBe("2026-01-05");
  });
});

describe("presetRangeFrom", () => {
  // October 2026, the 27th. Month is 0-indexed, as Date reports it.
  const oct27 = { y: 2026, m: 9, d: 27 };

  it("today is a single day", () => {
    expect(presetRangeFrom(oct27, "today")).toEqual({
      from: "2026-10-27",
      to: "2026-10-27",
      label: "Today",
    });
  });

  it("yesterday is a single day, the one before", () => {
    expect(presetRangeFrom(oct27, "yesterday")).toEqual({
      from: "2026-10-26",
      to: "2026-10-26",
      label: "Yesterday",
    });
  });

  it("counts 7d and 30d inclusive of today", () => {
    // 21st..27th is seven days, not eight.
    expect(presetRangeFrom(oct27, "last7")).toMatchObject({
      from: "2026-10-21",
      to: "2026-10-27",
    });
    expect(presetRangeFrom(oct27, "last30")).toMatchObject({
      from: "2026-09-28",
      to: "2026-10-27",
    });
  });

  it("starts MTD on the first of the current month", () => {
    expect(presetRangeFrom(oct27, "mtd")).toMatchObject({ from: "2026-10-01", to: "2026-10-27" });
    // On the 1st itself, MTD is one day long rather than empty.
    expect(presetRangeFrom({ y: 2026, m: 9, d: 1 }, "mtd")).toMatchObject({
      from: "2026-10-01",
      to: "2026-10-01",
    });
  });

  it("ends All time at today rather than at some future date", () => {
    expect(presetRangeFrom(oct27, "all")).toMatchObject({ from: "2000-01-01", to: "2026-10-27" });
  });

  it("walks backwards across a month boundary", () => {
    expect(presetRangeFrom({ y: 2026, m: 2, d: 2 }, "yesterday").from).toBe("2026-03-01");
    expect(presetRangeFrom({ y: 2026, m: 2, d: 1 }, "yesterday").from).toBe("2026-02-28");
  });

  it("walks backwards across a year boundary", () => {
    expect(presetRangeFrom({ y: 2027, m: 0, d: 1 }, "yesterday").from).toBe("2026-12-31");
    expect(presetRangeFrom({ y: 2027, m: 0, d: 3 }, "last7").from).toBe("2026-12-28");
  });

  it("handles a leap day", () => {
    expect(presetRangeFrom({ y: 2028, m: 2, d: 1 }, "yesterday").from).toBe("2028-02-29");
  });
});

describe("presetRange", () => {
  it("reads the local calendar day off the clock it is given", () => {
    expect(presetRange("today", EVENING)).toEqual({
      from: "2026-10-27",
      to: "2026-10-27",
      label: "Today",
    });
  });
});

describe("rangeKeyForLabel", () => {
  it("round-trips every preset's own label", () => {
    for (const key of ["today", "yesterday", "last7", "last30", "mtd", "all"] as const) {
      expect(rangeKeyForLabel(presetRange(key, EVENING).label)).toBe(key);
    }
  });

  it("does not claim Custom or anything unknown", () => {
    expect(rangeKeyForLabel(CUSTOM_LABEL)).toBeNull();
    expect(rangeKeyForLabel("Last week")).toBeNull();
  });
});

describe("normalizeStoredRange", () => {
  it("recomputes a stored preset against today rather than trusting its dates", () => {
    // Stored a week ago while "Today" was selected. Restoring it verbatim is
    // what showed the Today chip lit over week-old numbers.
    const stale = { from: "2026-10-20", to: "2026-10-20", label: "Today" };
    expect(normalizeStoredRange(stale, EVENING)).toEqual({
      from: "2026-10-27",
      to: "2026-10-27",
      label: "Today",
    });
  });

  it("recomputes every preset, not just the single-day ones", () => {
    expect(
      normalizeStoredRange({ from: "2020-01-01", to: "2020-01-30", label: "Last 30d" }, EVENING),
    ).toMatchObject({ from: "2026-09-28", to: "2026-10-27" });
  });

  it("keeps a custom range exactly as the user set it", () => {
    const custom = { from: "2026-01-01", to: "2026-03-15", label: CUSTOM_LABEL };
    expect(normalizeStoredRange(custom, EVENING)).toEqual(custom);
  });

  it("rights a backwards custom range instead of returning an empty one", () => {
    expect(
      normalizeStoredRange({ from: "2026-03-15", to: "2026-01-01", label: CUSTOM_LABEL }, EVENING),
    ).toEqual({ from: "2026-01-01", to: "2026-03-15", label: CUSTOM_LABEL });
  });

  it("falls back to the default for anything it cannot trust", () => {
    const fallback = presetRange("last30", EVENING);
    expect(normalizeStoredRange(null, EVENING)).toEqual(fallback);
    expect(normalizeStoredRange("Today", EVENING)).toEqual(fallback);
    expect(normalizeStoredRange({}, EVENING)).toEqual(fallback);
    expect(normalizeStoredRange({ label: "Last fortnight" }, EVENING)).toEqual(fallback);
    // Custom with unusable dates — a half-written range is not a range.
    expect(
      normalizeStoredRange({ from: "nope", to: "2026-01-01", label: CUSTOM_LABEL }, EVENING),
    ).toEqual(fallback);
    expect(normalizeStoredRange({ from: "2026-01-01", label: CUSTOM_LABEL }, EVENING)).toEqual(
      fallback,
    );
  });
});
