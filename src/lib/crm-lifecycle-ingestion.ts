import type { LifecycleEventInput } from "./lifecycle-events";

export type TwilioVoiceLifecycleInput = {
  orgId: string;
  leadId: string | null;
  providerEventId: string;
  callSid: string | null;
  callStatus: string | null;
  occurredAt: string | null;
  repId?: string | null;
  sourcePlatform?: string | null;
  leadSource?: string | null;
  campaign?: string | null;
  contentId?: string | null;
  format?: string | null;
  webinarId?: string | null;
};

function validIso(value: string | null | undefined) {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

/**
 * Maps only provider-confirmed Twilio milestones. Missing provider timestamps
 * or lead IDs intentionally produce no lifecycle event rather than a fabricated
 * event using request time or an aggregate record.
 */
export function lifecycleEventsFromTwilioVoice(
  input: TwilioVoiceLifecycleInput,
): LifecycleEventInput[] {
  const eventAt = validIso(input.occurredAt);
  if (!input.leadId || !eventAt) return [];
  const base = {
    orgId: input.orgId,
    leadId: input.leadId,
    eventAt,
    repId: input.repId ?? null,
    sourcePlatform: input.sourcePlatform ?? null,
    leadSource: input.leadSource ?? null,
    campaign: input.campaign ?? null,
    contentId: input.contentId ?? null,
    format: input.format ?? null,
    webinarId: input.webinarId ?? null,
    callId: input.callSid ?? null,
    payload: {
      provider: "twilio",
      providerEventId: input.providerEventId,
      callStatus: input.callStatus,
    },
  } as const;

  const events: LifecycleEventInput[] = [];
  if (input.callStatus === "initiated") {
    events.push({
      ...base,
      eventType: "first_attempt",
      idempotencyKey: `twilio:${input.providerEventId}:first_attempt`,
    });
  }
  if (input.callStatus === "answered") {
    events.push({
      ...base,
      eventType: "first_connection",
      idempotencyKey: `twilio:${input.providerEventId}:first_connection`,
    });
  }
  return events;
}
