import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

interface ContentReadyInput { contentId: string }
interface LeadEventInput { leadId: string; eventType: "lead.created" | "lead.qualified" }
interface CallWonInput { callId: string }

export const dispatchContentReady = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: ContentReadyInput) => i)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: piece } = await supabase
      .from("content_pieces")
      .select("id, org_id, title, hook, platform, url, funnel_stage, angle, body, pipeline_status")
      .eq("id", data.contentId)
      .maybeSingle();
    if (!piece) throw new Error("Content not found");

    const { dispatchEvent, categoryFromPlatform } = await import("./dispatch.server");
    const category = categoryFromPlatform(piece.platform);
    await dispatchEvent(piece.org_id, "content.ready_to_post", {
      category,
      content_id: piece.id,
      title: piece.title,
      hook: piece.hook,
      platform: piece.platform,
      angle: piece.angle,
      funnel_stage: piece.funnel_stage,
      url: piece.url,
      script: (piece.body ?? "").slice(0, 4000),
    });
    return { ok: true, category };
  });

export const dispatchLeadEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: LeadEventInput) => i)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: lead } = await supabase
      .from("leads")
      .select("id, org_id, full_name, email, handle, status, source_connector, first_touch_content_id")
      .eq("id", data.leadId)
      .maybeSingle();
    if (!lead) throw new Error("Lead not found");
    const { dispatchEvent } = await import("./dispatch.server");
    await dispatchEvent(lead.org_id, data.eventType, {
      category: "lead",
      lead_id: lead.id,
      full_name: lead.full_name,
      email: lead.email,
      handle: lead.handle,
      status: lead.status,
      source: lead.source_connector,
    });
    return { ok: true };
  });

export const dispatchCallWon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: CallWonInput) => i)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: call } = await supabase
      .from("calls")
      .select("id, org_id, lead_email, closer_name, cash_collected_cents, contract_value_cents")
      .eq("id", data.callId)
      .maybeSingle();
    if (!call) throw new Error("Call not found");
    const { dispatchEvent } = await import("./dispatch.server");
    await dispatchEvent(call.org_id, "call.closed_won", {
      category: "sale",
      call_id: call.id,
      lead_email: call.lead_email,
      closer: call.closer_name,
      cash_cents: call.cash_collected_cents,
      contract_cents: call.contract_value_cents,
    });
    return { ok: true };
  });
