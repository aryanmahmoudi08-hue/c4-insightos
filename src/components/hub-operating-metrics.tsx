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
import { RateSmallMultiples, type RateChartSpec } from "@/components/rate-small-multiples";
import {
  dailySeries,
  seriesRatePoints,
  priorPeriod,
  pctDelta,
  type SeriesPoint,
} from "@/lib/trend";

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
          }),
          vslSeries: dailySeries(vslRows, range.from, range.to, (r) => r.captured_at, {
            visits: (r) => r.page_loads ?? 0,
            plays: (r) => r.total_plays ?? 0,
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
        }),
        vslSeries: dailySeries(vslRows, range.from, range.to, (r) => r.captured_at, {
          visits: (r) => r.page_loads ?? 0,
          plays: (r) => r.total_plays ?? 0,
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

  const trafficItems: KpiBandItem[] = [
    {
      key: "visits",
      label: "VSL Page Visits",
      value: fmt(t.visits),
      spectrum: "cold",
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
      deltaPct: pctDelta(t.engagement, p.engagement),
      priorValue: p.engagement ? `${p.engagement.toFixed(1)}%` : undefined,
      empty: !t.engagement,
      emptyHint: "No VSL watch-time data yet.",
    },
  ];

  const appItems: KpiBandItem[] = [
    {
      key: "apps",
      label: "Applications Submitted",
      value: fmt(t.apps),
      spectrum: "cold",
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
  ];

  const repItems: KpiBandItem[] = [
    {
      key: "dials",
      label: "Dials",
      value: fmt(t.dials),
      spectrum: "cold",
      deltaPct: pctDelta(t.dials, p.dials),
      priorValue: fmt(p.dials),
      empty: !t.dials,
      emptyHint: "No dials logged in this range.",
    },
    {
      key: "links",
      label: "Links Sent",
      value: fmt(t.linksSent),
      spectrum: "cold",
      deltaPct: pctDelta(t.linksSent, p.linksSent),
      priorValue: fmt(p.linksSent),
      empty: !t.linksSent,
      emptyHint: "No links sent logged in this range.",
    },
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
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-2 text-3xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Operating Rates
        </div>
        <RateSmallMultiples charts={rateCharts} />
      </div>
      <KpiBand title="Rep Efficiency" items={repItems} />
      <KpiBand title="Client Momentum" items={clientItems} />
    </div>
  );
}
