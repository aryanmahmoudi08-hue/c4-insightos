import type { SupabaseClient } from "@supabase/supabase-js";

export type LifecycleEventType =
  | "lead_created"
  | "lead_assigned"
  | "first_attempt"
  | "first_connection"
  | "qualified_conversation"
  | "set"
  | "booked_call"
  | "showed"
  | "offer"
  | "close"
  | "cash_collected";

export type LifecycleEventInput = {
  orgId: string;
  leadId: string;
  eventType: LifecycleEventType;
  eventAt: string;
  idempotencyKey: string;
  repId?: string | null;
  sourcePlatform?: string | null;
  leadSource?: string | null;
  campaign?: string | null;
  contentId?: string | null;
  format?: string | null;
  webinarId?: string | null;
  callId?: string | null;
  clientId?: string | null;
  paymentId?: string | null;
  payload?: Record<string, unknown>;
};

/**
 * Assignment is the authoritative Speed to Lead start timestamp. Creation is
 * the documented fallback when assignment was never recorded.
 */
export function responseStartTimestamp(event: {
  leadAssignedAt?: string | null;
  leadCreatedAt?: string | null;
}) {
  return event.leadAssignedAt ?? event.leadCreatedAt ?? null;
}

/**
 * Writes through the existing lead_response_events table and its idempotent
 * database function. Retries with the same key do not append a second event.
 */
export type CallLifecycleRecord = {
  id: string;
  scheduledFor?: string | null;
  updatedAt?: string | null;
  showedAt?: string | null;
  offerAt?: string | null;
  showed?: boolean | null;
  offerMade?: boolean | null;
  closed?: boolean | null;
  cashCollectedCents?: number | null;
};

export function lifecycleEventsForCallRecord(call: CallLifecycleRecord) {
  const events: Array<{
    eventType: LifecycleEventType;
    eventAt: string;
    idempotencyKey: string;
    payload?: Record<string, unknown>;
  }> = [];
  if (call.scheduledFor) {
    events.push({
      eventType: "booked_call",
      eventAt: call.scheduledFor,
      idempotencyKey: `call:${call.id}:booked`,
    });
  }
  const actionAt = call.updatedAt ?? null;
  if (call.showed && (call.showedAt ?? actionAt)) {
    events.push({
      eventType: "showed",
      eventAt: call.showedAt ?? actionAt!,
      idempotencyKey: `call:${call.id}:showed`,
    });
  }
  if (call.offerMade && (call.offerAt ?? actionAt)) {
    events.push({
      eventType: "offer",
      eventAt: call.offerAt ?? actionAt!,
      idempotencyKey: `call:${call.id}:offer`,
    });
  }
  if (actionAt && call.closed) {
    events.push({ eventType: "close", eventAt: actionAt, idempotencyKey: `call:${call.id}:close` });
  }
  if (actionAt && Number(call.cashCollectedCents ?? 0) > 0) {
    events.push({
      eventType: "cash_collected",
      eventAt: actionAt,
      idempotencyKey: `call:${call.id}:cash:${call.cashCollectedCents}`,
      payload: { cashCollectedCents: call.cashCollectedCents },
    });
  }
  return events;
}

export async function captureLifecycleEvent(supabase: SupabaseClient, input: LifecycleEventInput) {
  const { data, error } = await supabase.rpc("record_lead_lifecycle_event", {
    p_org_id: input.orgId,
    p_lead_id: input.leadId,
    p_event_type: input.eventType,
    p_event_at: input.eventAt,
    p_idempotency_key: input.idempotencyKey,
    p_rep_id: input.repId ?? null,
    p_source_platform: input.sourcePlatform ?? null,
    p_lead_source: input.leadSource ?? null,
    p_campaign: input.campaign ?? null,
    p_content_id: input.contentId ?? null,
    p_format: input.format ?? null,
    p_webinar_id: input.webinarId ?? null,
    p_call_id: input.callId ?? null,
    p_client_id: input.clientId ?? null,
    p_payment_id: input.paymentId ?? null,
    p_payload: input.payload ?? {},
  });
  if (error) throw new Error(`Lifecycle event capture failed: ${error.message}`);
  return { accepted: data === true };
}
