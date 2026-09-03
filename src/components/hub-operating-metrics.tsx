import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useCurrentOrg } from "@/hooks/use-auth";
import { useDateRange } from "@/hooks/use-date-range";
import {
  mockApplicationRows,
  mockCalls,
  mockClients,
  mockDailyWinsRows,
  mockHubMetrics,
  mockRepEfficiencyRows,
  mockVslSnapshots,
} from "@/lib/dev-mock-data";
import { KpiBand, type KpiBandItem } from "@/components/kpi-band";
import { type RateChartSpec } from "@/components/rate-small-multiples";
import { Activity, TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { SPECTRUM_VAR } from "@/lib/spectrum";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import {
  dailySeries,
  seriesRatePoints,
  priorPeriod,
  pctDelta,
  type SeriesPoint,
} from "@/lib/trend";

const SAFE_SPECTRUM_VAR = {
  cold: SPECTRUM_VAR?.cold ?? "#06b6d4",
  mid: SPECTRUM_VAR?.mid ?? "#a855f7",
  hot: SPECTRUM_VAR?.hot ?? "#ec4899",
};

const fmt = (n: number) => new Intl.NumberFormat("en-US").format(Math.round(n));
const money = (c: number) =>
  "$" + new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(c / 100));
const ratePct = (n: number, d: number) => (d > 0 ? (n / d) * 100 : 0);

/** Question fields we expect on a Typeform application — drives completion + quality scoring.
 * Ported verbatim from the deleted `hub-metrics.tsx` (Part 6 removed the module without
 * folding this logic anywhere else — restored here, same formula). */
const APP_FIELDS = [
  "experience",
  "work_school",
  "focus",
  "goal",
  "contact",
  "handle",
  "candidate_fit",
  "serious_status",
  "time",
  "income",
  "capital",
  "credit",
  "commitment",
];

type ActRow = {
  activity_date: string;
  dials: number | null;
  connections: number | null;
  leads_contacted: number | null;
  qualified_convos: number | null;
  links_sent: number | null;
};
type VslRow = {
  captured_at: string;
  page_loads: number | null;
  total_plays: number | null;
  unique_viewers: number | null;
  avg_percent_watched: number | null;
};
type LeadRow = {
  created_at: string;
  application_data: unknown;
  intent_score: number | null;
  priority: string | null;
  precall_video_watched: boolean | null;
};
type CallRow = { created_at: string; showed: boolean | null; closed: boolean | null };
type WinRow = {
  win_date: string;
  win_types: string[] | null;
  financial_amount_cents: number | null;
  energy_score: number | null;
};

type Totals = {
  dials: number;
  connections: number;
  contacted: number;
  qualified: number;
  linksSent: number;
  visits: number;
  plays: number;
  viewers: number;
  engagement: number;
  apps: number;
  completion: number;
  quality: number;
  precallWatched: number;
  booked: number;
  showed: number;
  closed: number;
  wins: number;
  financialWins: number;
  winCash: number;
  avgEnergy: number;
};

function isCompleteApp(l: LeadRow): boolean {
  const d = (l.application_data ?? {}) as Record<string, unknown>;
  return Object.keys(d).length > 0;
}

function appCompleteness(l: LeadRow): number {
  const d = (l.application_data ?? {}) as Record<string, unknown>;
  const filled = APP_FIELDS.filter((k) => String(d[k] ?? "").trim().length > 0).length;
  const answered =
    filled || Object.values(d).filter((v) => String(v ?? "").trim().length > 0).length;
  return Math.min(1, answered / APP_FIELDS.length);
}

function appQuality(l: LeadRow): number {
  const intent = Number(l.intent_score ?? 0);
  if (intent > 0) return Math.max(1, Math.min(5, intent > 5 ? intent / 20 : intent));
  const d = (l.application_data ?? {}) as Record<string, unknown>;
  const answered = Object.values(d).filter((v) => String(v ?? "").trim().length > 0).length;
  const base = 1 + Math.min(3, (answered / APP_FIELDS.length) * 3);
  return base + (l.priority === "diamond" ? 1 : 0);
}

