import { describe, expect, it } from "vitest";
import {
  retentionFromEvents,
  splitPitchOutcomes,
  webinarEventKey,
  webinarEventCounts,
  type WebinarEventRow,
} from "./webinar-events";

const event = (
  event_type: WebinarEventRow["event_type"],
  occurred_at: string,
  extra: Partial<WebinarEventRow> = {},
): WebinarEventRow => ({
  event_type,
  occurred_at,
  ...extra,
});

describe("webinar event pipeline", () => {
  it("uses stable provider IDs and deterministic fallback keys", () => {
    expect(
      webinarEventKey({
        eventType: "registered",
        occurredAt: "2026-08-27T10:00:00Z",
        leadId: "lead-1",
        providerEventId: "evt-1",
      }),
    ).toBe("provider:evt-1");
    expect(
      webinarEventKey({
        eventType: "registered",
        occurredAt: "2026-08-27T10:00:00Z",
        leadId: "lead-1",
        providerEventId: null,
      }),
    ).toBe("registered:2026-08-27T10:00:00Z:lead-1");
  });

  it("counts only persisted milestones and leaves absent stages at zero", () => {
    const events = [
      event("registered", "2026-08-27T10:00:00Z"),
      event("joined", "2026-08-27T10:05:00Z"),
      event("pitch", "2026-08-27T10:45:00Z"),
      event("chat", "2026-08-27T10:20:00Z"),
      event("replay_started", "2026-08-28T10:00:00Z"),
    ];
    expect(webinarEventCounts(events)).toMatchObject({
      registrations: 1,
      liveAttendees: 1,
      pitchAttendees: 1,
      applications: 0,
      bookedCalls: 0,
      closes: 0,
      engagement: 1,
      replayStarts: 1,
    });
  });

  it("sorts by occurred_at rather than insertion order", () => {
    const retention = retentionFromEvents([
      event("pitch", "2026-08-27T10:45:00Z", { metadata: { audience_remaining: 1 } }),
      event("joined", "2026-08-27T10:05:00Z"),
      event("registered", "2026-08-27T10:00:00Z"),
    ]);
    expect(retention.map((point) => point.label)).toEqual([
      "Registered",
      "Live attendance",
      "At pitch",
    ]);
    expect(retention.at(-1)?.audience).toBe(1);
    expect(retention.at(-1)?.dropOff).toBe(0);
  });

  it("does not fabricate a pitch point when no pitch event exists", () => {
    const retention = retentionFromEvents([
      event("registered", "2026-08-27T10:00:00Z"),
      event("joined", "2026-08-27T10:05:00Z"),
    ]);
    expect(retention.map((point) => point.label)).toEqual(["Registered", "Live attendance"]);
  });

  describe("splitPitchOutcomes", () => {
    it("classifies a close with no prior booked_call as during-pitch", () => {
      const split = splitPitchOutcomes([
        event("close", "2026-08-27T10:50:00Z", { lead_id: "lead-1" }),
      ]);
      expect(split.duringPitchSales).toBe(1);
      expect(split.afterPitchSales).toBe(0);
    });

    it("classifies a close after a booked_call for the same lead as after-pitch", () => {
      const split = splitPitchOutcomes([
        event("booked_call", "2026-08-27T11:00:00Z", { lead_id: "lead-1" }),
        event("close", "2026-08-29T15:00:00Z", { lead_id: "lead-1" }),
      ]);
      expect(split.afterPitchSales).toBe(1);
      expect(split.duringPitchSales).toBe(0);
    });

    it("does not misclassify a different lead's during-pitch close using another lead's booked_call", () => {
      const split = splitPitchOutcomes([
        event("booked_call", "2026-08-27T11:00:00Z", { lead_id: "lead-1" }),
        event("close", "2026-08-27T10:50:00Z", { lead_id: "lead-2" }),
      ]);
      expect(split.duringPitchSales).toBe(1);
      expect(split.afterPitchSales).toBe(0);
    });

    it("sums revenue only from events carrying a real amount_cents, leaving the rest null", () => {
      const split = splitPitchOutcomes([
        event("close", "2026-08-27T10:50:00Z", {
          lead_id: "lead-1",
          metadata: { amount_cents: 50000 },
        }),
        event("close", "2026-08-27T10:55:00Z", { lead_id: "lead-2" }),
      ]);
      expect(split.duringPitchSales).toBe(2);
      expect(split.duringPitchRevenueCents).toBe(50000);
      expect(split.duringPitchRevenueEventCount).toBe(1);
    });

    it("returns null revenue (not zero) when no counted event has an amount", () => {
      const split = splitPitchOutcomes([event("close", "2026-08-27T10:50:00Z", { lead_id: "l" })]);
      expect(split.duringPitchRevenueCents).toBeNull();
      expect(split.afterPitchRevenueCents).toBeNull();
    });
  });
});
