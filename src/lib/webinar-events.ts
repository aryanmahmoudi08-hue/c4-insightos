import type { SupabaseClient } from "@supabase/supabase-js";

export const WEBINAR_EVENT_TYPES = [
  "registered",
  "confirmation",
  "notification",
  "live",
  "joined",
  "attended",
  "engagement",
  "chat",
  "question",
  "poll",
  "cta_click",
  "pitch",
  "exited",
  "replay_started",
  "replay_completed",
  "application",
  "booked_call",
  "show",
  "offer",
  "deposit",
  "close",
  "cash",
  "sale",
  "refund",
  "bump",
  "upsell",
] as const;

export type WebinarEventType = (typeof WEBINAR_EVENT_TYPES)[number];
export type WebinarSourceType = "paid" | "organic" | "direct" | "referral" | "unattributed";

export type WebinarEventInput = {
  orgId: string;
  webinarId: string;
  eventType: WebinarEventType;
  occurredAt: string;
  eventKey: string;
  leadId?: string | null;
  sourcePlatform?: string | null;
  sourceType?: WebinarSourceType | null;
  registrationSource?: string | null;
  sourceCampaign?: string | null;
  sourceContentId?: string | null;
  sourceFormat?: string | null;
  providerEventId?: string | null;
  metadata?: Record<string, unknown>;
};

export type WebinarEventRow = {
  id?: string;
  org_id?: string;
  webinar_id?: string;
  lead_id?: string | null;
  event_type: WebinarEventType;
  occurred_at: string;
  source_platform?: string | null;
  source_type?: WebinarSourceType | null;
  registration_source?: string | null;
  source_campaign?: string | null;
  source_content_id?: string | null;
  source_format?: string | null;
  provider_event_id?: string | null;
  event_key?: string | null;
  metadata?: Record<string, unknown> | null;
};

export function webinarEventKey(
  input: Pick<WebinarEventInput, "eventType" | "occurredAt" | "leadId" | "providerEventId">,
) {
  if (input.providerEventId) return `provider:${input.providerEventId}`;
  return [input.eventType, input.occurredAt, input.leadId ?? "anonymous"].join(":");
}

export async function recordWebinarEvent(supabase: SupabaseClient, input: WebinarEventInput) {
  const { data, error } = await supabase.rpc("record_webinar_event", {
    p_org_id: input.orgId,
    p_webinar_id: input.webinarId,
    p_event_type: input.eventType,
    p_occurred_at: input.occurredAt,
    p_event_key: input.eventKey,
    p_lead_id: input.leadId ?? null,
    p_source_platform: input.sourcePlatform ?? null,
    p_source_type: input.sourceType ?? null,
    p_registration_source: input.registrationSource ?? null,
    p_source_campaign: input.sourceCampaign ?? null,
    p_source_content_id: input.sourceContentId ?? null,
    p_source_format: input.sourceFormat ?? null,
    p_provider_event_id: input.providerEventId ?? null,
    p_metadata: input.metadata ?? {},
  });
  if (error) throw new Error(`Webinar event capture failed: ${error.message}`);
  return { accepted: data === true };
}

export function webinarEventCounts(events: WebinarEventRow[]) {
  const count = (types: WebinarEventType[]) =>
    events.filter((event) => types.includes(event.event_type)).length;
  return {
    registrations: count(["registered"]),
    liveAttendees: count(["live", "joined", "attended"]),
    pitchAttendees: count(["pitch"]),
    deposits: count(["deposit"]),
    applications: count(["application"]),
    bookedCalls: count(["booked_call"]),
    shows: count(["show", "attended"]),
    offers: count(["offer"]),
    closes: count(["close", "sale"]),
    cashEvents: count(["cash"]),
    engagement: count(["engagement", "chat", "question", "poll", "cta_click"]),
    replayStarts: count(["replay_started"]),
    replayCompletions: count(["replay_completed"]),
  };
}

export function normalizeWebinarEventType(eventType: string): WebinarEventType | null {
  if (WEBINAR_EVENT_TYPES.includes(eventType as WebinarEventType)) {
    return eventType as WebinarEventType;
  }
  return null;
}

export function eventAtOrBefore(events: WebinarEventRow[], type: WebinarEventType, cutoff: string) {
  return events
    .filter(
      (event) => event.event_type === type && Date.parse(event.occurred_at) <= Date.parse(cutoff),
    )
    .sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at));
}