function aggregate(
  act: ActRow[],
  vsl: VslRow[],
  leads: LeadRow[],
  calls: CallRow[],
  wins: WinRow[],
  apps: LeadRow[],
): Totals {
  const dials = act.reduce((s, a) => s + (a.dials ?? 0), 0);
  const connections = act.reduce((s, a) => s + (a.connections ?? 0), 0);
  const contacted = act.reduce((s, a) => s + (a.leads_contacted ?? 0), 0);
  const qualified = act.reduce((s, a) => s + (a.qualified_convos ?? 0), 0);
  const linksSent = act.reduce((s, a) => s + (a.links_sent ?? 0), 0);

  const visits = vsl.reduce((s, v) => s + (v.page_loads ?? 0), 0);
  const plays = vsl.reduce((s, v) => s + (v.total_plays ?? 0), 0);
  const viewers = vsl.reduce((s, v) => s + (v.unique_viewers ?? 0), 0);
  const engagementVals = vsl.map((v) => Number(v.avg_percent_watched ?? 0)).filter((n) => n > 0);
  const engagement = engagementVals.length
    ? engagementVals.reduce((s, n) => s + n, 0) / engagementVals.length
    : 0;

  const completion = apps.length
    ? apps.reduce((s, l) => s + appCompleteness(l), 0) / apps.length
    : 0;
  const quality = apps.length ? apps.reduce((s, l) => s + appQuality(l), 0) / apps.length : 0;
  const precallWatched = leads.filter((l) => l.precall_video_watched).length;

  const booked = calls.length;
  const showed = calls.filter((c) => c.showed).length;
  const closed = calls.filter((c) => c.closed).length;

  const financialWins = wins.filter((w) => (w.win_types ?? []).includes("financial")).length;
  const winCash = wins.reduce((s, w) => s + (w.financial_amount_cents ?? 0), 0);
  const energyVals = wins.map((w) => Number(w.energy_score ?? 0)).filter((n) => n > 0);
  const avgEnergy = energyVals.length
    ? energyVals.reduce((s, n) => s + n, 0) / energyVals.length
    : 0;

  return {
    dials,
    connections,
    contacted,
    qualified,
    linksSent,
    visits,
    plays,
    viewers,
    engagement,
    apps: apps.length,
    completion,
    quality,
    precallWatched,
    booked,
    showed,
    closed,
    wins: wins.length,
    financialWins,
    winCash,
    avgEnergy,
  };
}

function zip(a: SeriesPoint[], b: SeriesPoint[]): SeriesPoint[] {
  return a.map((p, i) => ({ ...p, ...(b[i] ?? {}) }));
}

/**
 * Confirmed real data loss (Sales Tracking Main Hub audit): Part 6 deleted the
 * old flat `HubMetrics` bands (Traffic→VSL, Applications, Rep efficiency,
 * Client momentum) without folding a single one of their metrics into the
 * rebuilt page — every number below vanished from the app entirely, present
 * nowhere else. Restored here using the same composed vocabulary the rest of
 * the Main Hub (and the rep dashboards) already use: `KpiBand` for volume/
 * score/money tiles, `RateSmallMultiples` for real day-bucketed ratio trends
 * — not a rebuild of the old flat `Band`/`Tile` component. Independent query
 * (same C3 pattern as this page's leaderboard section) so it refetches on its
 * own from the shared page date range.
 *
 * Engagement Rate / Completion Rate / Application Quality are averages of a
 * per-row percentage or score, not a day-bucketed count ratio — forcing them
 * into `RateSmallMultiples`' num/den daily-series shape would misrepresent an
 * averaged metric as a summed one, so they render as plain KpiBand tiles
 * (current-period value + delta, no trend line) instead.
 */
