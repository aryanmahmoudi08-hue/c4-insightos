import { describe, expect, it } from "vitest";
import { lifecycleEventsFromTwilioVoice } from "./crm-lifecycle-ingestion";

const base = {
  orgId: "org-1",
  leadId: "lead-1",
  providerEventId: "voice:CA123:initiated",
  callSid: "CA123",
  callStatus: "initiated",
  occurredAt: "2026-08-27T12:00:00Z",
};

describe("provider lifecycle normalization", () => {
  it("maps a provider-confirmed initiated call to first_attempt using provider time", () => {
    expect(lifecycleEventsFromTwilioVoice(base)).toEqual([
      expect.objectContaining({
        eventType: "first_attempt",
        eventAt: "2026-08-27T12:00:00.000Z",
        idempotencyKey: "twilio:voice:CA123:initiated:first_attempt",
        callId: "CA123",
      }),
    ]);
  });

  it("maps answered only to first_connection and never infers qualification or set", () => {
    const result = lifecycleEventsFromTwilioVoice({
      ...base,
      providerEventId: "voice:CA123:answered",
      callStatus: "answered",
    });
    expect(result).toEqual([expect.objectContaining({ eventType: "first_connection" })]);
    expect(
      result.some(
        (event) => event.eventType === "qualified_conversation" || event.eventType === "set",
      ),
    ).toBe(false);
  });

  it("is stable across repeated delivery of the same provider event", () => {
    const first = lifecycleEventsFromTwilioVoice(base);
    const retry = lifecycleEventsFromTwilioVoice(base);
    expect(retry).toEqual(first);
    expect(retry[0]?.idempotencyKey).toBe(first[0]?.idempotencyKey);
  });

  it("does not fabricate an event without an explicit lead or provider timestamp", () => {
    expect(lifecycleEventsFromTwilioVoice({ ...base, leadId: null })).toEqual([]);
    expect(lifecycleEventsFromTwilioVoice({ ...base, occurredAt: null })).toEqual([]);
  });
});
