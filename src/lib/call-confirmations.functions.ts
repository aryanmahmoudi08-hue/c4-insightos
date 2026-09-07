import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const touchpointSchema = z.enum(["night_before", "morning", "one_hour", "thirty_min", "ten_min"]);

/** Batch-fetches confirmation rows for a set of calls, first applying the
 * org's confirmation policy (awaiting -> overdue -> at_risk, and — only if
 * the org has explicitly opted in — the auto-cancel step). */
export const getConfirmationsForCallsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        org_id: z.string().uuid(),
        calls: z.array(
          z.object({
            id: z.string().uuid(),
            scheduled_for: z.string().nullable(),
            cancelled: z.boolean().nullable(),
          }),
        ),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { enforceConfirmationPolicy, getConfirmationsForCalls, getConfirmationPolicy } =
      await import("./call-confirmations.server");
    await enforceConfirmationPolicy(data.org_id, data.calls);
    const [confirmations, policy] = await Promise.all([
      getConfirmationsForCalls(data.calls.map((c) => c.id)),
      getConfirmationPolicy(data.org_id),
    ]);
    return { confirmations, policy };
  });

export const markTouchpointFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        call_id: z.string().uuid(),
        org_id: z.string().uuid(),
        touchpoint: touchpointSchema,
        morning_reason_for_change: z.string().max(2000).optional(),
        morning_goal_1: z.string().max(500).optional(),
        morning_goal_2: z.string().max(500).optional(),
        morning_goal_3: z.string().max(500).optional(),
        morning_response_notes: z.string().max(2000).optional(),
        thirty_min_confirmed: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context as never as { userId: string };
    const { markTouchpoint } = await import("./call-confirmations.server");
    await markTouchpoint(data.call_id, data.org_id, userId, data.touchpoint, {
      morningReasonForChange: data.morning_reason_for_change,
      morningGoal1: data.morning_goal_1,
      morningGoal2: data.morning_goal_2,
      morningGoal3: data.morning_goal_3,
      morningResponseNotes: data.morning_response_notes,
      thirtyMinConfirmed: data.thirty_min_confirmed,
    });
    return { ok: true };
  });

export const setConfirmationStatusFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        call_id: z.string().uuid(),
        org_id: z.string().uuid(),
        status: z.enum(["awaiting", "confirmed", "overdue", "at_risk", "cancelled", "rescheduled"]),
        cancelled_reason: z.string().max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context as never as { userId: string };
    const { setOverallStatus } = await import("./call-confirmations.server");
    await setOverallStatus(data.call_id, data.org_id, userId, data.status, data.cancelled_reason);
    return { ok: true };
  });

export const getConfirmationPolicyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ org_id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { getConfirmationPolicy } = await import("./call-confirmations.server");
    return getConfirmationPolicy(data.org_id);
  });

/** Admin-only at the RLS layer (confirmation_policy's write policies require
 * an owner/admin membership row) — a non-admin call fails at the database,
 * not just hidden in the UI. */
export const setConfirmationPolicyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        org_id: z.string().uuid(),
        overdue_after_hours: z.number().min(0).max(240).optional(),
        at_risk_after_hours: z.number().min(0).max(240).optional(),
        auto_cancel_enabled: z.boolean().optional(),
        auto_cancel_minutes_before: z.number().min(0).max(1440).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as never as { supabase: unknown; userId: string };
    const { org_id, ...patch } = data;
    const { setConfirmationPolicy } = await import("./call-confirmations.server");
    await setConfirmationPolicy(supabase, org_id, userId, patch);
    return { ok: true };
  });
