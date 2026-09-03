import { describe, expect, it } from "vitest";
import {
  lifecycleEventsForCallRecord,
  responseStartTimestamp,
  type LifecycleEventInput,
} from "./lifecycle-events";

describe("lifecycle event contract", () => {
  it("prefers assignment over creation for Speed to Lead", () => {
    expect(
      responseStartTimestamp({
        leadCreatedAt: "2026-08-27T10:00:00Z",
        leadAssignedAt: "2026-08-27T10:04:00Z",
      }),
    ).toBe("2026-08-27T10:04:00Z");
  });

  it("falls back to creation and returns null when unavailable", () => {
    expect(responseStartTimestamp({ leadCreatedAt: "2026-08-27T10:00:00Z" })).toBe(
      "2026-08-27T10:00:00Z",
    );
    expect(responseStartTimestamp({})).toBeNull();
  });

  it("emits only the call outcomes that actually exist, in lifecycle order", () => {
    const events = lifecycleEventsForCallRecord({
      id: "call-1",
      scheduledFor: "2026-08-27T10:00:00Z",
      updatedAt: "2026-08-27T10:05:00Z",
      showed: true,
      offerMade: true,
      closed: true,
      cashCollectedCents: 125000,
    });
    expect(events.map((event) => event.eventType)).toEqual([
      "booked_call",
      "showed",
      "offer",
      "close",
      "cash_collected",
    ]);
    expect(events[0]?.eventAt).toBe("2026-08-27T10:00:00Z");
    expect(events[1]?.eventAt).toBe("2026-08-27T10:05:00Z");
    expect(events.at(-1)?.idempotencyKey).toBe("call:call-1:cash:125000");
  });

  it("prefers exact show and offer timestamps over updated_at", () => {
    const events = lifecycleEventsForCallRecord({
      id: "call-3",
      updatedAt: "2026-08-27T11:00:00Z",
      showedAt: "2026-08-27T10:30:00Z",
      offerAt: "2026-08-27T10:45:00Z",
      showed: true,
      offerMade: true,
    });
    expect(events.map((event) => [event.eventType, event.eventAt])).toEqual([
      ["showed", "2026-08-27T10:30:00Z"],
      ["offer", "2026-08-27T10:45:00Z"],
    ]);
  });

  it("does not fabricate booking or outcome events when source fields are absent", () => {
    expect(
      lifecycleEventsForCallRecord({ id: "call-2", showed: true, offerMade: false, closed: false }),
    ).toEqual([]);
  });

  it("keeps attribution nullable and event keys deterministic", () => {
    const event: LifecycleEventInput = {
      orgId: "org-1",
      leadId: "lead-1",
      eventType: "close",
      eventAt: "2026-08-27T10:00:00Z",
      idempotencyKey: "call:call-1:close",
      repId: "rep-1",
      sourcePlatform: "Instagram",
      leadSource: "inbound",
      campaign: "launch",
      contentId: null,
      format: null,
      webinarId: null,
      callId: "call-1",
    };
    expect(event.idempotencyKey).toBe("call:call-1:close");
    expect(event.contentId).toBeNull();
    expect(event.sourcePlatform).toBe("Instagram");
  });
});
