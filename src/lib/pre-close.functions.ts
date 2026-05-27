import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildPreCloseSummary } from "./pre-close.server";

export const generatePreCloseFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ client_id: z.string().uuid(), org_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: m } = await supabase
      .from("memberships")
      .select("org_id")
      .eq("user_id", userId)
      .eq("org_id", data.org_id)
      .maybeSingle();
    if (!m) throw new Error("Forbidden");
    const r = await buildPreCloseSummary(data.org_id, data.client_id);
    if (!r) throw new Error("Could not build summary (missing AI key or no source data).");
    const rawJson = JSON.parse(JSON.stringify(r.raw)) as never;
    const { error } = await context.supabase
      .from("clients")
      .update({ pre_close_summary: r.summary, pre_close_raw: rawJson })
      .eq("id", data.client_id);
    if (error) throw new Error(error.message);
    return { summary: r.summary };
  });
