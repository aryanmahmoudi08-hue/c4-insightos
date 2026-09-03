import { describe, expect, it } from "vitest";
import { calculateAcquisitionMetrics } from "./acquisition";
import { aggregateWebinarMetrics, retentionCurve } from "./webinar-analytics";
import { webinarEventCounts } from "./webinar-events";
import { createMockWebinarFixture } from "./webinar-mock-data";

describe("development webinar fixture", () => {
  const fixture = createMockWebinarFixture(new Date("2026-08-27T12:00:00.000Z"));

  it("contains three independent clearly synthetic webinars", () => {
    expect(fixture.webinars).toHaveLength(3);
    expect(new Set(fixture.webinars.map((webinar) => webinar.id)).size).toBe(3);
    expect(
      fixture.webinars.every(
        (webinar) => webinar.name.includes("MOCK / DEMO") && webinar.source === "mock",
      ),
    ).toBe(true);
    expect(fixture.metrics["mock-webinar-a"]).not.toEqual(fixture.metrics["mock-webinar-b"]);
    expect(fixture.events["mock-webinar-a"]).not.toEqual(fixture.events["mock-webinar-b"]);
  });

  it("keeps funnel counts internally consistent", () => {
    for (const webinarId of Object.keys(fixture.events)) {
      const counts = webinarEventCounts(fixture.events[webinarId]);
      expect(counts.liveAttendees).toBeLessThanOrEqual(counts.registrations);
      expect(counts.pitchAttendees).toBeLessThanOrEqual(counts.liveAttendees);
      expect(counts.applications).toBeLessThanOrEqual(counts.registrations);
      expect(counts.bookedCalls).toBeLessThanOrEqual(counts.applications);
      expect(counts.shows).toBeLessThanOrEqual(counts.bookedCalls);
      expect(counts.closes).toBeLessThanOrEqual(counts.bookedCalls);
    }
  });

  it("generates retention from event timestamps and different profiles", () => {
    const a = retentionCurve(fixture.events["mock-webinar-a"]);
    const b = retentionCurve(fixture.events["mock-webinar-b"]);
    expect(a).toHaveLength(3);
    expect(b).toHaveLength(3);
    expect(a[0].audience).toBe(120);
    expect(b[0].audience).toBe(150);
    expect(a[1].timestamp).not.toBe(a[0].timestamp);
  });

  it("flows real mock spend through acquisition calculations", () => {
    const summary = aggregateWebinarMetrics(
      fixture.metrics["mock-webinar-b"],
      fixture.events["mock-webinar-b"],
    );
    const metrics = calculateAcquisitionMetrics({
      spend: fixture.spend["mock-webinar-b"],
      paidLeads: summary.capture.paidLeads,
      attributableCustomers: summary.revenue.totalSales,
      attributableRevenueCents: summary.revenue.totalRevenueCents,
    });
    expect(metrics.spendCents).toBeGreaterThan(0);
    expect(metrics.ctr).not.toBeNull();
    expect(metrics.cpcCents).not.toBeNull();
    expect(metrics.cplCents).not.toBeNull();
    expect(metrics.cpaCents).not.toBeNull();
    expect(metrics.roas).not.toBeNull();
    expect(
      fixture.spend["mock-webinar-b"].every(
        (row) => row.webinarId === "mock-webinar-b" && row.metadata?.demo === true,
      ),
    ).toBe(true);
  });

  it("preserves explicit platform, campaign, content, and webinar links", () => {
    const registration = fixture.events["mock-webinar-a"].find(
      (event) => event.event_type === "registered",
    );
    const spend = fixture.spend["mock-webinar-a"][0];
    expect(registration?.source_platform).toBe("Instagram");
    expect(registration?.source_campaign).toBe("mock-campaign-instagram-a");
    expect(registration?.source_content_id).toBe("00000000-0000-4000-8000-000000000101");
    expect(spend.webinarId).toBe("mock-webinar-a");
    expect(spend.contentId).toBe("00000000-0000-4000-8000-000000000101");
  });
});
