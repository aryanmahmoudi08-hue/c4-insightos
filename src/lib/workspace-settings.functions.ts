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
  /** Default weekly reel target shown in Content Command Center's Content Signals section. */
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

const HttpsUrl = z
  .string()
  .trim()
  .refine((value) => !value || /^https:\/\//i.test(value), "Use an HTTPS URL.");
const TypeformUrl = HttpsUrl;

const EodSettings = z.object({
  /** Fallback Typeform for users without a specific user or role assignment. */
  defaultUrl: TypeformUrl.default(""),
  /** Role keys remain free-form so new rep roles do not require a migration. */
  roleUrls: z.record(z.string(), TypeformUrl).default({}),
  /** User-id overrides win over roleUrls and defaultUrl. */
  userUrls: z.record(z.string(), TypeformUrl).default({}),
});

const SchedulingSettings = z.object({
  /** The workspace's own Calendly scheduling link — where "Book a meeting"
   * on a CRM card sends you. Cancel and Reschedule do NOT use this: Calendly
   * issues per-booking URLs that the webhook already stores on the call row,
   * and those open the specific booking rather than a blank calendar. Empty
   * means nobody has set one, and the CRM card says so instead of offering a
   * button that goes nowhere. */
  calendlyUrl: HttpsUrl.default(""),
});

const NotificationSettings = z.object({
  /** IANA zone the business runs on (e.g. "America/New_York"). Defines what
   * "today" and "nightly" mean for the scheduled reports. Empty means unset,
   * and the daily/weekly reports do not send rather than guess — every
   * date-only window computed in UTC lost the evening, which is when calls
   * happen. */
  timeZone: z.string().trim().default(""),
  /** The Calls-on-Calendar touchpoint that means "this call is confirmed".
   * Ticking it fires call.confirmed; not ticking it by the touchpoint's own
   * window close fires call.unconfirmed. Morning-of by default: later steps
   * are logistics on a call already believed to be happening. */
  confirmTouchpoint: z
    .enum(["night_before", "morning", "one_hour", "thirty_min", "ten_min"])
    .default("morning"),
  /** Local hour (0–23) the daily sales report sends, covering that day. */
  dailyReportHour: z.number().int().min(0).max(23).default(23),
  /** Local weekday (0 = Sunday) the weekly report sends, covering the seven
   * days ending that day. */
  weeklyReportDay: z.number().int().min(0).max(6).default(0),
  /** Local hour (0–23) the day's content schedule posts. Morning, so it is
   * read before the day's posting starts. */
  contentScheduleHour: z.number().int().min(0).max(23).default(8),
  /** Discord role IDs for the pings a message decides itself, rather than
   * the channel's: the unconfirmed-call alerts (@Setter, then @Setter
   * @Closer from an hour out) and the "CALL THEM ASAP" / "FOLLOW UP ASAP"
   * messages. Empty = those messages post without a ping. */
  discordSetterRoleId: z
    .string()
    .trim()
    .regex(/^\d*$/, "A Discord role ID is digits only")
    .default(""),
  discordCloserRoleId: z
    .string()
    .trim()
    .regex(/^\d*$/, "A Discord role ID is digits only")
    .default(""),
});

export const WorkspaceSettingsSchema = z.object({
  content_engine: ContentEngineSettings.default({}),
  alerts: AlertSettings.default({}),
  clients: ClientSettings.default({}),
  funnel_instrument: FunnelInstrumentSettings.default({}),
  eod: EodSettings.default({}),
  scheduling: SchedulingSettings.default({}),
  notifications: NotificationSettings.default({}),
});

export type WorkspaceSettings = z.infer<typeof WorkspaceSettingsSchema>;
export type ContentEngineSettingsT = WorkspaceSettings["content_engine"];
export type AlertSettingsT = WorkspaceSettings["alerts"];
export type ClientSettingsT = WorkspaceSettings["clients"];
export type FunnelInstrumentSettingsT = WorkspaceSettings["funnel_instrument"];
export type EodSettingsT = WorkspaceSettings["eod"];
export type SchedulingSettingsT = WorkspaceSettings["scheduling"];
export type NotificationSettingsT = WorkspaceSettings["notifications"];

/** Used wherever settings haven't loaded yet, or by any server logic that
 * wants documented defaults without a round-trip (e.g. tests, cold paths). */
export const DEFAULT_WORKSPACE_SETTINGS: WorkspaceSettings = WorkspaceSettingsSchema.parse({});

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
    scheduling: raw.scheduling ?? {},
    notifications: raw.notifications ?? {},
  });
}

/** Exported for the scheduler, which reads `organizations.settings` itself
 * with the service-role client rather than through a member's session. */
export { parseStoredSettings };

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
  scheduling: SchedulingSettings.partial().optional(),
  notifications: NotificationSettings.partial().optional(),
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
      scheduling: { ...current.scheduling, ...(data.scheduling ?? {}) },
      notifications: { ...current.notifications, ...(data.notifications ?? {}) },
    };
    const { error: upErr } = await supabase
      .from("organizations")
      .update({ settings: { ...raw, ...next } })
      .eq("id", data.orgId);
    if (upErr) throw new Error(upErr.message);
    return next;
  });
