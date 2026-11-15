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
  /** The number the invitee gave for SMS reminders, when the event asks. */
  text_reminder_number?: string | null;
  old_invitee?: string | null;
  new_invitee?: string | null;
  no_show?: unknown;
  /** Set on a canceled invitee: who cancelled, and the reason they typed. */
  cancellation?: {
    canceled_by?: string | null;
    reason?: string | null;
    canceler_type?: string | null;
  } | null;
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
  /** The lead this booking belongs to (calendly-leads.server.ts). */
  leadId?: string | null;
}) {
  const { orgId, invitee, scheduledEvent, rescheduledFrom, leadId } = params;
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
    //
    // Written to the attribution columns `calls` already has, the same
    // mapping the Typeform handler uses for leads: utm_source is the raw
    // platform (normalizeAcquisitionSource categorises it at read time) and
    // utm_campaign the campaign. This used to write utm_source / utm_medium /
    // utm_campaign, which `calls` has never had — every booking upsert failed
    // with PGRST204 and returned a 500, so no Calendly booking landed at all.
    // utm_medium has no column on calls and is not forced into source_format,
    // which means something else.
    //
    // Only set when present, so a reschedule arriving without tracking does
    // not blank attribution an earlier delivery recorded.
    ...(t?.utm_source ? { source_platform: t.utm_source } : {}),
    ...(t?.utm_campaign ? { source_campaign: t.utm_campaign } : {}),
    rescheduled_from_external_id: rescheduledFrom ?? null,
    // Only set when known, so a retry that fails to resolve the lead does not
    // unlink a booking an earlier delivery already linked.
    ...(leadId ? { lead_id: leadId } : {}),
  };
}

/**
 * A new lead from a booking nobody had a lead for — someone who went
 * straight to the calendar link. Same attribution mapping as the Typeform
 * handler: utm_source is the raw platform, utm_campaign the campaign.
 */
export function calendlyInviteeToLeadRow(orgId: string, invitee: CalendlyInvitee) {
  const t = invitee.tracking ?? null;
  return {
    org_id: orgId,
    full_name: invitee.name?.trim() || null,
    email: invitee.email?.trim() || null,
    phone: invitee.text_reminder_number?.trim() || null,
    source_connector: "calendly",
    // They booked, so that is where they are — not "DM received".
    status: "call_booked" as const,
    source_platform: t?.utm_source ?? null,
    source_campaign: t?.utm_campaign ?? null,
    source_medium: t?.utm_medium ?? null,
    source_content_tag: t?.utm_content ?? null,
  };
}
