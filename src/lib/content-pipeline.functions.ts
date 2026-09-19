import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Content Pipeline read — see content-pipeline.server.ts for the real
 * enforcement (Admin/Growth Operator only, re-checked server-side from
 * `memberships` on every call). */
export const contentPipelineFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getContentPipeline } = await import("./content-pipeline.server");
    return getContentPipeline(context.supabase, context.userId);
  });

const scheduleSchema = z.object({
  scheduled_date: z.string(),
  scheduled_time: z.string(),
  post_format: z.string(),
  repurpose_plan: z.string(),
  voice_notes: z.string(),
  why_it_works: z.string(),
  posting_instructions: z.string(),
});

export const updateContentPipelineStatusFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.string(),
        schedule: scheduleSchema.optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { updateContentPipelineStatus } = await import("./content-pipeline.server");
    return updateContentPipelineStatus(context.supabase, context.userId, data);
  });
