import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Announce a just-submitted EOD on the event bus.
 *
 * The EOD form inserts through the caller's own RLS-scoped client, so this
 * re-reads the row the same way before announcing it: if the caller cannot
 * see the row, they do not get to post it to a channel. The announcement
 * itself is then built server-side with the service role, which is what can
 * look up the lead and the objections.
 */
export const notifyEodSubmittedFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ kind: z.enum(["closer", "setter"]), id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const table = data.kind === "closer" ? "calls" : "setter_activity";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: row, error } = await (context.supabase as any)
      .from(table)
      .select("id, org_id")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Submission not found");
    const emitters = await import("./event-emitters.server");
    if (data.kind === "closer") await emitters.notifyCloserPostCall(row.org_id, row.id);
    else await emitters.notifySetterEod(row.org_id, row.id);
    return { ok: true };
  });
