import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Manual "Mark Dialed" fallback — only for when real call data can't be automated. */
export const markLeadDialedFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ org_id: z.string().uuid(), lead_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- request-scoped client from requireSupabaseAuth's context, typed loosely like every other .functions.ts file's equivalent helper (see call-confirmations.functions.ts's assertOrgMember).
    const { supabase, userId } = context as never as { supabase: any; userId: string };
    // markLeadDialedManually writes through supabaseAdmin (service-role,
    // bypasses RLS), so the org_id the client sent must be verified against
    // the caller's own membership here — RLS never gets a chance to.
    const { data: mem } = await supabase
      .from("memberships")
      .select("org_id")
      .eq("user_id", userId)
      .eq("org_id", data.org_id)
      .maybeSingle();
    if (!mem) throw new Error("Forbidden");
    const { markLeadDialedManually } = await import("./lead-dial-attempts.server");
    return markLeadDialedManually({ orgId: data.org_id, leadId: data.lead_id, repId: userId });
  });
