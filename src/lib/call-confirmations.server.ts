import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { deriveOverallStatus } from "./call-confirmations";

// confirmation_policy / call_confirmations aren't in generated Supabase types
// yet (added post-typegen) — same `as any` convention used elsewhere in this
// repo (see src/lib/fx.server.ts) for tables ahead of a fresh `supabase gen
// types` run.
/* eslint-disable @typescript-eslint/no-explicit-any */
const policyTable = () => (supabaseAdmin as any).from("confirmation_policy");
const confirmationsTable = () => (supabaseAdmin as any).from("call_confirmations");
/* eslint-enable @typescript-eslint/no-explicit-any */

const DEFAULT_POLICY = {
  overdue_after_hours: 24,
  at_risk_after_hours: 4,
  auto_cancel_enabled: false,
  auto_cancel_minutes_before: 30,
};

export type ConfirmationPolicy = typeof DEFAULT_POLICY;

export async function getConfirmationPolicy(orgId: string): Promise<ConfirmationPolicy> {
  const { data } = await policyTable().select("*").eq("org_id", orgId).maybeSingle();
  if (!data) return DEFAULT_POLICY;
  return {
    overdue_after_hours: Number(data.overdue_after_hours ?? DEFAULT_POLICY.overdue_after_hours),
    at_risk_after_hours: Number(data.at_risk_after_hours ?? DEFAULT_POLICY.at_risk_after_hours),
    auto_cancel_enabled: !!data.auto_cancel_enabled,
    auto_cancel_minutes_before: Number(
      data.auto_cancel_minutes_before ?? DEFAULT_POLICY.auto_cancel_minutes_before,
    ),
  };
}

/**
 * Deliberately takes the REQUEST-SCOPED (RLS-respecting) client, not
 * `supabaseAdmin` — `confirmation_policy`'s write policies restrict inserts/
 * updates to owner/admin memberships (see the migration), and that check
 * only means anything if the write actually goes through as the calling
 * user rather than the service role, which bypasses RLS entirely. A
 * non-admin caller gets a real database rejection here, not just a hidden
 * button client-side.
 */
export async function setConfirmationPolicy(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- request-scoped client from requireSupabaseAuth's context, typed loosely like the rest of this file's not-yet-generated-types tables.
  requestScopedSupabase: any,
  orgId: string,
  userId: string,
  patch: Partial<ConfirmationPolicy>,
) {
  const { error } = await requestScopedSupabase
    .from("confirmation_policy")
    .upsert(
      { org_id: orgId, ...patch, updated_by: userId, updated_at: new Date().toISOString() },
      { onConflict: "org_id" },
    );
  if (error) throw new Error(`Failed to save confirmation policy: ${error.message}`);
}

/**
 * Awaiting -> overdue -> at_risk is always applied on read (this repo has no
 * cron/scheduled-job infrastructure, so "automatic" here means "evaluated
 * every time the calendar loads" — the honest, buildable equivalent).
 * Auto-cancellation is a separate, opt-in step: it only ever writes
 * `calls.cancelled = true` when the org's policy has explicitly turned
 * `auto_cancel_enabled` on. With the default (off), an unconfirmed call
 * simply reaches and stays at `at_risk` — a human must act. Never deletes a
 * row; a cancelled call stays visible with `cancelled_reason` set.
 */
export async function enforceConfirmationPolicy(
  orgId: string,
  calls: Array<{ id: string; scheduled_for: string | null; cancelled: boolean | null }>,
): Promise<void> {
  if (!calls.length) return;
  const policy = await getConfirmationPolicy(orgId);
  const callIds = calls.map((c) => c.id);
  const { data: rows } = await confirmationsTable().select("*").in("call_id", callIds);
  const byCallId = new Map<string, Record<string, unknown>>(
    (rows ?? []).map((r: { call_id: string }) => [r.call_id, r]),
  );
  const now = new Date();
  const nowIso = now.toISOString();

  const writes: Array<{
    call_id: string;
    org_id: string;
    overall_status: string;
    cancelled_reason?: string;
  }> = [];
  const cancelIds: string[] = [];

  for (const call of calls) {
    if (call.cancelled || !call.scheduled_for) continue;
    const existing = byCallId.get(call.id);
    const currentStatus = (existing?.overall_status as string | undefined) ?? "awaiting";
    if (
      currentStatus === "confirmed" ||
      currentStatus === "cancelled" ||
      currentStatus === "rescheduled"
    )
      continue;

    const nextStatus = deriveOverallStatus(
      currentStatus as "awaiting" | "overdue" | "at_risk",
      call.scheduled_for,
      {
        overdueAfterHours: policy.overdue_after_hours,
        atRiskAfterHours: policy.at_risk_after_hours,
      },
      now,
    );

    const minutesUntilCall = (new Date(call.scheduled_for).getTime() - now.getTime()) / 60_000;
    const pastAutoCancelThreshold = minutesUntilCall <= policy.auto_cancel_minutes_before;

    if (policy.auto_cancel_enabled && pastAutoCancelThreshold) {
      cancelIds.push(call.id);
      writes.push({
        call_id: call.id,
        org_id: orgId,
        overall_status: "cancelled",
        cancelled_reason: "Cancelled — confirmation not received",
      });
    } else if (nextStatus !== currentStatus) {
      writes.push({ call_id: call.id, org_id: orgId, overall_status: nextStatus });
    }
  }

  if (writes.length) {
    await confirmationsTable().upsert(
      writes.map((w) => ({ ...w, updated_at: nowIso })),
      { onConflict: "call_id" },
    );
  }
  if (cancelIds.length) {
    // The authoritative record: same column a manual cancel writes to, so
    // automatic and manual cancellation are the same code path downstream.
    await supabaseAdmin.from("calls").update({ cancelled: true }).in("id", cancelIds);
  }
}

