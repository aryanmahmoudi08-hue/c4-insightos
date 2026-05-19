import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";

const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type",
    },
  });

const eventSchema = z.object({
  event_type: z.enum([
    "closer_call",
    "dm_setter_day",
    "inbound_dialer_day",
    "content_post",
    "onboarding_response",
  ]),
  data: z.record(z.string(), z.unknown()).default({}),
});

const callSchema = z.object({
  closer_name: z.string().max(255).optional(),
  lead_email: z.string().email().max(255).optional(),
  scheduled_for: z.string().datetime().optional(),
  status: z.enum(["booked", "showed", "no_show", "rescheduled", "offer_made", "closed", "follow_up", "disqualified"]).optional(),
  showed: z.boolean().optional(),
  offer_made: z.boolean().optional(),
  closed: z.boolean().optional(),
  payment_plan: z.boolean().optional(),
  cash_collected_cents: z.number().int().min(0).optional(),
  contract_value_cents: z.number().int().min(0).optional(),
  deposit_cents: z.number().int().min(0).optional(),
  call_summary: z.string().max(5000).optional(),
  key_moment: z.string().max(2000).optional(),
});

const setterDaySchema = z.object({
  team_member_name: z.string().min(1).max(255),
  activity_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  lead_source: z.string().max(120).optional(),
  leads_contacted: z.number().int().min(0).optional(),
  connections: z.number().int().min(0).optional(),
  qualified_convos: z.number().int().min(0).optional(),
  sets: z.number().int().min(0).optional(),
  links_sent: z.number().int().min(0).optional(),
  calls_on_calendar: z.number().int().min(0).optional(),
  live_calls: z.number().int().min(0).optional(),
  closes: z.number().int().min(0).optional(),
  downsells: z.number().int().min(0).optional(),
  cash_collected_cents: z.number().int().min(0).optional(),
  total_revenue_cents: z.number().int().min(0).optional(),
  objections: z.string().max(2000).optional(),
  notes: z.string().max(2000).optional(),
});

const dialerDaySchema = setterDaySchema.extend({
  dials: z.number().int().min(0).optional(),
});

const contentSchema = z.object({
  platform: z.enum(["post", "reel", "story_sequence", "carousel", "vsl", "youtube", "youtube_short", "tiktok", "dm", "email", "ad_creative", "other"]),
  title: z.string().max(500).optional(),
  url: z.string().url().max(1000).optional(),
  hook: z.string().max(500).optional(),
  body: z.string().max(5000).optional(),
  cta: z.string().max(500).optional(),
  topic: z.string().max(255).optional(),
  pain_point: z.string().max(500).optional(),
  funnel_stage: z.string().max(120).optional(),
  awareness_stage: z.enum(["unaware", "problem_aware", "solution_aware", "product_aware", "most_aware"]).optional(),
  posted_at: z.string().datetime().optional(),
  duration_seconds: z.number().int().min(0).optional(),
});

const onboardingSchema = z.object({
  client_id: z.string().uuid().optional(),
  responses: z.record(z.string(), z.unknown()),
  submitted_at: z.string().datetime().optional(),
});

export const Route = createFileRoute("/api/public/ingest/$token")({
  server: {
    handlers: {
      OPTIONS: async () => jsonRes({}, 204),
      POST: async ({ request, params }) => {
        const token = params.token;
        if (!token || token.length < 16) return jsonRes({ error: "Invalid token" }, 401);

        let body: unknown;
        try { body = await request.json(); } catch { return jsonRes({ error: "Invalid JSON" }, 400); }

        const parsed = eventSchema.safeParse(body);
        if (!parsed.success) return jsonRes({ error: "Invalid payload", details: parsed.error.flatten() }, 400);

        // Lookup org by token (settings JSON)
        const { data: org, error: orgErr } = await supabaseAdmin
          .from("organizations")
          .select("id, settings")
          .filter("settings->>ingest_token", "eq", token)
          .maybeSingle();
        if (orgErr) return jsonRes({ error: "Lookup failed" }, 500);
        if (!org) return jsonRes({ error: "Unknown token" }, 401);

        const orgId = org.id;
        const { event_type, data } = parsed.data;

        try {
          if (event_type === "closer_call") {
            const v = callSchema.parse(data);
            const { error } = await supabaseAdmin.from("calls").insert({ org_id: orgId, ...v });
            if (error) throw error;
          } else if (event_type === "dm_setter_day") {
            const v = setterDaySchema.parse(data);
            const { error } = await supabaseAdmin.from("setter_activity").insert({ org_id: orgId, role: "dm_setter", ...v });
            if (error) throw error;
          } else if (event_type === "inbound_dialer_day") {
            const v = dialerDaySchema.parse(data);
            const { error } = await supabaseAdmin.from("setter_activity").insert({ org_id: orgId, role: "inbound_dialer", ...v });
            if (error) throw error;
          } else if (event_type === "content_post") {
            const v = contentSchema.parse(data);
            const { error } = await supabaseAdmin.from("content_pieces").insert({ org_id: orgId, source_connector: "ingest_api", ...v });
            if (error) throw error;
          } else if (event_type === "onboarding_response") {
            const v = onboardingSchema.parse(data);
            const { error } = await supabaseAdmin.from("onboarding_responses").insert({ org_id: orgId, client_id: v.client_id, submitted_at: v.submitted_at, responses: v.responses as never });
            if (error) throw error;
          }

          await supabaseAdmin.from("events").insert({
            org_id: orgId,
            event_type: `ingest.${event_type}`,
            subject_type: event_type,
            payload: data as Record<string, unknown>,
          });

          return jsonRes({ ok: true, event_type });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Insert failed";
          return jsonRes({ error: msg }, 400);
        }
      },
    },
  },
});
