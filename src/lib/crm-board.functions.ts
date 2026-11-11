import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const moveInput = z.object({
  leadId: z.string().uuid(),
  stageId: z.string().uuid(),
});

/** Drag-and-drop. Always wins over whatever the post-call form last set. */
export const moveLeadToStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => moveInput.parse(d))
  .handler(async ({ data, context }) => {
    const { moveLeadToStageForUser } = await import("./crm-board.server");
    return moveLeadToStageForUser((context as { userId: string }).userId, data);
  });

/**
 * Called after a post-call form saves, so the Closer's Lead Status answer
 * puts the lead in the matching board stage. A later drag overrides it.
 */
export const syncLeadStageFromCall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ callId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { syncLeadStageFromCallForUser } = await import("./crm-board.server");
    return syncLeadStageFromCallForUser((context as { userId: string }).userId, data);
  });
