import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { captureLifecycleEvent, lifecycleEventsForCallRecord } from "./lifecycle-events";

interface ContentReadyInput {
  contentId: string;
}
interface LeadEventInput {
  leadId: string;
  eventType: "lead.created" | "lead.qualified";
}
interface CallWonInput {
  callId: string;
}
interface CallLifecycleInput {
  callId: string;
}

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
      .select(
        "id, org_id, full_name, email, handle, status, source_connector, source_platform, source_format, source_content_id, source_campaign, source_webinar_id, first_touch_content_id, created_at, assigned_setter_id",
      )
      .eq("id", data.leadId)
      .maybeSingle();
    if (!lead) throw new Error("Lead not found");
    await captureLifecycleEvent(supabase, {
      orgId: lead.org_id,
      leadId: lead.id,
      eventType: data.eventType === "lead.created" ? "lead_created" : "qualified_conversation",
      eventAt: data.eventType === "lead.created" ? lead.created_at : new Date().toISOString(),
      idempotencyKey: `${lead.id}:${data.eventType}`,
      repId: lead.assigned_setter_id,
      sourcePlatform: lead.source_platform,
      leadSource: lead.source_connector,
      campaign: lead.source_campaign,
      contentId: lead.source_content_id ?? lead.first_touch_content_id,
      format: lead.source_format,
      webinarId: lead.source_webinar_id,
      payload: { sourceEvent: data.eventType, status: lead.status },
    });
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

export const captureCallLifecycleEventsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: CallLifecycleInput) => i)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: call, error: callError } = await supabase
      .from("calls")
      .select(
        "id, org_id, lead_id, setter_id, closer_id, scheduled_for, showed, showed_at, offer_made, offer_at, closed, updated_at, cash_collected_cents",
      )
      .eq("id", data.callId)
      .maybeSingle();
    if (callError) throw new Error(`Call lifecycle lookup failed: ${callError.message}`);
    if (!call?.lead_id) return { captured: 0 };

    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select(
        "id, assigned_setter_id, source_connector, source_platform, source_format, source_content_id, source_campaign, source_webinar_id, first_touch_content_id",
      )
      .eq("id", call.lead_id)
      .maybeSingle();
    if (leadError) throw new Error(`Lead attribution lookup failed: ${leadError.message}`);

    const attribution = {
      orgId: call.org_id,
      leadId: call.lead_id,
      repId: call.closer_id ?? call.setter_id ?? lead?.assigned_setter_id ?? null,
      sourcePlatform: lead?.source_platform ?? null,
      leadSource: lead?.source_connector ?? null,
      campaign: lead?.source_campaign ?? null,
      contentId: lead?.source_content_id ?? lead?.first_touch_content_id ?? null,
      format: lead?.source_format ?? null,
      webinarId: lead?.source_webinar_id ?? null,
      callId: call.id,
    };
    let captured = 0;
    const callEvents = lifecycleEventsForCallRecord({
      id: call.id,
      scheduledFor: call.scheduled_for,
      updatedAt: call.updated_at,
      showedAt: call.showed_at,
      offerAt: call.offer_at,
      showed: call.showed,
      offerMade: call.offer_made,
      closed: call.closed,
      cashCollectedCents: call.cash_collected_cents,
    });
    for (const event of callEvents) {
      await captureLifecycleEvent(supabase, { ...attribution, ...event });
      captured += 1;
    }
    return { captured };
  });

export const dispatchCallWon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: CallWonInput) => i)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: call } = await supabase
      .from("calls")
      .select(
        "id, org_id, lead_id, closer_id, lead_email, closer_name, cash_collected_cents, contract_value_cents",
      )
      .eq("id", data.callId)
      .maybeSingle();
    if (!call) throw new Error("Call not found");
    if (call.lead_id) {
      const eventAt = new Date().toISOString();
      await captureLifecycleEvent(supabase, {
        orgId: call.org_id,
        leadId: call.lead_id,
        eventType: "close",
        eventAt,
        idempotencyKey: `call:${call.id}:close`,
        repId: call.closer_id,
        callId: call.id,
        payload: {
          cashCollectedCents: call.cash_collected_cents,
          contractValueCents: call.contract_value_cents,
        },
      });
      if (Number(call.cash_collected_cents ?? 0) > 0) {
        await captureLifecycleEvent(supabase, {
          orgId: call.org_id,
          leadId: call.lead_id,
          eventType: "cash_collected",
          eventAt,
          idempotencyKey: `call:${call.id}:cash:${call.cash_collected_cents}`,
          repId: call.closer_id,
          callId: call.id,
          payload: { cashCollectedCents: call.cash_collected_cents },
        });
      }
    }
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
