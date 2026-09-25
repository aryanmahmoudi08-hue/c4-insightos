import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CreateInput = z.object({
  orgId: z.string().uuid(),
  destinationUrl: z.string().min(1),
  label: z.string().optional().nullable(),
  kind: z.string().optional(),
  leadId: z.string().uuid().optional().nullable(),
});

export const createTrackedLinkFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateInput.parse(d))
  .handler(async ({ data, context }) => {
    const { createTrackedLink, supabaseAdmin } = await import("./tracked-links.server");
    return createTrackedLink(supabaseAdmin, {
      orgId: data.orgId,
      userId: context.userId,
      destinationUrl: data.destinationUrl,
      label: data.label ?? null,
      kind: data.kind,
      leadId: data.leadId ?? null,
    });
  });

export const listTrackedLinksFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orgId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { listTrackedLinks, supabaseAdmin } = await import("./tracked-links.server");
    return listTrackedLinks(supabaseAdmin, data.orgId);
  });
