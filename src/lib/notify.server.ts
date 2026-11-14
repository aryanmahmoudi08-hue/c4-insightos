/**
 * Shared plumbing for events that come from inside AscendOS — a touchpoint
 * ticked, a post-call form submitted, something becoming due.
 *
 * Server-only: every helper uses the service-role client.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { dispatchEvent } from "./dispatch.server";
import {
  MAX_DELIVERY_ATTEMPTS,
  retryDelayMs,
  settleAttempt,
  type DispatchOutcome,
} from "./delivery-retry";
import { parseStoredSettings, type NotificationSettingsT } from "./workspace-settings.functions";

// Tables/columns ahead of the generated types (scheduled_event_fires,
// operational_work_items, calls.eod_lead_status) — same documented cast the
// rest of the server code uses.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const db = supabaseAdmin as any;

/** Which of `keys` have already been fired for this event type. One query,
 *  so a tick can skip known items without rebuilding their payloads. */
export async function alreadyFired(orgId: string, eventType: string, keys: string[]) {
  if (!keys.length) return new Set<string>();
  const { data, error } = await db
    .from("scheduled_event_fires")
    .select("fire_key")
    .eq("org_id", orgId)
    .eq("event_type", eventType)
    .in("fire_key", keys);
  if (error) throw new Error(`alreadyFired ${eventType}: ${error.message}`);
  return new Set(((data ?? []) as Array<{ fire_key: string }>).map((r) => r.fire_key));
}

/**
 * Record the event on the bus (so /events shows it) and deliver it to every
 * matching subscription. Never throws: callers are side effects of actions
 * that have already succeeded. Returns how each delivery went.
 */
export async function emitEvent(
  orgId: string,
  eventType: string,
  subject: { type: string; id: string | null },
  payload: Record<string, unknown>,
): Promise<DispatchOutcome> {
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
  try {
    return await dispatchEvent(orgId, eventType, payload);
  } catch (err) {
    console.error(`emitEvent ${eventType}:`, err);
    return { lookupFailed: true, deliveries: [] };
  }
}

async function settle(id: string, outcome: DispatchOutcome, attempts: number) {
  const { status, retrySubscriptionIds } = settleAttempt(outcome, attempts);
  await db
    .from("scheduled_event_fires")
    .update({ status, failed_subscription_ids: retrySubscriptionIds })
    .eq("id", id)
    .then(
      () => {},
      () => {},
    );
}

/**
 * Fire `eventType` for `fireKey` exactly once, and remember how it went.
 *
 * The claim is inserted first, so two overlapping ticks cannot both send.
 * The payload is stored on it, so if a delivery fails for a reason that
 * might pass (a Discord 429, a 5xx, a dropped connection) the retry sweep
 * can resend it later to just the subscriptions that missed it. Returns
 * false when someone else already claimed it.
 */
export async function fireOnce(
  orgId: string,
  eventType: string,
  fireKey: string,
  subject: { type: string; id: string | null },
  payload: Record<string, unknown>,
): Promise<boolean> {
  const { data, error } = await db
    .from("scheduled_event_fires")
    .insert({
      org_id: orgId,
      event_type: eventType,
      fire_key: fireKey,
      status: "pending",
      attempts: 1,
      last_attempt_at: new Date().toISOString(),
      payload,
    })
    .select("id")
    .maybeSingle();
  if (error) {
    if (error.code === "23505") return false;
    throw new Error(`fireOnce ${eventType}: ${error.message}`);
  }
  if (!data) return false;
  const outcome = await emitEvent(orgId, eventType, subject, payload);
  await settle(data.id, outcome, 1);
  return true;
}

/**
 * Resend fires whose delivery failed for a retryable reason, once their
 * backoff has passed, to only the subscriptions that failed. Also picks up a
 * claim left `pending` by a run that died mid-send. Bounded by
 * MAX_DELIVERY_ATTEMPTS, after which a claim is `dead` and left alone.
 */
export async function retryFailedFires(now: Date = new Date()) {
  const { data, error } = await db
    .from("scheduled_event_fires")
    .select(
      "id, org_id, event_type, attempts, last_attempt_at, payload, failed_subscription_ids, status",
    )
    .in("status", ["failed", "pending"])
    .lt("attempts", MAX_DELIVERY_ATTEMPTS + 1)
    .order("last_attempt_at", { ascending: true })
    .limit(50);
  if (error) throw new Error(`retryFailedFires: ${error.message}`);

  let retried = 0;
  for (const row of (data ?? []) as Array<{
    id: string;
    org_id: string;
    event_type: string;
    attempts: number;
    last_attempt_at: string;
    payload: Record<string, unknown> | null;
    failed_subscription_ids: string[] | null;
    status: "failed" | "pending";
  }>) {
    const last = new Date(row.last_attempt_at).getTime();
    // A pending claim is normally a send in progress; only a stale one is
    // treated as abandoned.
    const waitMs = row.status === "pending" ? STALE_PENDING_MS : retryDelayMs(row.attempts);
    if (now.getTime() - last < waitMs) continue;
    if (!row.payload) continue;
    if (row.attempts >= MAX_DELIVERY_ATTEMPTS) {
      await db.from("scheduled_event_fires").update({ status: "dead" }).eq("id", row.id);
      continue;
    }

    // Optimistic lock: only the tick that moves attempts N -> N+1 resends.
    const nextAttempts = row.attempts + 1;
    const { data: locked } = await db
      .from("scheduled_event_fires")
      .update({ status: "pending", attempts: nextAttempts, last_attempt_at: now.toISOString() })
      .eq("id", row.id)
      .eq("status", row.status)
      .eq("attempts", row.attempts)
      .select("id")
      .maybeSingle();
    if (!locked) continue;

    const outcome = await dispatchEvent(row.org_id, row.event_type, row.payload, {
      // null = all subscriptions: either the original lookup failed and
      // nothing was attempted, or a send died mid-flight and nobody recorded
      // which deliveries landed. Resending to all is the only safe reading.
      onlySubscriptionIds: row.status === "pending" ? null : row.failed_subscription_ids,
    }).catch(() => ({ lookupFailed: true, deliveries: [] }) as DispatchOutcome);
    await settle(row.id, outcome, nextAttempts);
    retried += 1;
  }
  return retried;
}

/** How long a `pending` claim may sit before it is assumed abandoned. */
const STALE_PENDING_MS = 10 * 60_000;

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