export type PitchOutcomeSplit = {
  /** Count of close/sale events for a lead with no prior booked_call — a
   * direct, in-webinar checkout. */
  duringPitchSales: number;
  /** Count of close/sale events for a lead who has an earlier booked_call
   * event — went through the sales team's follow-up call. */
  afterPitchSales: number;
  /** Only summed from events whose metadata carries a numeric amount_cents;
   * null (not zero) when no counted event has that field, since the event
   * pipeline does not guarantee per-event dollar amounts. */
  duringPitchRevenueCents: number | null;
  afterPitchRevenueCents: number | null;
  /** How many of the counted sales actually had an amount, for an honest
   * "N of M sales have revenue data" disclosure in the UI. */
  duringPitchRevenueEventCount: number;
  afterPitchRevenueEventCount: number;
};

/**
 * Distinguishes direct, during-pitch checkouts from after-pitch sales-team
 * call outcomes using the real webinar event stream — a "close"/"sale" event
 * for a lead who has an earlier "booked_call" event went through the sales
 * team; one with no prior booked_call was a direct in-webinar purchase.
 */
export function splitPitchOutcomes(events: WebinarEventRow[]): PitchOutcomeSplit {
  const ordered = [...events].sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at));
  const bookedAtByLead = new Map<string, number>();
  for (const event of ordered) {
    if (event.event_type !== "booked_call" || !event.lead_id) continue;
    const occurredAt = Date.parse(event.occurred_at);
    const existing = bookedAtByLead.get(event.lead_id);
    if (existing == null || occurredAt < existing) bookedAtByLead.set(event.lead_id, occurredAt);
  }
  const result: PitchOutcomeSplit = {
    duringPitchSales: 0,
    afterPitchSales: 0,
    duringPitchRevenueCents: null,
    afterPitchRevenueCents: null,
    duringPitchRevenueEventCount: 0,
    afterPitchRevenueEventCount: 0,
  };
  let duringCents = 0;
  let afterCents = 0;
  for (const event of ordered) {
    if (event.event_type !== "close" && event.event_type !== "sale") continue;
    const bookedAt = event.lead_id ? bookedAtByLead.get(event.lead_id) : undefined;
    const isAfterPitch = bookedAt != null && bookedAt <= Date.parse(event.occurred_at);
    if (isAfterPitch) result.afterPitchSales++;
    else result.duringPitchSales++;

    const amount = event.metadata?.amount_cents;
    if (typeof amount === "number" && Number.isFinite(amount)) {
      if (isAfterPitch) {
        afterCents += amount;
        result.afterPitchRevenueEventCount++;
      } else {
        duringCents += amount;
        result.duringPitchRevenueEventCount++;
      }
    }
  }
  result.duringPitchRevenueCents = result.duringPitchRevenueEventCount > 0 ? duringCents : null;
  result.afterPitchRevenueCents = result.afterPitchRevenueEventCount > 0 ? afterCents : null;
  return result;
}

export function retentionFromEvents(events: WebinarEventRow[]) {
  const ordered = [...events].sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at));
  const registrations = ordered.filter((event) => event.event_type === "registered");
  const live = ordered.filter((event) => ["live", "joined", "attended"].includes(event.event_type));
  const pitch = ordered.filter((event) => event.event_type === "pitch");
  const firstRegistration = registrations[0];
  const firstLive = live[0];
  const firstPitch = pitch[0];
  const registrationCount = registrations.length;
  const audienceAtPitch = firstPitch
    ? Number(firstPitch.metadata?.audience_remaining ?? live.length) || null
    : null;
  const points = [
    firstRegistration && {
      label: "Registered",
      timestamp: firstRegistration.occurred_at,
      audience: registrationCount,
    },
    firstLive && {
      label: "Live attendance",
      timestamp: firstLive.occurred_at,
      audience: live.length,
    },
    firstPitch && audienceAtPitch != null
      ? { label: "At pitch", timestamp: firstPitch.occurred_at, audience: audienceAtPitch }
      : null,
  ].filter(Boolean) as Array<{ label: string; timestamp: string; audience: number }>;
  return points.map((point) => ({
    ...point,
    dropOff: registrationCount > 0 ? 1 - point.audience / registrationCount : null,
  }));
}
