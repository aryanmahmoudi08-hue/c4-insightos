/**
 * Shared plumbing for events that come from inside AscendOS — a touchpoint
 * ticked, a post-call form submitted, something becoming due.
 *
 * Server-only: every helper uses the service-role client.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { dispatchEvent } from "./dispatch.server";
import { parseStoredSettings, type NotificationSettingsT } from "./workspace-settings.functions";

// Tables/columns ahead of the generated types (scheduled_event_fires,
// operational_work_items, calls.eod_lead_status) — same documented cast the
// rest of the server code uses.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const db = supabaseAdmin as any;

/**
 * Claim the right to fire `eventType` for `fireKey` exactly once.
 *
 * Returns true for the first caller and false for every later one. Claimed
 * before dispatch, so delivery is at-most-once: a ping that fails to send is
 * not retried into a duplicate, which for "call this lead now" is the right
 * way round — two pings for one callback teaches people to ignore the
 * channel.
 */
export async function claimFire(orgId: string, eventType: string, fireKey: string) {
  const { data, error } = await db
    .from("scheduled_event_fires")
    .insert({ org_id: orgId, event_type: eventType, fire_key: fireKey })
    .select("id")
    .maybeSingle();
  if (error) {
    if (error.code === "23505") return false;
    throw new Error(`claimFire ${eventType}: ${error.message}`);
  }
  return !!data;
}

/**
 * Record the event on the bus (so /events shows it) and deliver it to every
 * matching subscription. Never throws: callers are side effects of actions
 * that have already succeeded.
 */
export async function emitEvent(
  orgId: string,
  eventType: string,
  subject: { type: string; id: string | null },
  payload: Record<string, unknown>,
) {
  await db
    .from("events")
    .insert({
      org_id: orgId,
      event_type: eventType,
      subject_type: subject.type,
      subject_id: subject.id,
      payload,
    })
    .then(
      () => {},
      () => {},
    );
  await dispatchEvent(orgId, eventType, payload).catch((err: unknown) => {
    console.error(`emitEvent ${eventType}:`, err);
  });
}

export async function loadNotificationSettings(orgId: string): Promise<NotificationSettingsT> {
  const { data } = await db.from("organizations").select("settings").eq("id", orgId).maybeSingle();
  return parseStoredSettings((data?.settings ?? {}) as Record<string, unknown>).notifications;
}

export type LeadSummary = {
  id: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
};

/** The lead behind an event, by id or failing that by email. */
export async function leadSummary(
  orgId: string,
  ref: { leadId?: string | null; email?: string | null },
): Promise<LeadSummary> {
  const cols = "id, full_name, email, phone";
  if (ref.leadId) {
    const { data } = await db
      .from("leads")
      .select(cols)
      .eq("org_id", orgId)
      .eq("id", ref.leadId)
      .maybeSingle();
    if (data) return data;
  }
  if (ref.email) {
    const { data } = await db
      .from("leads")
      .select(cols)
      .eq("org_id", orgId)
      .ilike("email", ref.email.trim())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return data;
  }
  return { id: ref.leadId ?? null, full_name: null, email: ref.email ?? null, phone: null };
}

/** A team member's display name from their auth user id. */
export async function memberName(orgId: string, userId: string | null | undefined) {
  if (!userId) return null;
  const { data } = await db
    .from("team_members")
    .select("name")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  return (data?.name as string | undefined) ?? null;
}
