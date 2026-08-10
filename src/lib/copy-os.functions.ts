import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateCopy, reviewCopy, suggestAngles, extractVoiceFingerprint, COPY_TYPES } from "./copy-os.server";

async function orgIdFor(supabase: any, userId: string): Promise<string> {
  const { data } = await supabase.from("memberships").select("org_id").eq("user_id", userId).limit(1).maybeSingle();
  if (!data?.org_id) throw new Error("No workspace");
  return data.org_id as string;
}

async function loadClient(supabase: any, orgId: string, clientId: string | null | undefined) {
  if (!clientId) return null;
  const { data } = await supabase.from("copy_clients").select("*").eq("id", clientId).eq("org_id", orgId).maybeSingle();
  if (!data) return null;
  // Pull recent student wins (any org-wide wins if not tied to this copy client) for proof / social context
  const { data: wins } = await supabase
    .from("client_wins")
    .select("title, body, magnitude, occurred_at")
    .eq("org_id", orgId)
    .order("occurred_at", { ascending: false })
    .limit(20);
  if (wins?.length) {
    const winsBlock = wins
      .map((w: any) => `• [${w.magnitude}] ${w.title}${w.body ? ` — ${w.body.slice(0, 200)}` : ""}`)
      .join("\n");
    data.notes = `${data.notes ?? ""}\n\nRECENT STUDENT WINS (use as proof / receipts when relevant):\n${winsBlock}`.trim();
  }
  return data;
}

export const generateCopyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    client_id: z.string().uuid().nullable().optional(),
    copy_type: z.enum(COPY_TYPES),
    goal: z.string().max(500).nullable().optional(),
    angle: z.string().max(500).nullable().optional(),
    brief: z.string().max(4000).nullable().optional(),
    swipe_ids: z.array(z.string().uuid()).max(5).optional(),
    mechanism: z.string().max(50).nullable().optional(),
    variation: z.string().max(50).nullable().optional(),
    variation_answers: z.string().max(4000).nullable().optional(),
    objection: z.string().max(1000).nullable().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const orgId = await orgIdFor(supabase, userId);
    const client = await loadClient(supabase, orgId, data.client_id ?? null);
    let swipes: { title: string; body: string }[] = [];
    if (data.swipe_ids?.length) {
      const { data: rows } = await supabase.from("copy_swipes").select("title, body").in("id", data.swipe_ids).eq("org_id", orgId);
      swipes = rows ?? [];
    }
    const output = await generateCopy({
      copy_type: data.copy_type, goal: data.goal, angle: data.angle, brief: data.brief, client, swipes,
      mechanism: data.mechanism, variation: data.variation,
      variation_answers: data.variation_answers, objection: data.objection,
    });
    await supabase.from("copy_generations").insert({
      org_id: orgId, client_id: data.client_id ?? null, copy_type: data.copy_type,
      goal: data.goal ?? null, angle: data.angle ?? null,
      prompt_inputs: {
        brief: data.brief ?? null, swipe_ids: data.swipe_ids ?? [],
        mechanism: data.mechanism ?? null, variation: data.variation ?? null,
        variation_answers: data.variation_answers ?? null, objection: data.objection ?? null,
      },
      output, created_by: userId,
    });
    return { output };
  });


export const reviewCopyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    copy: z.string().min(10).max(20000),
    copy_type: z.string().max(50).nullable().optional(),
    client_id: z.string().uuid().nullable().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const orgId = await orgIdFor(supabase, userId);
    const client = await loadClient(supabase, orgId, data.client_id ?? null);
    return reviewCopy({ copy: data.copy, copy_type: data.copy_type, client });
  });

export const suggestAnglesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    client_id: z.string().uuid().nullable().optional(),
    count: z.number().int().min(3).max(20).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const orgId = await orgIdFor(supabase, userId);
    const client = await loadClient(supabase, orgId, data.client_id ?? null);
    return suggestAngles({ client, count: data.count });
  });

export const extractFingerprintFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    client_id: z.string().uuid(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const orgId = await orgIdFor(supabase, userId);
    const { data: client } = await supabase.from("copy_clients").select("*").eq("id", data.client_id).eq("org_id", orgId).maybeSingle();
    if (!client?.voice_transcripts) throw new Error("Add voice transcripts first.");
    const fp = await extractVoiceFingerprint(client.voice_transcripts);
    await supabase.from("copy_clients").update({ voice_fingerprint: fp }).eq("id", data.client_id).eq("org_id", orgId);
    return fp;
  });
