import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Content Pipeline is restricted to Admin and Growth Operator — the only two
 * roles that own content production decisions. This is enforced HERE, not
 * just by hiding the UI: every call re-derives the caller's real role from
 * `memberships` (never trusts a client-supplied role) and refuses before any
 * pipeline row is read or written. `context.supabase` is the caller's own
 * RLS-scoped client (see requireSupabaseAuth), so this can't be spoofed by
 * calling the RPC directly with a valid session that isn't admin/growth_ops.
 */
const PIPELINE_ROLES = new Set(["admin", "owner", "growth_ops"]);

async function requirePipelineAccess(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ orgId: string }> {
  const { data, error } = await supabase
    .from("memberships")
    .select("org_id, role")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: no workspace membership.");
  if (!PIPELINE_ROLES.has(data.role)) {
    throw new Error(
      "Forbidden: Content Pipeline is restricted to Admin and Growth Operator roles.",
    );
  }
  return { orgId: data.org_id as string };
}

export type PipelinePiece = {
  id: string;
  title: string | null;
  platform: string;
  source_platform: string | null;
  hook: string | null;
  body: string | null;
  cta: string | null;
  funnel_stage: string | null;
  angle: string | null;
  topic: string | null;
  pipeline_status: string;
  scheduled_date: string | null;
  scheduled_time: string | null;
  post_format: string | null;
  repurpose_plan: string | null;
  voice_notes: string | null;
  why_it_works: string | null;
  posting_instructions: string | null;
};

export async function getContentPipeline(
  supabase: SupabaseClient,
  userId: string,
): Promise<PipelinePiece[]> {
  const { orgId } = await requirePipelineAccess(supabase, userId);
  const { data, error } = await supabase
    .from("content_pieces")
    .select(
      "id, title, platform, source_platform, hook, body, cta, funnel_stage, angle, topic, pipeline_status, scheduled_date, scheduled_time, post_format, repurpose_plan, voice_notes, why_it_works, posting_instructions",
    )
    .eq("org_id", orgId)
    .order("posted_at", { ascending: false, nullsFirst: false })
    .limit(300);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as PipelinePiece[];
}

export type PipelineSchedulePatch = {
  scheduled_date: string;
  scheduled_time: string;
  post_format: string;
  repurpose_plan: string;
  voice_notes: string;
  why_it_works: string;
  posting_instructions: string;
};

export async function updateContentPipelineStatus(
  supabase: SupabaseClient,
  userId: string,
  input: { id: string; status: string; schedule?: PipelineSchedulePatch },
): Promise<{ ok: true }> {
  const { orgId } = await requirePipelineAccess(supabase, userId);
  const patch: Record<string, unknown> = { pipeline_status: input.status };
  if (input.status === "posted") patch.posted_at = new Date().toISOString();
  if (input.schedule) {
    patch.scheduled_date = input.schedule.scheduled_date || null;
    patch.scheduled_time = input.schedule.scheduled_time || null;
    patch.post_format = input.schedule.post_format || null;
    patch.repurpose_plan = input.schedule.repurpose_plan || null;
    patch.voice_notes = input.schedule.voice_notes || null;
    patch.why_it_works = input.schedule.why_it_works || null;
    patch.posting_instructions = input.schedule.posting_instructions || null;
  }
  // .eq("org_id", orgId) is defense-in-depth on top of RLS — the update can
  // never touch a row outside the caller's own workspace even if `input.id`
  // were guessed.
  const { error } = await supabase
    .from("content_pieces")
    .update(patch)
    .eq("id", input.id)
    .eq("org_id", orgId);
  if (error) throw new Error(error.message);
  return { ok: true };
}
