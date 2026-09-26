import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { classifyTranscript } from "@/lib/analyze-content.server";
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
    "vsl_metric_snapshot",
    "hiring_application",
    "daily_win",
  ]),
  data: z.record(z.string(), z.unknown()).default({}),
});

// Money fields are accepted as raw numbers (dollars) and stored as-is in the
// existing *_cents columns without any conversion. Senders may use either the
// short name (e.g. cash_collected) or the legacy *_cents name.
const money = z.number().min(0).optional();

const callSchema = z
  .object({
    closer_name: z.string().max(255).optional(),
    lead_email: z.string().email().max(255).optional(),
    scheduled_for: z.string().datetime().optional(),
    status: z
      .enum([
        "booked",
        "showed",
        "no_show",
        "rescheduled",
        "offer_made",
        "closed",
        "follow_up",
        "disqualified",
      ])
      .optional(),
    showed: z.boolean().optional(),
    offer_made: z.boolean().optional(),
    closed: z.boolean().optional(),
    payment_plan: z.boolean().optional(),
    cash_collected: money,
    cash_collected_cents: money,
    contract_value: money,
    contract_value_cents: money,
    deposit: money,
    deposit_cents: money,
    call_summary: z.string().max(5000).optional(),
    key_moment: z.string().max(2000).optional(),
  })
  .transform((v) => {
    const { cash_collected, contract_value, deposit, ...rest } = v;
    return {
      ...rest,
      cash_collected_cents: cash_collected ?? v.cash_collected_cents,
      contract_value_cents: contract_value ?? v.contract_value_cents,
      deposit_cents: deposit ?? v.deposit_cents,
    };
  });

const setterDaySchema = z
  .object({
    team_member_name: z.string().min(1).max(255),
    activity_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
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
    cash_collected: money,
    cash_collected_cents: money,
    total_revenue: money,
    total_revenue_cents: money,
    dials: z.number().int().min(0).optional(),
    objections: z.string().max(2000).optional(),
    notes: z.string().max(2000).optional(),
  })
  .transform((v) => {
    const { cash_collected, total_revenue, ...rest } = v;
    return {
      ...rest,
      cash_collected_cents: cash_collected ?? v.cash_collected_cents,
      total_revenue_cents: total_revenue ?? v.total_revenue_cents,
    };
  });

const dialerDaySchema = setterDaySchema;

const contentSchema = z.object({
  platform: z.enum([
    "post",
    "reel",
    "story_sequence",
    "carousel",
    "vsl",
    "youtube",
    "youtube_short",
    "tiktok",
    "dm",
    "email",
    "ad_creative",
    "other",
  ]),
  title: z.string().max(500).optional(),
  url: z.string().url().max(1000).optional(),
  hook: z.string().max(500).optional(),
  body: z.string().max(5000).optional(),
  cta: z.string().max(500).optional(),
  topic: z.string().max(255).optional(),
  pain_point: z.string().max(500).optional(),
  funnel_stage: z.string().max(120).optional(),
  awareness_stage: z
    .enum(["unaware", "problem_aware", "solution_aware", "product_aware", "most_aware"])
    .optional(),
  posted_at: z.string().datetime().optional(),
  duration_seconds: z.number().int().min(0).optional(),
});

const onboardingSchema = z.object({
  client_id: z.string().uuid().optional(),
  responses: z.record(z.string(), z.unknown()),
  submitted_at: z.string().datetime().optional(),
});

