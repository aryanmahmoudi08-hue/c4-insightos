import { describe, expect, it } from "vitest";
import { aggregateWebinarMetrics, compareWebinars, retentionCurve } from "./webinar-analytics";

describe("webinar analytics", () => {
  const row = {
    lead_capture_investment_cents: 10000,
    clicks: 100,
    visits_paid: 500,
    paid_leads: 20,
    organic_leads: 10,
    group_leads: 15,
    email_opens: 18,
    email_clicks: 9,
    registered: 30,
    live_attendees: 20,
    pitch_attendees: 10,
    deposits: 5,
    sales: 2,
    core_revenue_cents: 50000,
    refunds_cents: 1000,
    order_bump_sales: 1,
    order_bump_revenue_cents: 5000,
    upsell_sales: 1,
    upsell_revenue_cents: 10000,
  };

  it("aggregates six-stage metrics and keeps paid and organic leads separate", () => {
    const result = aggregateWebinarMetrics([row]);
    expect(result.capture.paidLeads).toBe(20);
    expect(result.capture.organicLeads).toBe(10);
    expect(result.capture.totalLeads).toBe(30);
    expect(result.webinar.showUpRate).toBeCloseTo(2 / 3);
    expect(result.salesSetting.deposits).toBe(5);
    expect(result.revenue.totalRevenueCents).toBe(65000);
  });

  it("only calculates ROAS when legitimate spend exists", () => {
    expect(
      aggregateWebinarMetrics([{ ...row, lead_capture_investment_cents: 0 }]).revenue.roas,
    ).toBeNull();
    expect(aggregateWebinarMetrics([row]).revenue.roas).toBeCloseTo(6.5);
  });

  it("builds retention points from actual event timestamps", () => {
    const curve = retentionCurve([
      { event_type: "registered", occurred_at: "2026-08-27T10:00:00Z" },
      { event_type: "attended", occurred_at: "2026-08-27T10:30:00Z" },
      {
        event_type: "pitch",
        occurred_at: "2026-08-27T11:00:00Z",
        metadata: { audience_remaining: 12 },
      },
    ]);
    expect(curve.map((point) => point.label)).toEqual([
      "Registered",
      "Live attendance",
      "At pitch",
    ]);
    expect(curve[2].audience).toBe(12);
  });

  it("returns independently aggregated webinar comparison data", () => {
    const result = compareWebinars([row], [{ ...row, sales: 4 }]);
    expect(result.left.revenue.totalSales).toBe(2);
    expect(result.right.revenue.totalSales).toBe(4);
  });
});
