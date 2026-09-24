import { describe, expect, it } from "vitest";
import { createHmac } from "crypto";
import {
  CALENDLY_TOLERANCE_SECONDS,
  calendlyBookingToCallRow,
  calendlyJoinLink,
  calendlySignedPayload,
  classifyCalendlyChange,
  isCalendlyTimestampFresh,
  parseCalendlySignatureHeader,
} from "./calendly";

const NOW = new Date("2026-09-24T12:00:00.000Z");
const NOW_SECS = Math.floor(NOW.getTime() / 1000);

describe("signature header", () => {
  it("parses Calendly's t=,v1= format", () => {
    expect(parseCalendlySignatureHeader("t=1727179200,v1=abc123")).toEqual({
      timestamp: "1727179200",
      signature: "abc123",
    });
  });

  it("tolerates spacing and extra parts, rejects anything missing a half", () => {
    expect(parseCalendlySignatureHeader("t=1, v1=xy, v0=ignored")).toEqual({
      timestamp: "1",
      signature: "xy",
    });
    expect(parseCalendlySignatureHeader("t=1")).toBeNull();
    expect(parseCalendlySignatureHeader("v1=xy")).toBeNull();
    expect(parseCalendlySignatureHeader(null)).toBeNull();
  });
});

describe("signed payload", () => {
  it("is timestamp + '.' + the RAW body", () => {
    expect(calendlySignedPayload("123", '{"a":1}')).toBe('123.{"a":1}');
  });

  it("verifies against an HMAC built the documented way", () => {
    const body = '{"event":"invitee.created","payload":{"uri":"u1"}}';
    const key = "sk_test_signing_key";
    const expected = createHmac("sha256", key)
      .update(calendlySignedPayload(String(NOW_SECS), body))
      .digest("hex");
    const parsed = parseCalendlySignatureHeader(`t=${NOW_SECS},v1=${expected}`)!;
    const recomputed = createHmac("sha256", key)
      .update(calendlySignedPayload(parsed.timestamp, body))
      .digest("hex");
    expect(recomputed).toBe(parsed.signature);
  });

  it("a re-serialized body produces a different signature — raw body only", () => {
    // JSON.parse -> JSON.stringify drops the original spacing, which is why
    // the receiver must never verify against a re-serialized body.
    const raw = '{ "event": "invitee.created" }';
    const reserialized = JSON.stringify(JSON.parse(raw));
    expect(calendlySignedPayload("1", raw)).not.toBe(calendlySignedPayload("1", reserialized));
  });
});

describe("timestamp freshness", () => {
  it("accepts inside the 3-minute window, rejects outside it", () => {
    expect(isCalendlyTimestampFresh(String(NOW_SECS), NOW)).toBe(true);
    expect(isCalendlyTimestampFresh(String(NOW_SECS - CALENDLY_TOLERANCE_SECONDS + 5), NOW)).toBe(
      true,
    );
    expect(isCalendlyTimestampFresh(String(NOW_SECS - CALENDLY_TOLERANCE_SECONDS - 5), NOW)).toBe(
      false,
    );
  });

  it("rejects a future timestamp just as firmly as a stale one", () => {
    expect(isCalendlyTimestampFresh(String(NOW_SECS + 600), NOW)).toBe(false);
  });

  it("rejects a non-numeric timestamp", () => {
    expect(isCalendlyTimestampFresh("not-a-number", NOW)).toBe(false);
  });
});

describe("classifying a booking change", () => {
  it("a plain booking has no predecessor", () => {
    expect(classifyCalendlyChange("invitee.created", { uri: "new" })).toEqual({
      kind: "booked",
      rescheduledFrom: null,
    });
  });

  it("the new half of a reschedule carries the invitee it replaced", () => {
    expect(
      classifyCalendlyChange("invitee.created", {
        uri: "new",
        rescheduled: true,
        old_invitee: "old-uri",
      }),
    ).toEqual({ kind: "booked", rescheduledFrom: "old-uri" });
  });

  it("the old half of a reschedule is superseded, NOT a cancellation", () => {
    // Calendly has no reschedule event: it fires canceled + created. Treating
    // the canceled half as a lost booking would leave the calendar showing a
    // cancellation with no successor.
    expect(
      classifyCalendlyChange("invitee.canceled", { uri: "old", new_invitee: "new-uri" }),
    ).toEqual({ kind: "superseded", replacedBy: "new-uri" });
  });

  it("a real cancellation has no successor", () => {
    expect(classifyCalendlyChange("invitee.canceled", { uri: "gone" })).toEqual({
      kind: "cancelled",
    });
  });

  it("ignores event types this integration doesn't handle", () => {
    expect(classifyCalendlyChange("routing_form_submission.created", {})).toBeNull();
  });
});

describe("join link", () => {
  it("prefers a conferencing join_url, falls back to a stated location", () => {
    expect(calendlyJoinLink({ location: { type: "zoom", join_url: "https://zoom/j/1" } })).toBe(
      "https://zoom/j/1",
    );
    expect(calendlyJoinLink({ location: { type: "physical", location: "123 Main St" } })).toBe(
      "123 Main St",
    );
    expect(calendlyJoinLink({ location: null })).toBeNull();
    expect(calendlyJoinLink(null)).toBeNull();
  });
});

describe("mapping to a calls row", () => {
  const invitee = {
    uri: "https://api.calendly.com/scheduled_events/E1/invitees/I1",
    email: "lead@example.com",
    name: "Jordan Ellis",
    cancel_url: "https://calendly.com/cancellations/X",
    reschedule_url: "https://calendly.com/reschedulings/X",
    tracking: { utm_source: "meta", utm_medium: "paid", utm_campaign: "evergreen" },
  };
  const scheduledEvent = {
    start_time: "2026-10-01T15:00:00.000000Z",
    location: { type: "zoom", join_url: "https://zoom/j/9" },
  };

  it("takes scheduled_for from the fetched event, not the webhook payload", () => {
    // invitee.event is only a URI — the start time is not in the webhook.
    const row = calendlyBookingToCallRow({ orgId: "org-1", invitee, scheduledEvent });
    expect(row.scheduled_for).toBe("2026-10-01T15:00:00.000000Z");
    expect(row.external_id).toBe(invitee.uri);
    expect(row.source_connector).toBe("calendly");
    expect(row.meeting_link).toBe("https://zoom/j/9");
  });

  it("carries the booking's UTMs through, closing the click-to-call gap", () => {
    const row = calendlyBookingToCallRow({ orgId: "org-1", invitee, scheduledEvent });
    expect(row.utm_source).toBe("meta");
    expect(row.utm_medium).toBe("paid");
    expect(row.utm_campaign).toBe("evergreen");
  });

  it("leaves scheduled_for null rather than guessing when the event fetch failed", () => {
    const row = calendlyBookingToCallRow({ orgId: "org-1", invitee, scheduledEvent: null });
    expect(row.scheduled_for).toBeNull();
    expect(row.meeting_link).toBeNull();
  });

  it("records the predecessor on a rescheduled booking", () => {
    const row = calendlyBookingToCallRow({
      orgId: "org-1",
      invitee,
      scheduledEvent,
      rescheduledFrom: "old-invitee-uri",
    });
    expect(row.rescheduled_from_external_id).toBe("old-invitee-uri");
  });
});
