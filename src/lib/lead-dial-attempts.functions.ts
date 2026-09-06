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
    const { userId } = context as never as { userId: string };
    const { markLeadDialedManually } = await import("./lead-dial-attempts.server");
    return markLeadDialedManually({ orgId: data.org_id, leadId: data.lead_id, repId: userId });
  });