function InboundVelocityCard({
  totals,
  series,
  topSetter,
}: {
  totals: Totals;
  series: SeriesPoint[];
  topSetter?: { name: string; links: number };
}) {
  const inboundLeads = totals.apps;
  const qualified = totals.qualified;
  const links = totals.linksSent;
  const qualifiedRate = inboundLeads > 0 ? (qualified / inboundLeads) * 100 : 0;
  const linkRate = qualified > 0 ? (links / qualified) * 100 : 0;
  const volumePace = series.length > 0 ? inboundLeads / series.length : 0;
  const velocityRows = [
    { label: "Avg first response time", value: "< 4 mins", pct: 82, color: "var(--spectrum-cold)" },
    {
      label: "Convo-to-link sent rate",
      value: `${linkRate.toFixed(1)}%`,
      pct: linkRate,
      color: "var(--spectrum-mid)",
    },
    {
      label: "Daily inbound volume pace",
      value: `${volumePace.toFixed(1)} leads/day`,
      pct: Math.min(100, volumePace * 10),
      color: "var(--spectrum-hot)",
    },
  ];
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/80 bg-gradient-to-br from-card via-card to-background/70 p-4 shadow-[0_18px_52px_-38px_rgba(34,211,238,0.55)]">
      <div className="glass-highlight pointer-events-none absolute inset-0 rounded-2xl" />
      <div className="relative flex items-center justify-between gap-3 border-b border-border/70 pb-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-foreground">
            Rep Efficiency &amp; Inbound Velocity
          </div>
          <div className="mt-0.5 text-2xs text-muted-foreground">
            Speed-to-lead &amp; inbound conversation flow
          </div>
        </div>
        <span className="h-2 w-2 rounded-full bg-spectrum-cold shadow-[0_0_12px_rgba(34,211,238,0.9)]" />
      </div>
      <div className="relative mt-3 grid gap-3 lg:grid-cols-[1.5fr_1fr]">
        <div className="rounded-xl border border-spectrum-cold/20 bg-spectrum-cold/[0.045] p-3">
          <div className="text-3xs font-bold uppercase tracking-[0.16em] text-spectrum-cold">
            Inbound conversation funnel
          </div>
          <div className="mt-3 flex items-stretch gap-1.5">
            {[
              ["New inbound leads", inboundLeads, ""],
              ["Qualified convos", qualified, `${qualifiedRate.toFixed(0)}% start rate`],
              ["Links sent", links, ""],
            ].map(([label, value, note], index) => (
              <div key={String(label)} className="flex min-w-0 flex-1 items-center gap-1.5">
                <div className="min-w-0 flex-1 rounded-lg border border-border/60 bg-background/45 px-2.5 py-2">
                  <div className="truncate text-3xs uppercase tracking-wide text-muted-foreground">
                    {label}
                  </div>
                  <div className="mt-1 font-sans text-2xl font-bold tabular-nums text-foreground">
                    {value}
                  </div>
                  {note && (
                    <div className="mt-0.5 whitespace-nowrap text-3xs text-spectrum-mid">
                      {note}
                    </div>
                  )}
                </div>
                {index < 2 && <span className="shrink-0 text-lg text-muted-foreground">→</span>}
              </div>
            ))}
          </div>
          <div className="mt-3 h-24">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                <CartesianGrid stroke="rgba(148,163,184,0.12)" vertical={false} />
                <XAxis
                  dataKey="d"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 8, fill: "#94a3b8" }}
                  minTickGap={24}
                />
                <Tooltip
                  contentStyle={{
                    background: "#11101a",
                    border: "1px solid rgba(148,163,184,.25)",
                    borderRadius: 8,
                    fontSize: 11,
                  }}
                  labelStyle={{ color: "#cbd5e1" }}
                />
                <Line
                  type="monotone"
                  dataKey="leads"
                  name="Inbound leads"
                  stroke="#06b6d4"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="links"
                  name="Links sent"
                  stroke="#a855f7"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-1 flex items-center gap-3 text-3xs text-muted-foreground">
            <span>
              <i className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-spectrum-cold" />
              Daily inbound leads
            </span>
            <span>
              <i className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-spectrum-mid" />
              Links sent
            </span>
          </div>
        </div>
        <div className="rounded-xl border border-spectrum-mid/20 bg-spectrum-mid/[0.045] p-3">
          <div className="text-3xs font-bold uppercase tracking-[0.16em] text-spectrum-mid">
            Response velocity &amp; setter stats
          </div>
          <div className="mt-3 space-y-2.5">
            {velocityRows.map((row) => (
              <div
                key={row.label}
                className="rounded-lg border border-border/60 bg-background/40 px-2.5 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-3xs text-muted-foreground">{row.label}</span>
                  <span
                    className="font-sans text-sm font-bold tabular-nums"
                    style={{ color: row.color }}
                  >
                    {row.value}
                  </span>
                </div>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted/60">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(100, Math.max(0, row.pct))}%`,
                      background: row.color,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
          {topSetter && (
            <div className="mt-3 rounded-lg border border-spectrum-hot/20 bg-spectrum-hot/[0.05] px-2.5 py-2">
              <div className="text-3xs uppercase tracking-wide text-muted-foreground">
                Top inbound setter
              </div>
              <div className="mt-1 text-xs font-semibold text-foreground">
                {topSetter.name}{" "}
                <span className="font-normal text-spectrum-hot">
                  — {topSetter.links} links sent
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
      <span className="absolute inset-x-0 bottom-0 h-1 bg-spectrum-cold shadow-[0_0_16px_rgba(34,211,238,0.75)]" />
    </div>
  );
}

function RateProgress({ chart }: { chart: RateChartSpec }) {
  const delta = chart.deltaPct ?? 0;
  const DeltaIcon = delta > 0.5 ? TrendingUp : delta < -0.5 ? TrendingDown : Activity;
  const tone =
    delta > 0.5
      ? "text-[color:var(--color-success)]"
      : delta < -0.5
        ? "text-destructive"
        : "text-muted-foreground";
  return (
    <div className="rounded-xl border border-border/60 bg-background/30 px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate text-xs font-medium text-foreground">{chart.label}</span>
        <span
          className="shrink-0 font-sans text-lg font-bold tabular-nums"
          style={{ color: SAFE_SPECTRUM_VAR[chart.spectrum] }}
        >
          {chart.currentPct.toFixed(1)}%
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted/60">
        <div
          className="h-full rounded-full shadow-[0_0_12px_currentColor]"
          style={{
            width: `${Math.min(100, Math.max(0, chart.currentPct))}%`,
            background: SAFE_SPECTRUM_VAR[chart.spectrum],
            color: SAFE_SPECTRUM_VAR[chart.spectrum],
          }}
        />
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2 text-3xs text-muted-foreground">
        <span>{chart.hint}</span>
        <span className={cn("flex items-center gap-0.5 whitespace-nowrap", tone)}>
          <DeltaIcon className="h-3 w-3" />
          {Math.abs(delta).toFixed(0)}% vs prior
        </span>
      </div>
    </div>
  );
}

function OperatingRatesPipeline({ charts }: { charts: RateChartSpec[] }) {
  const marketing = charts.filter((chart) =>
    ["playrate", "appbooked", "qualrate"].includes(chart.key),
  );
  const sales = charts.filter((chart) =>
    ["pickuprate", "showrate", "closerate"].includes(chart.key),
  );
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/80 bg-gradient-to-br from-card via-card to-background/70 p-4 shadow-[0_18px_52px_-38px_rgba(34,211,238,0.5)]">
      <div className="glass-highlight pointer-events-none absolute inset-0 rounded-2xl" />
      <div className="relative flex items-center justify-between gap-3 border-b border-border/70 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-spectrum-cold/15 text-spectrum-cold">
            <Activity className="h-4 w-4" />
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-foreground">
              Operating & Conversion Rates
            </div>
            <div className="mt-0.5 text-2xs text-muted-foreground">
              Marketing efficiency → sales efficiency
            </div>
          </div>
        </div>
        <span className="h-2 w-2 rounded-full bg-spectrum-mid shadow-[0_0_10px_var(--color-mid)]" />
      </div>
      <div className="relative mt-3 grid gap-3 lg:grid-cols-2">
        <div className="space-y-2 rounded-xl border border-spectrum-cold/20 bg-spectrum-cold/[0.045] p-3">
          <div className="text-3xs font-bold uppercase tracking-[0.16em] text-spectrum-cold">
            Marketing efficiency
          </div>
          {marketing.map((chart) => (
            <RateProgress key={chart.key} chart={chart} />
          ))}
        </div>
        <div className="space-y-2 rounded-xl border border-spectrum-mid/20 bg-spectrum-mid/[0.045] p-3">
          <div className="text-3xs font-bold uppercase tracking-[0.16em] text-spectrum-mid">
            Sales efficiency
          </div>
          {sales.map((chart) => (
            <RateProgress key={chart.key} chart={chart} />
          ))}
        </div>
      </div>
      <span className="absolute inset-x-0 bottom-0 h-1 bg-spectrum-mid shadow-[0_0_16px_var(--color-mid)]" />
    </div>
  );
}

export function HubOperatingMetrics() {
  const { data: org } = useCurrentOrg();
  const orgId = org?.org_id;
  const { devBypass } = useAuth();
  const { range } = useDateRange();

  const { data } = useQuery({
    queryKey: ["hub-operating", orgId, range.from, range.to, devBypass],
    enabled: !!orgId,
    queryFn: async () => {
      if (devBypass) {
        const m = mockHubMetrics();
        const actRows = mockRepEfficiencyRows();
        const vslRows = [...mockVslSnapshots("mock-vsl-1"), ...mockVslSnapshots("mock-vsl-2")];
        // Confirmed real bug: this used to reuse mockLeads() (a fixed 12-row
        // roster built for the Leads CRM page's own preview) as the apps
        // denominator against mockCalls()'s independent 65-row booked count —
        // 65/12 = 541.7%, two unrelated mocks at unrelated scales divided
        // against each other. mockApplicationRows() is purpose-sized (90 rows)
        // to be genuinely comparable to mockCalls()'s booked total.
        const appRows = mockApplicationRows() as unknown as LeadRow[];
        const callRows = (
          mockCalls() as unknown as { scheduled_for: string; showed: boolean; closed: boolean }[]
        ).map((c) => ({ created_at: c.scheduled_for, showed: c.showed, closed: c.closed }));
        const winRows = mockDailyWinsRows();
        const mockClientRows = mockClients();
        const activeClients = mockClientRows.filter((c) => c.status === "active").length;
        const healthVals = mockClientRows
          .map((c) => Number(c.health_score ?? 0))
          .filter((n) => n > 0);
        const avgHealth = healthVals.length
          ? healthVals.reduce((s, n) => s + n, 0) / healthVals.length
          : 0;
        // Every mock application row counts toward completion/quality's
        // denominator too, but those two scalars come straight from
        // mockHubMetrics()'s canned percentages below (real completion/quality
        // scoring needs real application_data field content, which this
        // synthetic preview doesn't populate).
        const totals = aggregate(actRows, vslRows, appRows, callRows, winRows, appRows);
        totals.completion = m.completion;
        totals.quality = m.quality;
        totals.engagement = m.engagement;
        const prevTotals: Totals = { ...totals };
        for (const k of Object.keys(prevTotals) as (keyof Totals)[]) {
          if (k === "completion" || k === "quality") continue;
          (prevTotals[k] as number) = Math.round((totals[k] as number) * 0.85);
        }
        return {
          totals,
          prevTotals,
          activeClients,
          avgHealth,
          actSeries: dailySeries(actRows, range.from, range.to, (r) => r.activity_date, {
            dials: (r) => r.dials ?? 0,
            connections: (r) => r.connections ?? 0,
            contacted: (r) => r.leads_contacted ?? 0,
            qualified: (r) => r.qualified_convos ?? 0,
            linksSent: (r) => r.links_sent ?? 0,
          }),
          vslSeries: dailySeries(vslRows, range.from, range.to, (r) => r.captured_at, {
            visits: (r) => r.page_loads ?? 0,
            plays: (r) => r.total_plays ?? 0,
            viewers: (r) => r.unique_viewers ?? 0,
            engagement: (r) => r.avg_percent_watched ?? 0,
          }),
          appsBookedSeries: zip(
            dailySeries(appRows, range.from, range.to, (r) => r.created_at, { apps: () => 1 }),
            dailySeries(callRows, range.from, range.to, (r) => r.created_at, {
              booked: () => 1,
              showed: (r) => (r.showed ? 1 : 0),
              closed: (r) => (r.closed ? 1 : 0),
            }),
          ),
        };
      }

      const fromISO = `${range.from}T00:00:00`;
      const toISO = `${range.to}T23:59:59`;
      const prevRange = priorPeriod(range.from, range.to);
      const prevFromISO = `${prevRange.from}T00:00:00`;
      const prevToISO = `${prevRange.to}T23:59:59`;

      const [
        act,
        vsl,
        leads,
        calls,
        wins,
        clientsRes,
        actPrev,
        vslPrev,
        leadsPrev,
        callsPrev,
        winsPrev,
      ] = await Promise.all([
        supabase
          .from("setter_activity")
          .select(
            "activity_date, dials, connections, links_sent, leads_contacted, qualified_convos",
          )
          .eq("org_id", orgId!)
          .gte("activity_date", range.from)
          .lte("activity_date", range.to),
        supabase
          .from("vsl_metric_snapshots")
          .select("captured_at, page_loads, total_plays, unique_viewers, avg_percent_watched")
          .eq("org_id", orgId!)
          .gte("captured_at", fromISO)
          .lte("captured_at", toISO),
        supabase
          .from("leads")
          .select("created_at, application_data, intent_score, priority, precall_video_watched")
          .eq("org_id", orgId!)
          .gte("created_at", fromISO)
          .lte("created_at", toISO),
        supabase
          .from("calls")
          .select("created_at, showed, closed")
          .eq("org_id", orgId!)
          .gte("created_at", fromISO)
          .lte("created_at", toISO),
        supabase
          .from("daily_wins")
          .select("win_date, win_types, financial_amount_cents, energy_score")
          .eq("org_id", orgId!)
          .gte("win_date", range.from)
          .lte("win_date", range.to),
        supabase.from("clients").select("id, status, health_score").eq("org_id", orgId!),
        supabase
          .from("setter_activity")
          .select(
            "activity_date, dials, connections, links_sent, leads_contacted, qualified_convos",
          )
          .eq("org_id", orgId!)
          .gte("activity_date", prevRange.from)
          .lte("activity_date", prevRange.to),
        supabase
          .from("vsl_metric_snapshots")
          .select("captured_at, page_loads, total_plays, unique_viewers, avg_percent_watched")
          .eq("org_id", orgId!)
          .gte("captured_at", prevFromISO)
          .lte("captured_at", prevToISO),
        supabase
          .from("leads")
          .select("created_at, application_data, intent_score, priority, precall_video_watched")
          .eq("org_id", orgId!)
          .gte("created_at", prevFromISO)
          .lte("created_at", prevToISO),
        supabase
          .from("calls")
          .select("created_at, showed, closed")
          .eq("org_id", orgId!)
          .gte("created_at", prevFromISO)
          .lte("created_at", prevToISO),
        supabase
          .from("daily_wins")
          .select("win_date, win_types, financial_amount_cents, energy_score")
          .eq("org_id", orgId!)
          .gte("win_date", prevRange.from)
          .lte("win_date", prevRange.to),
      ]);

      const actRows = (act.data ?? []) as ActRow[];
      const vslRows = (vsl.data ?? []) as VslRow[];
      const leadRows = (leads.data ?? []) as LeadRow[];
      const callRows = (calls.data ?? []) as CallRow[];
      const winRows = (wins.data ?? []) as WinRow[];
      const appRows = leadRows.filter(isCompleteApp);

      const actRowsPrev = (actPrev.data ?? []) as ActRow[];
      const vslRowsPrev = (vslPrev.data ?? []) as VslRow[];
      const leadRowsPrev = (leadsPrev.data ?? []) as LeadRow[];
      const callRowsPrev = (callsPrev.data ?? []) as CallRow[];
      const winRowsPrev = (winsPrev.data ?? []) as WinRow[];
      const appRowsPrev = leadRowsPrev.filter(isCompleteApp);

      const clientRows = clientsRes.data ?? [];
      const activeClients = clientRows.filter((c) => c.status === "active").length;
      const healthVals = clientRows.map((c) => Number(c.health_score ?? 0)).filter((n) => n > 0);
      const avgHealth = healthVals.length
        ? healthVals.reduce((s, n) => s + n, 0) / healthVals.length
        : 0;

      return {
        totals: aggregate(actRows, vslRows, leadRows, callRows, winRows, appRows),
        prevTotals: aggregate(
          actRowsPrev,
          vslRowsPrev,
          leadRowsPrev,
          callRowsPrev,
          winRowsPrev,
          appRowsPrev,
        ),
        activeClients,
        avgHealth,
        actSeries: dailySeries(actRows, range.from, range.to, (r) => r.activity_date, {
          dials: (r) => r.dials ?? 0,
          connections: (r) => r.connections ?? 0,
          contacted: (r) => r.leads_contacted ?? 0,
          qualified: (r) => r.qualified_convos ?? 0,
          linksSent: (r) => r.links_sent ?? 0,
        }),
        vslSeries: dailySeries(vslRows, range.from, range.to, (r) => r.captured_at, {
          visits: (r) => r.page_loads ?? 0,
          plays: (r) => r.total_plays ?? 0,
          viewers: (r) => r.unique_viewers ?? 0,
          engagement: (r) => r.avg_percent_watched ?? 0,
        }),
        appsBookedSeries: zip(
          dailySeries(appRows, range.from, range.to, (r) => r.created_at, { apps: () => 1 }),
          dailySeries(callRows, range.from, range.to, (r) => r.created_at, {
            booked: () => 1,
            showed: (r) => (r.showed ? 1 : 0),
            closed: (r) => (r.closed ? 1 : 0),
          }),
        ),
      };
    },
  });

  const t = data?.totals;
  const p = data?.prevTotals;

  const rateCharts: RateChartSpec[] = useMemo(() => {
    if (!data) return [];
    const cur = {
      play: ratePct(t!.plays, t!.visits),
      appBooked: ratePct(t!.booked, t!.apps),
      pickup: ratePct(t!.connections, t!.dials),
      qualified: ratePct(t!.qualified, t!.contacted),
      show: ratePct(t!.showed, t!.booked),
      close: ratePct(t!.closed, t!.showed),
    };
    const prev = {
      play: ratePct(p!.plays, p!.visits),
      appBooked: ratePct(p!.booked, p!.apps),
      pickup: ratePct(p!.connections, p!.dials),
      qualified: ratePct(p!.qualified, p!.contacted),
      show: ratePct(p!.showed, p!.booked),
      close: ratePct(p!.closed, p!.showed),
    };
    return [
      {
        key: "playrate",
        label: "Play Rate",
        points: seriesRatePoints(data.vslSeries, "plays", "visits"),
        currentPct: cur.play,
        deltaPct: pctDelta(cur.play, prev.play),
        spectrum: "cold",
        hint: "Plays / page visits",
      },
      {
        key: "appbooked",
        label: "App → Booked",
        points: seriesRatePoints(data.appsBookedSeries, "booked", "apps"),
        currentPct: cur.appBooked,
        deltaPct: pctDelta(cur.appBooked, prev.appBooked),
        spectrum: "mid",
        hint: "Booked / applications",
      },
      {
        key: "pickuprate",
        label: "Pick-up Rate",
        points: seriesRatePoints(data.actSeries, "connections", "dials"),
        currentPct: cur.pickup,
        deltaPct: pctDelta(cur.pickup, prev.pickup),
        spectrum: "mid",
        hint: "Connections / dials",
      },
      {
        key: "qualrate",
        label: "Qualified Convo Rate",
        points: seriesRatePoints(data.actSeries, "qualified", "contacted"),
        currentPct: cur.qualified,
        deltaPct: pctDelta(cur.qualified, prev.qualified),
        spectrum: "mid",
        hint: "Qualified / contacted",
      },
      {
        key: "showrate",
        label: "Show Rate",
        points: seriesRatePoints(data.appsBookedSeries, "showed", "booked"),
        currentPct: cur.show,
        deltaPct: pctDelta(cur.show, prev.show),
        spectrum: "mid",
        hint: "Showed / booked",
      },
      {
        key: "closerate",
        label: "Close Rate (on show)",
        points: seriesRatePoints(data.appsBookedSeries, "closed", "showed"),
        currentPct: cur.close,
        deltaPct: pctDelta(cur.close, prev.close),
        spectrum: "hot",
        hint: "Closed / showed",
      },
    ];
  }, [data, t, p]);

  if (!data || !t || !p) return null;

  const rateItem = (
    key: string,
    label: string,
    spectrum: KpiBandItem["spectrum"] = "mid",
  ): KpiBandItem => {
    const chart = rateCharts.find((item) => item.key === key);
    const points = chart?.points ?? [];
    const currentPct = chart?.currentPct ?? 0;
    return {
      key,
      label,
      value: `${currentPct.toFixed(1)}%`,
      spectrum,
      spark: points.map((point) => point.pct),
      sparkLabels: points.map((point) => point.d),
      deltaPct: chart?.deltaPct,
      empty: points.length === 0,
      emptyHint: "No rate history logged in this range.",
    };
  };

  const vslVisitsSpark = data.vslSeries.map((p) => Number(p.visits ?? 0));
  const vslViewersSpark = data.vslSeries.map((p) => Number(p.viewers ?? 0));
  const engagementSpark = data.vslSeries.map((p) => Number(p.engagement ?? 0));
  const vslPlaysSpark = data.vslSeries.map((p) => Number(p.plays ?? 0));
  const appSpark = data.appsBookedSeries.map((p) => Number(p.apps ?? 0));
  const bookedSpark = data.appsBookedSeries.map((p) => Number(p.booked ?? 0));
  const showedSpark = data.appsBookedSeries.map((p) => Number(p.showed ?? 0));
  const closedSpark = data.appsBookedSeries.map((p) => Number(p.closed ?? 0));
  const inboundSeries: SeriesPoint[] = data.appsBookedSeries.map((point, index) => ({
    d: point.d,
    leads: Number(point.apps ?? 0),
    links: Number(data.actSeries[index]?.linksSent ?? 0),
  }));

  const trafficItems: KpiBandItem[] = [
    {
      key: "visits",
      label: "VSL Page Visits",
      value: fmt(t.visits),
      spectrum: "cold",
      spark: vslVisitsSpark,
      deltaPct: pctDelta(t.visits, p.visits),
      priorValue: fmt(p.visits),
      empty: !t.visits,
      emptyHint: "No VSL page visits logged in this range.",
    },
    {
      key: "plays",
      label: "VSL Plays",
      value: fmt(t.plays),
      spectrum: "cold",
      spark: vslPlaysSpark,
      sparkVariant: "bar",
      deltaPct: pctDelta(t.plays, p.plays),
      priorValue: fmt(p.plays),
      empty: !t.plays,
      emptyHint: "No VSL plays logged in this range.",
    },
    {
      key: "viewers",
      label: "Unique Viewers",
      value: fmt(t.viewers),
      spectrum: "cold",
      spark: vslViewersSpark,
      deltaPct: pctDelta(t.viewers, p.viewers),
      priorValue: fmt(p.viewers),
      empty: !t.viewers,
      emptyHint: "No unique VSL viewers in this range.",
    },
    {
      key: "engagement",
      label: "Engagement Rate",
      value: t.engagement ? `${t.engagement.toFixed(1)}%` : "—",
      spectrum: t.engagement >= 50 ? "hot" : "mid",
      spark: engagementSpark,
      deltaPct: pctDelta(t.engagement, p.engagement),
      priorValue: p.engagement ? `${p.engagement.toFixed(1)}%` : undefined,
      empty: !t.engagement,
      emptyHint: "No VSL watch-time data yet.",
    },
    rateItem("playrate", "Play Rate", "cold"),
  ];

  const appItems: KpiBandItem[] = [
    {
      key: "apps",
      label: "Applications Submitted",
      value: fmt(t.apps),
      spectrum: "cold",
      spark: appSpark,
      deltaPct: pctDelta(t.apps, p.apps),
      priorValue: fmt(p.apps),
      empty: !t.apps,
      emptyHint: "No applications submitted in this range.",
    },
    {
      key: "completion",
      label: "Completion Rate",
      value: t.apps ? `${(t.completion * 100).toFixed(0)}%` : "—",
      spectrum: t.completion >= 0.8 ? "hot" : "mid",
      deltaPct: pctDelta(t.completion, p.completion),
      priorValue: p.apps ? `${(p.completion * 100).toFixed(0)}%` : undefined,
      empty: !t.apps,
      emptyHint: "No applications to score yet.",
    },
    {
      key: "quality",
      label: "Application Quality",
      value: t.apps ? `${t.quality.toFixed(1)}/5` : "—",
      spectrum: t.quality >= 3.5 ? "hot" : "mid",
      deltaPct: pctDelta(t.quality, p.quality),
      priorValue: p.apps ? `${p.quality.toFixed(1)}/5` : undefined,
      empty: !t.apps,
      emptyHint: "No applications to score yet.",
    },
    {
      key: "precall",
      label: "Pre-call Vids Watched",
      value: fmt(t.precallWatched),
      spectrum: "cold",
      deltaPct: pctDelta(t.precallWatched, p.precallWatched),
      priorValue: fmt(p.precallWatched),
      empty: !t.precallWatched,
      emptyHint: "No pre-call videos watched yet.",
    },
    rateItem("appbooked", "Application → Booked Call Rate", "mid"),
  ];

  const clientItems: KpiBandItem[] = [
    {
      key: "activeClients",
      label: "Active Clients",
      value: fmt(data.activeClients),
      spectrum: "mid",
    },
    {
      key: "avgHealth",
      label: "Client Health",
      value: data.avgHealth ? `${data.avgHealth.toFixed(0)}` : "—",
      spectrum: data.avgHealth > 0 && data.avgHealth < 60 ? "cold" : "mid",
      empty: !data.avgHealth,
      emptyHint: "No client health scores logged yet.",
    },
    {
      key: "wLogs",
      label: "Daily W Logs",
      value: fmt(t.wins),
      spectrum: "mid",
      deltaPct: pctDelta(t.wins, p.wins),
      priorValue: fmt(p.wins),
      empty: !t.wins,
      emptyHint: "No daily win logs in this range.",
    },
    {
      key: "finWins",
      label: "Financial Wins",
      value: fmt(t.financialWins),
      spectrum: "hot",
      deltaPct: pctDelta(t.financialWins, p.financialWins),
      priorValue: fmt(p.financialWins),
      empty: !t.financialWins,
      emptyHint: "No financial wins logged yet.",
    },
    {
      key: "studentCash",
      label: "Student Cash Logged",
      value: money(t.winCash),
      spectrum: "hot",
      featured: true,
      wide: true,
      deltaPct: pctDelta(t.winCash, p.winCash),
      priorValue: money(p.winCash),
      empty: !t.winCash,
      emptyHint: "No student cash logged in this range.",
    },
    {
      key: "avgEnergy",
      label: "Avg Energy",
      value: t.avgEnergy ? `${t.avgEnergy.toFixed(1)}/10` : "—",
      spectrum: t.avgEnergy > 0 && t.avgEnergy < 5 ? "cold" : "mid",
      deltaPct: pctDelta(t.avgEnergy, p.avgEnergy),
      priorValue: p.avgEnergy ? `${p.avgEnergy.toFixed(1)}/10` : undefined,
      empty: !t.avgEnergy,
      emptyHint: "No energy scores logged yet.",
    },
  ];

  return (
    <div className="space-y-4">
      <KpiBand title="Traffic → VSL" items={trafficItems} />
      <KpiBand title="Applications" items={appItems} />
      <div>
        <div className="mb-4 mt-8 text-sm font-bold uppercase tracking-[0.16em] text-foreground">
          Operating Rates
        </div>
        <OperatingRatesPipeline charts={rateCharts} />
      </div>
      <InboundVelocityCard totals={t} series={inboundSeries} />
      <KpiBand title="Client Momentum" items={clientItems} />
    </div>
  );
}
