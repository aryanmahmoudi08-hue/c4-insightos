import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function orgOf(context: unknown) {
  const { supabase, userId } = context as { supabase: any; userId: string };
  const { data } = await supabase.from("memberships").select("org_id").eq("user_id", userId).limit(1).maybeSingle();
  if (!data?.org_id) throw new Error("No workspace");
  return { supabase, orgId: data.org_id as string };
}

/** Authenticated — a rep generates/copies the per-lead link to send manually
 * (text, email — no auto-send in this pass, see plan). */
export const generatePreCallVideoLinkFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ leadId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, orgId } = await orgOf(context);
    const { getOrCreateLink } = await import("./pre-call-video.server");
    const token = await getOrCreateLink(supabase, orgId, data.leadId);
    return { token };
  });

/** Public — no auth middleware, deliberately. The lead has no account; this
 * is the one surface that resolves a token into a real watch event. */
export const resolvePreCallVideoLinkFn = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    const { resolvePreCallVideo, supabaseAdmin } = await import("./pre-call-video.server");
    return resolvePreCallVideo(supabaseAdmin, data.token);
  });
