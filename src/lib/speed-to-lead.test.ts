import { describe, expect, it } from "vitest";
import {
  calculateSpeedToLead,
  evaluateSpeedToLeadSla,
  buildSpeedToLeadQueue,
  speedToLeadNotificationRequest,
  compareSpeedBuckets,
  filterSpeedEvents,
  speedDistribution,
} from "./speed-to-lead";

describe("speed to lead", () => {
  it("prefers assignment time over creation time", () => {
    expect(
      calculateSpeedToLead({
        leadCreatedAt: "2026-08-27T10:00:00Z",
        leadAssignedAt: "2026-08-27T10:04:00Z",
        firstAttemptAt: "2026-08-27T10:09:00Z",
        firstConnectionAt: "2026-08-27T10:14:00Z",
      }),
    ).toEqual({ minutesToAttempt: 5, minutesToConnection: 10 });
  });

  it("classifies the five-minute SLA without treating spam or ineligible leads as misses", () => {
    expect(
      evaluateSpeedToLeadSla(
        {
          leadId: "lead-1",
          leadCreatedAt: "2026-08-27T10:00:00Z",
          firstAttemptAt: "2026-08-27T10:04:00Z",
        },
        new Date("2026-08-27T10:10:00Z"),
      ),
    ).toMatchObject({ status: "met", immediateActionRequired: false, minutesToAttempt: 4 });
    expect(
      evaluateSpeedToLeadSla(
        { leadId: "lead-2", leadCreatedAt: "2026-08-27T10:00:00Z" },
        new Date("2026-08-27T10:06:00Z"),
      ),
    ).toMatchObject({ status: "breached", immediateActionRequired: true });
    expect(
      evaluateSpeedToLeadSla(
        { leadId: "lead-3", leadCreatedAt: "2026-08-27T10:00:00Z", spam: true },
        new Date("2026-08-27T10:30:00Z"),
      ),
    ).toMatchObject({ status: "ineligible", immediateActionRequired: false });
  });

  it("builds an actionable queue and prevents duplicate notifications", () => {
    const events = [
      { leadId: "lead-1", repId: "rep-1", leadCreatedAt: "2026-08-27T10:00:00Z" },
      { leadId: "lead-2", leadCreatedAt: "2026-08-27T10:00:00Z" },
      { leadId: "lead-3", spam: true, leadCreatedAt: "2026-08-27T10:00:00Z" },
    ];
    const queue = buildSpeedToLeadQueue(events, new Date("2026-08-27T10:06:00Z"));
    expect(queue).toHaveLength(2);
    expect(queue[0]).toMatchObject({
      status: "breached",
      deliveryStatus: "ready",
      ownerId: "rep-1",
    });
    expect(queue[1]).toMatchObject({ status: "breached", deliveryStatus: "owner-missing" });
    expect(
      buildSpeedToLeadQueue(events, new Date("2026-08-27T10:06:00Z"), [
        "speed-to-lead:lead-1:2026-08-27T10:00:00Z",
      ])[0].deliveryStatus,
    ).toBe("already-notified");
  });

  it("exposes connector and persisted delivery states without claiming delivery", () => {
    const event = { leadId: "lead-1", repId: "rep-1", leadCreatedAt: "2026-08-27T10:00:00Z" };
    const now = new Date("2026-08-27T10:06:00Z");
    expect(buildSpeedToLeadQueue([event], now, [], { connectorAvailable: false })[0]).toMatchObject(
      {
        deliveryStatus: "connector-unavailable",
      },
    );
    expect(
      buildSpeedToLeadQueue([event], now, [], {
        connectorAvailable: true,
        deliveryAudit: [
          { notificationKey: "speed-to-lead:lead-1:2026-08-27T10:00:00Z", status: "sent" },
        ],
      })[0].deliveryStatus,
    ).toBe("sent");
    expect(
      buildSpeedToLeadQueue([event], now, [], {
        connectorAvailable: true,
        deliveryAudit: [
          { notificationKey: "speed-to-lead:lead-1:2026-08-27T10:00:00Z", status: "failed" },
        ],
      })[0].deliveryStatus,
    ).toBe("failed");
  });

  it("creates a provider-neutral notification request only for actionable items", () => {
    const queue = buildSpeedToLeadQueue(
      [{ leadId: "lead-1", repId: "rep-1", leadCreatedAt: "2026-08-27T10:00:00Z" }],
      new Date("2026-08-27T10:06:00Z"),
    );
    expect(speedToLeadNotificationRequest("org-1", queue[0])).toMatchObject({
      event: "speed_to_lead.breached",
      recipient: "rep-1",
      idempotencyKey: "speed-to-lead:lead-1:2026-08-27T10:00:00Z",
    });
    expect(
      speedToLeadNotificationRequest("org-1", {
        ...queue[0],
        immediateActionRequired: false,
      }),
    ).toBeNull();
  });

  it("returns null when a timestamp is unavailable", () => {
    expect(calculateSpeedToLead({ leadCreatedAt: "2026-08-27T10:00:00Z" })).toEqual({
      minutesToAttempt: null,
      minutesToConnection: null,
    });
  });

  it("reports response distributions and uncontacted leads", () => {
    const result = speedDistribution([
      { leadCreatedAt: "2026-08-27T10:00:00Z", firstAttemptAt: "2026-08-27T10:01:00Z" },
      { leadCreatedAt: "2026-08-27T10:00:00Z", firstAttemptAt: "2026-08-27T10:40:00Z" },
      { leadCreatedAt: "2026-08-27T10:00:00Z" },
    ]);
    expect(result.contacted).toBe(2);
    expect(result.uncontacted).toBe(1);
    expect(result.within[1]).toBe(1);
    expect(result.afterOneHour).toBe(0);
  });

  it("reports fastest, slowest, and named threshold buckets", () => {
    const result = speedDistribution([
      { leadCreatedAt: "2026-08-27T10:00:00Z", firstAttemptAt: "2026-08-27T10:00:30Z" },
      { leadCreatedAt: "2026-08-27T10:00:00Z", firstAttemptAt: "2026-08-27T12:00:00Z" },
    ]);
    expect(result.fastestMinutes).toBe(0.5);
    expect(result.slowestMinutes).toBe(120);
    expect(result.buckets.underOneMinute).toBe(1);
    expect(result.buckets.overOneHour).toBe(1);
  });

  it("filters event segments by rep, source, campaign, weekday, and time", () => {
    const events = [
      {
        repId: "rep-a",
        sourcePlatform: "Instagram",
        leadSource: "inbound",
        campaign: "launch",
        leadCreatedAt: "2026-08-24T09:00:00Z",
      },
      {
        repId: "rep-b",
        sourcePlatform: "YouTube",
        leadSource: "organic",
        campaign: "evergreen",
        leadCreatedAt: "2026-08-25T18:00:00Z",
      },
    ];
    expect(
      filterSpeedEvents(events, {
        repId: "rep-a",
        sourcePlatform: "Instagram",
        campaign: "launch",
      }),
    ).toHaveLength(1);
    expect(filterSpeedEvents(events, { weekday: 2, hourStart: 17 })).toHaveLength(1);
  });

  it("compares downstream outcomes observationally by response bucket", () => {
    const result = compareSpeedBuckets([
      { minutesToAttempt: 2, qualified: true, set: true, close: false },
      { minutesToAttempt: 40, qualified: false, set: false, close: false },
    ]);
    expect(result.underFive.qualificationRate).toBe(1);
    expect(result.thirtyPlus.qualificationRate).toBe(0);
  });
});
