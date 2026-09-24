/**
 * Calendly webhook primitives — signature verification and payload mapping.
 *
 * Pure: no network, no Supabase, so the parts that fail silently when wrong
 * (signature construction, reschedule detection) are unit-testable without a
 * paid Calendly account.
 *
 * Shapes and the signature scheme are Calendly's own, read from their docs:
 * https://developer.calendly.com/api-docs/overview/webhooks/webhook-signatures
 */

/** Calendly's documented replay window. */
export const CALENDLY_TOLERANCE_SECONDS = 180;

/** `Calendly-Webhook-Signature: t=<timestamp>,v1=<hex>` */
export function parseCalendlySignatureHeader(
  header: string | null,
): { timestamp: string; signature: string } | null {
  if (!header) return null;
  let timestamp = "";
  let signature = "";
  for (const part of header.split(",")) {
    const [k, v] = part.split("=", 2);
    if (k?.trim() === "t") timestamp = (v ?? "").trim();
    else if (k?.trim() === "v1") signature = (v ?? "").trim();
  }
  if (!timestamp || !signature) return null;
  return { timestamp, signature };
}

/** The exact string Calendly signs: the timestamp, a literal ".", then the
 * RAW body. Parsing the body first and re-serializing produces a different
 * string and every delivery fails — hence raw-body-only here. */
export function calendlySignedPayload(timestamp: string, rawBody: string): string {
  return `${timestamp}.${rawBody}`;
}

/** Outside the tolerance window the delivery is a replay (or a badly skewed
 * clock) and must be rejected even if the HMAC matches. */
export function isCalendlyTimestampFresh(
  timestamp: string,
  now: Date = new Date(),
  toleranceSeconds: number = CALENDLY_TOLERANCE_SECONDS,
): boolean {
  const t = Number(timestamp);
  if (!Number.isFinite(t)) return false;
  return Math.abs(now.getTime() / 1000 - t) <= toleranceSeconds;
}

/* ------------------------------------------------------------------ *
 * Payload mapping
 * ------------------------------------------------------------------ */

/** The Invitee object Calendly puts in `payload` for invitee.* events.
 * Field names are Calendly's (developer.calendly.com, Get Event Invitee). */
export type CalendlyInvitee = {
  uri?: string;
  email?: string;
  name?: string;
  status?: string;
  timezone?: string;
  /** A URI STRING pointing at the scheduled event — not a nested object. The
   * start time lives behind this and needs a separate API read. */
  event?: string;
  cancel_url?: string;
  reschedule_url?: string;
  rescheduled?: boolean;
  old_invitee?: string | null;
  new_invitee?: string | null;
  no_show?: unknown;
  tracking?: {
    utm_source?: string | null;
    utm_medium?: string | null;
    utm_campaign?: string | null;
    utm_content?: string | null;
    utm_term?: string | null;
  } | null;
  questions_and_answers?: Array<{ question?: string; answer?: string; position?: number }>;
};

export type CalendlyWebhookBody = {
  event?: string;
  created_at?: string;
  payload?: CalendlyInvitee;
};

/** The scheduled event behind `invitee.event`, fetched separately. */
export type CalendlyScheduledEvent = {
  uri?: string;
  name?: string;
  start_time?: string;
  end_time?: string;
  status?: string;
  location?: { type?: string; join_url?: string; location?: string } | null;
};

export const CALENDLY_HANDLED_EVENTS = ["invitee.created", "invitee.canceled"] as const;

/**
 * A reschedule is not its own event type. Calendly fires `invitee.canceled`
 * for the old slot and `invitee.created` for the new one, and links them with
 * `rescheduled` / `old_invitee` / `new_invitee`.
 *
 * Treating the cancellation half as a plain cancellation would leave the
 * calendar showing a cancelled call with no successor, so the two halves are
 * classified here rather than at the call site.
 */
export type CalendlyBookingChange =
  | { kind: "booked"; rescheduledFrom: string | null }
  | { kind: "cancelled" }
  | { kind: "superseded"; replacedBy: string };

export function classifyCalendlyChange(
  eventType: string,
  invitee: CalendlyInvitee,
): CalendlyBookingChange | null {
  if (eventType === "invitee.created") {
    return {
      kind: "booked",
      // Present only when this booking replaced an earlier one.
      rescheduledFrom: invitee.rescheduled ? (invitee.old_invitee ?? null) : null,
    };
  }
  if (eventType === "invitee.canceled") {
    // The old half of a reschedule points forward at its replacement. That's
    // a move, not a lost booking.
    if (invitee.new_invitee) return { kind: "superseded", replacedBy: invitee.new_invitee };
    return { kind: "cancelled" };
  }
  return null;
}

/** Meeting join link, when Calendly carries one (Zoom/Meet/Teams set
 * `join_url`; a physical or custom location sets `location` instead). */
export function calendlyJoinLink(event: CalendlyScheduledEvent | null): string | null {
  if (!event?.location) return null;
  return event.location.join_url ?? event.location.location ?? null;
}

/** Columns for `public.calls` from one booking. `scheduled_for` comes from the
 * separately-fetched scheduled event, because the webhook's invitee payload
 * only carries a URI for it. */
export function calendlyBookingToCallRow(params: {
  orgId: string;
  invitee: CalendlyInvitee;
  scheduledEvent: CalendlyScheduledEvent | null;
  rescheduledFrom?: string | null;
}) {
  const { orgId, invitee, scheduledEvent, rescheduledFrom } = params;
  const t = invitee.tracking ?? null;
  return {
    org_id: orgId,
    source_connector: "calendly",
    external_id: invitee.uri ?? null,
    scheduled_for: scheduledEvent?.start_time ?? null,
    lead_email: invitee.email ?? null,
    cancelled: false,
    calendly_cancel_url: invitee.cancel_url ?? null,
    calendly_reschedule_url: invitee.reschedule_url ?? null,
    meeting_link: calendlyJoinLink(scheduledEvent),
    // Real attribution straight off the booking link — Calendly carries the
    // UTMs the invitee arrived with, which is otherwise a gap between the ad
    // click and the booked call.
    utm_source: t?.utm_source ?? null,
    utm_medium: t?.utm_medium ?? null,
    utm_campaign: t?.utm_campaign ?? null,
    rescheduled_from_external_id: rescheduledFrom ?? null,
  };
}
