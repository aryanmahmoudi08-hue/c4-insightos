import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function orgOf(context: unknown) {
  const { supabase, userId } = context as { supabase: any; userId: string };
  const { data } = await supabase.from("memberships").select("org_id").eq("user_id", userId).limit(1).maybeSingle();
  if (!data?.org_id) throw new Error("No workspace");
  return { supabase, orgId: data.org_id as string };
}

const rangeSchema = z.object({
  from: z.string().default(() => new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10)),
  to: z.string().default(() => new Date().toISOString().slice(0, 10)),
});

/** Recommended posting mix across the 4 mechanisms, derived from FAQ clicks, intakes and setting calls. */
export const contentDemandFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => rangeSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, orgId } = await orgOf(context);
    const { computeDemand } = await import("./content-signals.server");
    const { fetchWorkspaceSettings } = await import("./workspace-settings.functions");
    const settings = await fetchWorkspaceSettings(supabase, orgId);
    return computeDemand(supabase, orgId, { from: data.from, to: data.to }, settings.content_engine);
  });

/** Full bottleneck read: VSL + FAQ + setting calls + intakes + reel performance. */
export const analyzeContentSystemFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => rangeSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, orgId } = await orgOf(context);
    const { analyzeContentSystem } = await import("./content-signals.server");
    const { fetchWorkspaceSettings } = await import("./workspace-settings.functions");
    const settings = await fetchWorkspaceSettings(supabase, orgId);
    return analyzeContentSystem(supabase, orgId, { from: data.from, to: data.to }, settings.content_engine);
  });

/**
 * Weekly posting check — moved server-side from a hand-rolled Supabase query
 * in the /content-signals route component, so the "worst mechanism"
 * diagnosis shares the exact same classifyPerformance() call computeDemand's
 * reel-strength scoring uses, instead of an independent implementation that
 * could (and did) disagree with it.
 */
export const weeklyContentCheckFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, orgId } = await orgOf(context);
    const { computeWeeklyContentCheck } = await import("./content-signals.server");
    const { fetchWorkspaceSettings } = await import("./workspace-settings.functions");
    const settings = await fetchWorkspaceSettings(supabase, orgId);
    return computeWeeklyContentCheck(supabase, orgId, settings.content_engine);
  });

/** AI-screen a setting-call transcript or setter notes, then store the signal. */
export const logSetterSignalFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    setter_name: z.string().trim().min(1).max(120),
    call_date: z.string().max(20).optional(),
    transcript: z.string().trim().max(40000).optional(),
    notes: z.string().trim().max(8000).optional(),
    lead_id: z.string().uuid().nullable().optional(),
    screen: z.boolean().default(true),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, orgId } = await orgOf(context);
    const text = [data.transcript, data.notes].filter(Boolean).join("\n\n");
    if (!text.trim()) throw new Error("Paste a transcript or notes first.");

    let extracted = { limiting_beliefs: [] as string[], objections: [] as string[], mechanism: null as string | null, summary: "" };
    if (data.screen) {
      const { extractSetterSignals } = await import("./content-signals.server");
      extracted = await extractSetterSignals(text) as never;
    }

    const { data: row, error } = await supabase.from("setter_call_signals").insert({
      org_id: orgId,
      lead_id: data.lead_id ?? null,
      setter_name: data.setter_name.trim(),
      call_date: data.call_date || new Date().toISOString().slice(0, 10),
      source: data.transcript ? "transcript" : "notes",
      transcript: data.transcript ?? null,
      notes: data.notes ?? null,
      limiting_beliefs: extracted.limiting_beliefs,
      objections: extracted.objections,
      mechanism: extracted.mechanism,
      ai_summary: extracted.summary || null,
    }).select("id, limiting_beliefs, objections, mechanism, ai_summary").single();
    if (error) throw new Error(error.message);
    return row;
  });

/**
 * Automatic ingestion path for 2.8: the same extraction the manual-paste flow uses,
 * triggered right after a call is logged instead of requiring someone to come back
 * and paste the summary in separately. Best-effort — a screening failure here should
 * never block "call logged" from succeeding, so callers should treat this as fire-and-forget.
 */
export const autoIngestCallSignalFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    call_id: z.string().uuid().nullable().optional(),
    closer_name: z.string().trim().min(1).max(120),
    call_date: z.string().max(20).optional(),
    call_summary: z.string().trim().min(1).max(20000),
    lead_id: z.string().uuid().nullable().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, orgId } = await orgOf(context);
    const { extractSetterSignals } = await import("./content-signals.server");
    const extracted = await extractSetterSignals(data.call_summary);

    const { data: row, error } = await supabase.from("setter_call_signals").insert({
      org_id: orgId,
      lead_id: data.lead_id ?? null,
      setter_name: data.closer_name.trim(),
      call_date: data.call_date || new Date().toISOString().slice(0, 10),
      source: "auto_call",
      transcript: null,
      notes: data.call_summary,
      limiting_beliefs: extracted.limiting_beliefs,
      objections: extracted.objections,
      mechanism: extracted.mechanism,
      ai_summary: extracted.summary || null,
    }).select("id, limiting_beliefs, objections, mechanism, ai_summary").single();
    if (error) throw new Error(error.message);
    return row;
  });
