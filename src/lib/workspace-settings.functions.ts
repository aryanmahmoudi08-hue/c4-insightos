import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Every field here is a number this project's audit found buried as a
// literal somewhere in the app — see the Content Signals / Bottleneck
// Engine de-fabrication plan, Part 4. Defaults match what's documented
// there (confirmed with the workspace owner, not picked unilaterally).
const ContentEngineSettings = z.object({
  /** Below this many same-(mechanism×platform) pieces with metrics logged,
   * classifyPerformance() returns insufficient_data instead of a verdict. */
  minBucketSample: z.number().int().min(1).max(200).default(6),
  /** Trailing baseline window, count-based (last N pieces per bucket, not
   * calendar days — chosen so low/uneven posting volume never thins the
   * comparison set just because a week was slow). */
  baselineWindowSize: z.number().int().min(1).max(500).default(20),
  /** Below this total demand-signal weight, the recommended-mix card is
   * badged "limited data" instead of presented as equally confident. */
  minTotalSignalWeight: z.number().min(0).max(10000).default(15),
  /** Default weekly reel target shown on /content-signals. */
  weeklyReelTarget: z.number().int().min(1).max(50).default(6),
});

const AlertSettings = z.object({
  /** Calibrated to the workspace's OWN baseline, never an industry floor —
   * see feedback_alert_calibration. */
  showRateAlertPct: z.number().min(0).max(100).default(70),
  closeRateAlertPct: z.number().min(0).max(100).default(38),
});

const ClientSettings = z.object({
  /** Renewal-proximity-only at-risk window — health_score is a dead column
   * (never computed anywhere) and is no longer read; see Part 4's decision. */
  renewalAtRiskDays: z.number().int().min(1).max(365).default(30),
});

const FunnelInstrumentSettings = z.object({
  /** Below this many records at the upstream stage, the funnel detail
   * panel's "what's capping it" / "what's working" sections show an explicit
   * insufficient-data state instead of a derived claim — same discipline as
   * content_engine.minBucketSample, new domain, no existing baseline to
   * calibrate against yet (starting default, not a calibrated fact). */
  minCapSample: z.number().int().min(1).max(200).default(10),
});

const TypeformUrl = z
  .string()
  .trim()
  .refine((value) => !value || /^https:\/\//i.test(value), "Use an HTTPS Typeform URL.");

const EodSettings = z.object({
  /** Fallback Typeform for users without a specific user or role assignment. */
  defaultUrl: TypeformUrl.default(""),
  /** Role keys remain free-form so new rep roles do not require a migration. */
  roleUrls: z.record(z.string(), TypeformUrl).default({}),
  /** User-id overrides win over roleUrls and defaultUrl. */
  userUrls: z.record(z.string(), TypeformUrl).default({}),
});

export const WorkspaceSettingsSchema = z.object({
  content_engine: ContentEngineSettings.default({}),
  alerts: AlertSettings.default({}),
  clients: ClientSettings.default({}),
  funnel_instrument: FunnelInstrumentSettings.default({}),
  eod: EodSettings.default({}),
});

export type WorkspaceSettings = z.infer<typeof WorkspaceSettingsSchema>;
export type ContentEngineSettingsT = WorkspaceSettings["content_engine"];
export type AlertSettingsT = WorkspaceSettings["alerts"];
export type ClientSettingsT = WorkspaceSettings["clients"];
export type FunnelInstrumentSettingsT = WorkspaceSettings["funnel_instrument"];
export type EodSettingsT = WorkspaceSettings["eod"];

/** Used wherever settings haven't loaded yet, or by any server logic that
 * wants documented defaults without a round-trip (e.g. tests, cold paths). */
export const DEFAULT_WORKSPACE_SETTINGS: WorkspaceSettings = WorkspaceSettingsSchema.parse({});

/** Development-preview-only storage key; production settings remain Supabase-backed. */
export const DEV_EOD_SETTINGS_STORAGE_KEY = "c4-dev-eod-settings";

export function readDevEodSettings(): WorkspaceSettings {
  if (typeof window !== "undefined") {
    try {
      const stored = sessionStorage.getItem(DEV_EOD_SETTINGS_STORAGE_KEY);
      if (stored) return WorkspaceSettingsSchema.parse(JSON.parse(stored));
    } catch {
      // Ignore malformed local preview state and use documented defaults.
    }
  }
  return DEFAULT_WORKSPACE_SETTINGS;
}

function parseStoredSettings(raw: Record<string, unknown>): WorkspaceSettings {
  // organizations.settings is a shared free-form jsonb column — ingest.functions.ts
  // already stores a top-level `ingest_token` key there. Only read/touch our
  // own namespaced keys; never assume the object only contains ours.
  return WorkspaceSettingsSchema.parse({
    content_engine: raw.content_engine ?? {},
    alerts: raw.alerts ?? {},
    clients: raw.clients ?? {},
    funnel_instrument: raw.funnel_instrument ?? {},
    eod: raw.eod ?? {},
  });
}

type Sb = SupabaseClient<Database>;

/** Plain, server-side-reusable fetch — called directly by other server logic
 * (e.g. content-signals.server.ts) that needs the resolved config, not just
 * by this file's own RPC wrapper below. No paired .server.ts: this uses the
 * caller's own RLS-scoped client (not supabaseAdmin), same as
 * ingest.functions.ts — RLS is the real authorization boundary for writes
 * (see "owners update org" policy, owner/admin only); reads are member-scoped. */
export async function fetchWorkspaceSettings(sb: Sb, orgId: string): Promise<WorkspaceSettings> {
  const { data: org, error } = await sb
    .from("organizations")
    .select("settings")
    .eq("id", orgId)
    .single();
  if (error) throw new Error(error.message);
  return parseStoredSettings((org.settings ?? {}) as Record<string, unknown>);
}

export const getWorkspaceSettingsFn = createServerFn({ method: "POST" })
  .inputValidator((d: { orgId: string }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => fetchWorkspaceSettings(context.supabase, data.orgId));

const UpdateInput = z.object({
  orgId: z.string().uuid(),
  content_engine: ContentEngineSettings.partial().optional(),
  alerts: AlertSettings.partial().optional(),
  clients: ClientSettings.partial().optional(),
  funnel_instrument: FunnelInstrumentSettings.partial().optional(),
  eod: EodSettings.partial().optional(),
});

export const updateWorkspaceSettingsFn = createServerFn({ method: "POST" })
  .inputValidator((d) => UpdateInput.parse(d))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: org, error } = await supabase
      .from("organizations")
      .select("settings")
      .eq("id", data.orgId)
      .single();
    if (error) throw new Error(error.message);
    const raw = (org.settings ?? {}) as Record<string, unknown>;
    const current = parseStoredSettings(raw);
    const next: WorkspaceSettings = {
      content_engine: { ...current.content_engine, ...(data.content_engine ?? {}) },
      alerts: { ...current.alerts, ...(data.alerts ?? {}) },
      clients: { ...current.clients, ...(data.clients ?? {}) },
      funnel_instrument: { ...current.funnel_instrument, ...(data.funnel_instrument ?? {}) },
      eod: {
        ...current.eod,
        ...(data.eod ?? {}),
        roleUrls: { ...current.eod.roleUrls, ...(data.eod?.roleUrls ?? {}) },
        userUrls: { ...current.eod.userUrls, ...(data.eod?.userUrls ?? {}) },
      },
    };
    const { error: upErr } = await supabase
      .from("organizations")
      .update({ settings: { ...raw, ...next } })
      .eq("id", data.orgId);
    if (upErr) throw new Error(upErr.message);
    return next;
  });
