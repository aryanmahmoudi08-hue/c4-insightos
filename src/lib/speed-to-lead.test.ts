import { describe, expect, it } from "vitest";
import {
  calculateSpeedToLead,
  evaluateSpeedToLeadSla,
  buildSpeedToLeadQueue,
  speedToLeadNotificationRequest,
  compareSpeedBuckets,
  filterSpeedEvents,
  speedDistribution,
  speedToLeadSlaForWindow,
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
    // weekday/hourStart are matched with Date#getDay()/getHours(), i.e. in the
    // viewer's local zone — correct for the UI dropdowns that drive them, but
    // it means a hardcoded "...T18:00:00Z" literal only lands on hour 18 when
    // the test runner happens to be on UTC. Build the timestamps from local
    // components instead so the assertions hold in any timezone.
    const mondayMorning = new Date(2026, 7, 24, 9, 0, 0); // Mon 2026-08-24 09:00 local
    const tuesdayEvening = new Date(2026, 7, 25, 18, 0, 0); // Tue 2026-08-25 18:00 local
    const events = [
      {
        repId: "rep-a",
        sourcePlatform: "Instagram",
        leadSource: "inbound",
        campaign: "launch",
        leadCreatedAt: mondayMorning.toISOString(),
      },
      {
        repId: "rep-b",
        sourcePlatform: "YouTube",
        leadSource: "organic",
        campaign: "evergreen",
        leadCreatedAt: tuesdayEvening.toISOString(),
      },
    ];
    expect(tuesdayEvening.getDay()).toBe(2);
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

// Remediation (metric-dictionary audit, SALE-0320): the Targets card's
// Speed-to-Lead SLA Compliance now bridges to this function instead of
// leaving the actual permanently unresolvable — same 5-minute threshold and
// event definition as the page's own Speed-to-Lead section.
describe("speedToLeadSlaForWindow", () => {
  it("computes the 5-minute SLA % using only events inside the given window", () => {
    const events = [
      // Inside window, within 5 minutes.
      { leadCreatedAt: "2026-06-05T10:00:00Z", firstAttemptAt: "2026-06-05T10:03:00Z" },
      // Inside window, outside 5 minutes.
      { leadCreatedAt: "2026-06-10T10:00:00Z", firstAttemptAt: "2026-06-10T10:20:00Z" },
      // Outside window entirely — must not affect the result.
      { leadCreatedAt: "2026-07-01T10:00:00Z", firstAttemptAt: "2026-07-01T10:01:00Z" },
    ];
    expect(speedToLeadSlaForWindow(events, "2026-06-01", "2026-06-30")).toBeCloseTo(50, 5);
  });

  it("returns null (never a fabricated 0%) when nothing in the window was contacted yet", () => {
    const events = [{ leadCreatedAt: "2026-06-05T10:00:00Z", firstAttemptAt: null }];
    expect(speedToLeadSlaForWindow(events, "2026-06-01", "2026-06-30")).toBeNull();
  });

  it("returns null when the rep's event list is empty for this window", () => {
    expect(speedToLeadSlaForWindow([], "2026-06-01", "2026-06-30")).toBeNull();
  });

  it("100% compliance when every contacted lead in the window was reached within 5 minutes", () => {
    const events = [
      { leadCreatedAt: "2026-06-05T10:00:00Z", firstAttemptAt: "2026-06-05T10:01:00Z" },
      { leadCreatedAt: "2026-06-06T10:00:00Z", firstAttemptAt: "2026-06-06T10:04:00Z" },
    ];
    expect(speedToLeadSlaForWindow(events, "2026-06-01", "2026-06-30")).toBe(100);
  });
});
