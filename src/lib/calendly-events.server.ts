/**
 * #calls-booked, #calls-cancelled and #calls-rescheduled, from the Calendly
 * webhook rather than from Zapier.
 *
 * Posting from here is what lets the message carry what Calendly alone does
 * not know — the lead's application answers (salary, budget, credit),
 * LinkedIn, and the lead id for the AscendOS link — because by the time it
 * fires, the booking is linked to its lead (calendly-leads.server.ts).
 *
 * Each is fired once per Calendly invitee, so a retried delivery does not
 * post twice. Never throws: the booking itself is already recorded.
 */
import { findLinkedIn } from "./discord-format";
import { callPayload } from "./event-emitters.server";
import { db, fireOnce, loadNotificationSettings } from "./notify.server";

type Change =
  | {
      kind: "booked" | "rescheduled";
      callId: string;
      inviteeUri: string;
      rescheduledFrom?: string | null;
      apiToken: string;
      /** The Calendly booking form's answers — LinkedIn when the lead never applied. */
      bookingAnswers?: Array<{ question?: string; answer?: string }>;
    }
  | {
      kind: "cancelled";
      callId: string;
      inviteeUri: string;
      cancellationReason: string | null;
      apiToken: string;
    };

const EVENT = {
  booked: "call.booked",
  rescheduled: "call.rescheduled",
  cancelled: "call.cancelled",
};

export async function announceCalendlyChange(orgId: string, change: Change) {
  try {
    const [built, settings] = await Promise.all([
      callPayload(orgId, change.callId),
      loadNotificationSettings(orgId),
    ]);
    if (!built) return;
    const payload: Record<string, unknown> = {
      ...built.payload,
      time_zone: settings.timeZone || null,
    };
    // A lead who booked without applying has no LinkedIn from Typeform; the
    // Calendly booking form may have asked for it.
    if (change.kind !== "cancelled" && change.bookingAnswers?.length) {
      const lead = (payload.lead ?? {}) as Record<string, unknown>;
      if (!lead.linkedin) {
        const linkedin = findLinkedIn(
          Object.fromEntries(change.bookingAnswers.map((a, i) => [i, a.answer ?? ""])),
        );
        if (linkedin) payload.lead = { ...lead, linkedin };
      }
    }
    if (change.kind === "cancelled") {
      payload.cancellation_reason = change.cancellationReason?.trim() || null;
    }
    if (change.kind === "rescheduled" && change.rescheduledFrom) {
      const previous = await previousBooking(orgId, change.rescheduledFrom, change.apiToken);
      payload.previous_scheduled_for = previous.scheduledFor;
      payload.reschedule_reason = previous.reason;
    }
    await fireOnce(
      orgId,
      EVENT[change.kind],
      change.inviteeUri,
      { type: "call", id: change.callId },
      payload,
    );
  } catch (err) {
    console.error(`announceCalendlyChange ${change.kind}:`, err);
  }
}

/**
 * The slot a reschedule moved away from, and why. The time is on the old
 * booking's call row; the reason the invitee typed is only on Calendly's
 * record of the old invitee (the new booking does not carry it), so that is
 * read from the API. Both are best-effort — a missing one is left out of
 * the message, not guessed.
 */
async function previousBooking(orgId: string, oldInviteeUri: string, apiToken: string) {
  const { data: old } = await db
    .from("calls")
    .select("scheduled_for")
    .eq("org_id", orgId)
    .eq("source_connector", "calendly")
    .eq("external_id", oldInviteeUri)
    .maybeSingle();
  let scheduledFor = (old?.scheduled_for as string | null | undefined) ?? null;
  let reason: string | null = null;
  if (apiToken && /^https:\/\/api\.calendly\.com\//.test(oldInviteeUri)) {
    try {
      const res = await fetch(oldInviteeUri, { headers: { Authorization: `Bearer ${apiToken}` } });
      if (res.ok) {
        const body = (await res.json()) as {
          resource?: { cancellation?: { reason?: string | null } | null; event?: string };
        };
        reason = body.resource?.cancellation?.reason?.trim() || null;
        // The old booking predates the connector: read its time from its event.
        if (
          !scheduledFor &&
          body.resource?.event &&
          /^https:\/\/api\.calendly\.com\//.test(body.resource.event)
        ) {
          const ev = await fetch(body.resource.event, {
            headers: { Authorization: `Bearer ${apiToken}` },
          });
          if (ev.ok) {
            const e = (await ev.json()) as { resource?: { start_time?: string } };
            scheduledFor = e.resource?.start_time ?? null;
          }
        }
      }
    } catch (err) {
      console.error("[calendly] previous booking lookup", err);
    }
  }
  return { scheduledFor, reason };
}
