import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { dispatchEvent } from "@/lib/dispatch.server";

const Input = z.object({
  client_id: z.string().uuid(),
  from_stage: z.string().min(1).max(64).nullable(),
  to_stage: z.string().min(1).max(64),
});

export const notifyClientStageChangedFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: client, error } = await supabase
      .from("clients")
      .select("id, org_id, full_name, offer_name, contract_value_cents, renewal_date, health_score")
      .eq("id", data.client_id)
      .maybeSingle();
    if (error || !client) throw new Error("client not found");

    // Confirm caller is in this org
    const { data: m } = await supabase
      .from("memberships")
      .select("org_id")
      .eq("user_id", userId)
      .eq("org_id", client.org_id)
      .maybeSingle();
    if (!m) throw new Error("not authorized");

    await dispatchEvent(client.org_id, "client.stage_changed", {
      client_id: client.id,
      client_name: client.full_name,
      offer: client.offer_name,
      contract_value: ((client.contract_value_cents ?? 0) / 100),
      renewal_date: client.renewal_date,
      health_score: client.health_score,
      from_stage: data.from_stage,
      to_stage: data.to_stage,
    });

    return { ok: true };
  });
