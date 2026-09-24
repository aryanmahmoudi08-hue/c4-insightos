import { describe, expect, it } from "vitest";
import {
  countInputToNumber,
  isEmptyWebinarMetric,
  moneyInputToCents,
  parseWebinarMetricsCsv,
  EMPTY_WEBINAR_METRIC,
} from "./webinar-metrics";

const FALLBACK = "2026-09-24T00:00:00.000Z";

describe("parseWebinarMetricsCsv", () => {
  it("maps recognized headers and converts money columns to cents", () => {
    const csv = [
      "date,registered,live_attendees,sales,revenue,ad_spend",
      "2026-09-01,300,120,12,24000,1500",
    ].join("\n");
    const { rows, matchedColumns } = parseWebinarMetricsCsv(csv, FALLBACK);

    expect(rows).toHaveLength(1);
    expect(rows[0].registered).toBe(300);
    expect(rows[0].live_attendees).toBe(120);
    expect(rows[0].sales).toBe(12);
    // money in, cents stored
    expect(rows[0].core_revenue_cents).toBe(2_400_000);
    expect(rows[0].lead_capture_investment_cents).toBe(150_000);
    expect(rows[0].captured_at).toBe(new Date("2026-09-01").toISOString());
    expect(matchedColumns).toContain("core_revenue_cents");
  });

  it("keeps absent columns and blank cells null — 0 is a real measurement, missing is not", () => {
    const csv = ["registered,live_attendees,sales", "300,0,"].join("\n");
    const { rows } = parseWebinarMetricsCsv(csv, FALLBACK);

    expect(rows[0].live_attendees).toBe(0); // real zero, preserved
    expect(rows[0].sales).toBeNull(); // blank cell
    expect(rows[0].deposits).toBeNull(); // column absent entirely
  });

  it("prefers an exact header match over a substring one", () => {
    // "sales" must not be swallowed by the upsell_sales/order_bump_sales
    // lookups, and vice versa.
    const csv = ["sales,upsell_sales,order_bump_sales", "10,3,2"].join("\n");
    const { rows } = parseWebinarMetricsCsv(csv, FALLBACK);

    expect(rows[0].sales).toBe(10);
    expect(rows[0].upsell_sales).toBe(3);
    expect(rows[0].order_bump_sales).toBe(2);
  });

  it("falls back to the caller's captured_at when the CSV has no usable date", () => {
    const csv = ["registered", "300"].join("\n");
    const { rows } = parseWebinarMetricsCsv(csv, FALLBACK);
    expect(rows[0].captured_at).toBe(FALLBACK);
  });

  it("reports headers it did not recognize instead of importing silent nulls", () => {
    const csv = ["registered,mystery_column,another_one", "300,5,9"].join("\n");
    const { unrecognizedHeaders } = parseWebinarMetricsCsv(csv, FALLBACK);
    expect(unrecognizedHeaders).toEqual(["mystery_column", "another_one"]);
  });

  it("handles quoted cells with commas and thousands separators", () => {
    const csv = ["registered,revenue", '"1,200","24,000"'].join("\n");
    const { rows } = parseWebinarMetricsCsv(csv, FALLBACK);
    expect(rows[0].registered).toBe(1200);
    expect(rows[0].core_revenue_cents).toBe(2_400_000);
  });

  it("imports multiple rows and skips fully blank lines", () => {
    const csv = ["date,registered", "2026-09-01,300", ",,", "2026-09-02,410"].join("\n");
    const { rows } = parseWebinarMetricsCsv(csv, FALLBACK);
    expect(rows.map((r) => r.registered)).toEqual([300, 410]);
  });

  it("rejects a CSV with no data rows rather than importing nothing silently", () => {
    expect(() => parseWebinarMetricsCsv("registered,sales", FALLBACK)).toThrow(
      /header row plus at least one data row/i,
    );
  });
});

describe("manual entry coercion", () => {
  it("treats blank as null, not zero", () => {
    expect(moneyInputToCents("")).toBeNull();
    expect(countInputToNumber("   ")).toBeNull();
  });

  it("converts money to cents and rounds counts", () => {
    expect(moneyInputToCents("1,500.50")).toBe(150_050);
    expect(moneyInputToCents("$240")).toBe(24_000);
    expect(countInputToNumber("300")).toBe(300);
  });

  it("flags a snapshot that would claim nothing", () => {
    expect(isEmptyWebinarMetric(EMPTY_WEBINAR_METRIC)).toBe(true);
    expect(isEmptyWebinarMetric({ ...EMPTY_WEBINAR_METRIC, registered: 0 })).toBe(false);
  });
});