// Sales-role applications arriving from a Google Form / Typeform. Only
// full_name is required: a form that captures nothing else still produces a
// real applicant a human can triage, which beats rejecting the submission and
// losing the candidate entirely. Everything the form did capture is preserved
// verbatim in `responses`, so a question this schema doesn't model isn't lost.
const hiringApplicationSchema = z.object({
  full_name: z.string().min(1).max(255),
  email: z.string().email().max(255).optional(),
  phone: z.string().max(60).optional(),
  role_applied: z.string().max(60).optional(),
  region: z.string().max(80).optional(),
  source: z.string().max(120).optional(),
  niche: z.string().max(160).optional(),
  years_experience: z.number().min(0).max(80).optional(),
  notes: z.string().max(4000).optional(),
  portfolio_url: z.string().url().max(500).optional(),
  audio_url: z.string().url().max(500).optional(),
  responses: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Student daily check-in arriving from an external form (Google Forms via
 * Apps Script, or anything else that can POST). Deliberately the same shape
 * `submitDailyWin` already takes from the in-app /daily-win page — one writer,
 * one validation path, so an external form cannot create rows the in-app form
 * could not.
 *
 * `financial_amount_cents` is only honoured when win_types includes
 * "financial"; submitDailyWin enforces that, so a form that sends an amount
 * without the tag cannot inflate Student Cash Logged.
 */
const dailyWinSchema = z.object({
  student_name: z.string().min(1).max(255),
  win_description: z.string().min(1).max(4000),
  win_types: z.array(z.string().max(60)).default([]),
  win_date: z.string().max(40).optional(),
  yesterday_commitment: z.string().max(2000).optional(),
  yesterday_status: z.string().max(60).optional(),
  work_done: z.string().max(4000).optional(),
  financial_amount_cents: z.number().int().min(0).optional(),
  financial_source: z.string().max(255).optional(),
  proof_url: z.string().url().max(500).optional(),
  energy_score: z.number().int().min(1).max(10).optional(),
  blocker: z.string().max(2000).optional(),
  tomorrow_needle_mover: z.string().max(2000).optional(),
});

// Wistia has no push/webhook API for stats — this is always fed by a poller
// (n8n calling Wistia's Stats API, then pushing the transformed result here)
// rather than Wistia calling AscendOS directly. wistia_video_id resolves to
// an existing public.vsls row; a snapshot for an unknown video is rejected,
// never used to fabricate a VSL record.
const vslMetricSnapshotSchema = z.object({
  wistia_video_id: z.string().min(1).max(255),
  video_name: z.string().max(500).optional(),
  total_plays: z.number().int().min(0).optional(),
  unique_viewers: z.number().int().min(0).optional(),
  play_rate: z.number().min(0).optional(),
  avg_percent_watched: z.number().min(0).optional(),
  page_loads: z.number().int().min(0).optional(),
  engagement_json: z.unknown().optional(),
  captured_at: z.string().datetime().optional(),
});

export const Route = createFileRoute("/api/public/ingest/$token")({
  server: {
    handlers: {
      OPTIONS: async () => jsonRes({}, 204),
      POST: async ({ request, params }) => {
        const token = params.token;
        if (!token || token.length < 16) return jsonRes({ error: "Invalid token" }, 401);

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return jsonRes({ error: "Invalid JSON" }, 400);
        }

        const parsed = eventSchema.safeParse(body);
        if (!parsed.success)
          return jsonRes({ error: "Invalid payload", details: parsed.error.flatten() }, 400);

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
            const { error } = await supabaseAdmin
              .from("setter_activity")
              .insert({ org_id: orgId, role: "dm_setter", ...v });
            if (error) throw error;
          } else if (event_type === "inbound_dialer_day") {
            const v = dialerDaySchema.parse(data);
            const { error } = await supabaseAdmin
              .from("setter_activity")
              .insert({ org_id: orgId, role: "inbound_dialer", ...v });
            if (error) throw error;
          } else if (event_type === "content_post") {
            const v = contentSchema.parse(data);
            let aiAngle: string | null = null;
            const merged = { ...v } as typeof v & { hook?: string; funnel_stage?: string };
            if (v.body && (!v.hook || !v.funnel_stage)) {
              const r = await classifyTranscript({
                transcript: v.body,
                hook: v.hook ?? null,
                title: v.title ?? null,
              });
              if (r) {
                merged.hook = v.hook ?? r.hook;
                merged.funnel_stage = v.funnel_stage ?? r.funnel_stage;
                aiAngle = r.angle;
              }
            }
            const insertRow: Record<string, unknown> = {
              org_id: orgId,
              source_connector: "ingest_api",
              ...merged,
            };
            if (aiAngle) insertRow.angle = aiAngle;
            const { error } = await supabaseAdmin.from("content_pieces").insert(insertRow as never);
            if (error) throw error;
          } else if (event_type === "onboarding_response") {
            const v = onboardingSchema.parse(data);
            const { error } = await supabaseAdmin.from("onboarding_responses").insert({
              org_id: orgId,
              client_id: v.client_id,
              submitted_at: v.submitted_at,
              responses: v.responses as never,
            });
            if (error) throw error;
          } else if (event_type === "daily_win") {
            const v = dailyWinSchema.parse(data);
            const { insertDailyWin } = await import("@/lib/daily-wins.server");
            await insertDailyWin({
              ...v,
              org_id: orgId,
              // The table's default; the in-app form asks the question, an
              // external form generally won't.
              yesterday_status: v.yesterday_status ?? "done",
              source: "google_form",
            });
          } else if (event_type === "hiring_application") {
            const v = hiringApplicationSchema.parse(data);
            const { scoreApplicant, recommendStageFromScore } =
              await import("@/lib/hiring.functions");
            const { score, reasoning } = scoreApplicant(v);
            const { error } = await supabaseAdmin.from("hiring_applicants").insert({
              org_id: orgId,
              full_name: v.full_name,
              email: v.email ?? null,
              phone: v.phone ?? null,
              role_applied: v.role_applied ?? "setter",
              region: v.region ?? null,
              source: v.source ?? "form",
              niche: v.niche ?? null,
              years_experience: v.years_experience ?? null,
              notes: v.notes ?? null,
              portfolio_url: v.portfolio_url ?? null,
              audio_url: v.audio_url ?? null,
              responses: (v.responses ?? {}) as never,
              ai_score: score,
              ai_reasoning: reasoning,
              // Recommendation only. Every applicant lands in "applied" and
              // moves only when a human drags them — the same rule the Hiring
              // page's own create path and the Loom grader both follow.
              ai_recommended_stage: recommendStageFromScore(score),
              stage: "applied",
            } as never);
            if (error) throw error;
          } else if (event_type === "vsl_metric_snapshot") {
            const v = vslMetricSnapshotSchema.parse(data);
            const { data: vsl, error: vslErr } = await supabaseAdmin
              .from("vsls")
              .select("id")
              .eq("org_id", orgId)
              .eq("wistia_video_id", v.wistia_video_id)
              .maybeSingle();
            if (vslErr) throw vslErr;
            if (!vsl) {
              return jsonRes(
                {
                  error: `No VSL found for wistia_video_id "${v.wistia_video_id}" — create it in AscendOS first`,
                },
                404,
              );
            }
            const capturedAt = v.captured_at ?? new Date().toISOString();
            const capturedDate = capturedAt.slice(0, 10);

            // One automated snapshot per video per day: check first (handles
            // the common case cheaply), then rely on the partial unique index
            // (migration 20260923..._vsl_metric_snapshots_daily_uniqueness.sql)
            // as the race-safe backstop — a 23505 from that index is treated
            // as an already-recorded duplicate, not an error.
            const { data: existing, error: existingErr } = await supabaseAdmin
              .from("vsl_metric_snapshots")
              .select("id")
              .eq("vsl_id", vsl.id)
              .eq("source", "api")
              .gte("captured_at", `${capturedDate}T00:00:00.000Z`)
              .lt("captured_at", `${capturedDate}T23:59:59.999Z`)
              .maybeSingle();
            if (existingErr) throw existingErr;
            if (existing) return jsonRes({ ok: true, event_type, duplicate: true });

            const { error: insertErr } = await supabaseAdmin.from("vsl_metric_snapshots").insert({
              vsl_id: vsl.id,
              org_id: orgId,
              video_name: v.video_name ?? null,
              total_plays: v.total_plays ?? 0,
              unique_viewers: v.unique_viewers ?? 0,
              play_rate: v.play_rate ?? 0,
              avg_percent_watched: v.avg_percent_watched ?? 0,
              page_loads: v.page_loads ?? 0,
              engagement_json: (v.engagement_json ?? null) as never,
              captured_at: capturedAt,
              source: "api",
            });
            if (insertErr) {
              if (insertErr.code === "23505")
                return jsonRes({ ok: true, event_type, duplicate: true });
              throw insertErr;
            }
          }

          await supabaseAdmin.from("events").insert({
            org_id: orgId,
            event_type: `ingest.${event_type}`,
            subject_type: event_type,
            payload: data as never,
          });

          return jsonRes({ ok: true, event_type });
        } catch (e) {
          console.error("[ingest] insert error", e);
          return jsonRes({ error: "Request could not be processed" }, 400);
        }
      },
    },
  },
});