export async function getConfirmationsForCalls(callIds: string[]) {
  if (!callIds.length) return [];
  const { data, error } = await confirmationsTable().select("*").in("call_id", callIds);
  if (error) throw new Error(`Failed to load confirmations: ${error.message}`);
  return data ?? [];
}

export async function markTouchpoint(
  callId: string,
  orgId: string,
  userId: string,
  touchpoint: "night_before" | "morning" | "one_hour" | "thirty_min" | "ten_min",
  extra?: {
    morningReasonForChange?: string;
    morningGoal1?: string;
    morningGoal2?: string;
    morningGoal3?: string;
    morningResponseNotes?: string;
    thirtyMinConfirmed?: boolean;
  },
) {
  const nowIso = new Date().toISOString();
  const patch: Record<string, unknown> = {
    call_id: callId,
    org_id: orgId,
    updated_by: userId,
    updated_at: nowIso,
  };
  if (touchpoint === "night_before") patch.night_before_sent_at = nowIso;
  if (touchpoint === "morning") {
    patch.morning_sent_at = nowIso;
    if (extra?.morningReasonForChange !== undefined)
      patch.morning_reason_for_change = extra.morningReasonForChange;
    if (extra?.morningGoal1 !== undefined) patch.morning_goal_1 = extra.morningGoal1;
    if (extra?.morningGoal2 !== undefined) patch.morning_goal_2 = extra.morningGoal2;
    if (extra?.morningGoal3 !== undefined) patch.morning_goal_3 = extra.morningGoal3;
    if (extra?.morningResponseNotes !== undefined)
      patch.morning_response_notes = extra.morningResponseNotes;
    if (
      extra?.morningGoal1 ||
      extra?.morningGoal2 ||
      extra?.morningGoal3 ||
      extra?.morningResponseNotes
    ) {
      patch.morning_responded_at = nowIso;
    }
  }
  if (touchpoint === "one_hour") patch.one_hour_sent_at = nowIso;
  if (touchpoint === "thirty_min") {
    patch.thirty_min_sent_at = nowIso;
    if (extra?.thirtyMinConfirmed) {
      patch.thirty_min_confirmed = true;
      patch.thirty_min_confirmed_at = nowIso;
    }
  }
  if (touchpoint === "ten_min") patch.ten_min_sent_at = nowIso;

  const { error } = await confirmationsTable().upsert(patch, { onConflict: "call_id" });
  if (error) throw new Error(`Failed to mark ${touchpoint}: ${error.message}`);
}

export async function setOverallStatus(
  callId: string,
  orgId: string,
  userId: string,
  status: "awaiting" | "confirmed" | "overdue" | "at_risk" | "cancelled" | "rescheduled",
  cancelledReason?: string,
  rescheduledReason?: string,
) {
  const nowIso = new Date().toISOString();
  const patch: Record<string, unknown> = {
    call_id: callId,
    org_id: orgId,
    overall_status: status,
    updated_by: userId,
    updated_at: nowIso,
  };
  if (status === "confirmed") patch.confirmed_at = nowIso;
  if (status === "cancelled") {
    patch.cancelled_reason = cancelledReason ?? "Cancelled by rep";
    // Manual cancellation writes through to the same authoritative column
    // the automatic-enforcement path uses.
    await supabaseAdmin.from("calls").update({ cancelled: true }).eq("id", callId);
  }
  if (status === "rescheduled") {
    patch.rescheduled_reason = rescheduledReason ?? "Reason not recorded";
  }
  const { error } = await confirmationsTable().upsert(patch, { onConflict: "call_id" });
  if (error) throw new Error(`Failed to update confirmation status: ${error.message}`);
}

/**
 * Corrects an accidental "sent" click — clears the touchpoint's own sent/
 * response marker(s), never anything a real outbound integration might one
 * day have actually delivered (this repo has none today; see the module
 * doc comment). Logged to the existing generic `events` table as a
 * correction, not a new audit mechanism.
 */
export async function unmarkTouchpoint(
  callId: string,
  orgId: string,
  userId: string,
  touchpoint: "night_before" | "morning" | "one_hour" | "thirty_min" | "ten_min",
) {
  const patch: Record<string, unknown> = {
    updated_by: userId,
    updated_at: new Date().toISOString(),
  };
  if (touchpoint === "night_before") patch.night_before_sent_at = null;
  if (touchpoint === "morning") {
    patch.morning_sent_at = null;
    patch.morning_responded_at = null;
  }
  if (touchpoint === "one_hour") patch.one_hour_sent_at = null;
  if (touchpoint === "thirty_min") {
    patch.thirty_min_sent_at = null;
    patch.thirty_min_confirmed = false;
    patch.thirty_min_confirmed_at = null;
  }
  if (touchpoint === "ten_min") patch.ten_min_sent_at = null;

  const { error } = await confirmationsTable().update(patch).eq("call_id", callId);
  if (error) throw new Error(`Failed to unmark ${touchpoint}: ${error.message}`);

  await supabaseAdmin.from("events").insert({
    org_id: orgId,
    event_type: "confirmation_touchpoint_unmarked",
    actor_user_id: userId,
    subject_type: "call",
    subject_id: callId,
    payload: { touchpoint },
  });
}
