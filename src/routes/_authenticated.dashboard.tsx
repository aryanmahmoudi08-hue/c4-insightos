import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useCurrentOrg } from "@/hooks/use-auth";
import { mockDashboardStats } from "@/lib/dev-mock-data";
import { PlatformIcon } from "@/components/platform-icon";
import { TopBar } from "@/components/app-sidebar";
import { useDateRange } from "@/hooks/use-date-range";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowUpRight,
  Sparkles,
  TrendingUp,
  TrendingDown,
  Minus,
  Target,
  Activity,
  Calendar,
  Inbox,
  AlertTriangle,
  Flame,
  CheckCircle2,
  Lightbulb,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { cn } from "@/lib/utils";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  ComposedChart,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { SlimHeader } from "@/components/slim-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { BentoGrid, BentoCell } from "@/components/bento-grid";
import { useCountUp } from "@/hooks/use-count-up";
import { useMoney } from "@/hooks/use-money";
import { FollowCursorTooltip } from "@/components/chart-tooltip";
import { KpiBand } from "@/components/kpi-band";
import { KpiCard } from "@/components/kpi-card";
import { InteractiveSparkline } from "@/components/interactive-sparkline";
import { HubOperatingMetrics } from "@/components/hub-operating-metrics";
import { MoneyInstrument, type MoneyPoint } from "@/components/money-instrument";
import { RepLeaderboard, type RepMetricOption } from "@/components/rep-leaderboard";
import { MetricDetailPanel, type DetailColumn } from "@/components/metric-detail-panel";
import { FunnelInstrument } from "@/components/funnel-instrument";
import {
  deriveCap,
  deriveWorking,
  type FunnelStage as DerivedFunnelStage,
  type Derivation,
} from "@/lib/funnel-derivation";
import {
  buildAttributionPathsForModel,
  aggregateCashByContent,
  aggregateCashByPlatform,
  ATTRIBUTION_MODEL_LABELS,
  ATTRIBUTION_MODELS,
} from "@/lib/content-attribution";
import type { AttributionModel, CanonicalLifecycleAttributionPath } from "@/lib/acquisition";
import {
  getWorkspaceSettingsFn,
  DEFAULT_WORKSPACE_SETTINGS,
} from "@/lib/workspace-settings.functions";
import { fetchRepKpiTargets } from "@/lib/rep-kpi-targets";
import {
  currentTargetsAsOf,
  computeTargetProgress,
  STATUS_LABELS,
  type TargetProgress,
} from "@/lib/kpi-targets";
import { pctDelta, formatRangeLabel } from "@/lib/trend";
import { SPECTRUM_VAR, type SpectrumPosition } from "@/lib/spectrum";
import type { DateRange } from "@/components/date-range-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SOCIAL_PLATFORMS,
  type SocialPlatform,
  normalizeSocialPlatform,
} from "@/lib/social-platform";
import {
  ACQUISITION_SOURCES,
  type AcquisitionSource,
  acquisitionSourceMatches,
} from "@/lib/acquisition-source";

export const Route = createFileRoute("/_authenticated/dashboard")({ component: Dashboard });

const fmt = (n: number) => new Intl.NumberFormat("en-US").format(Math.round(n));
const pct = (n: number, d: number) => (d > 0 ? `${((n / d) * 100).toFixed(1)}%` : "0.0%");

interface HubCloserPerson {
  name: string;
  calls: number;
  closes: number;
  cash: number;
  revenue: number;
}
interface HubSetterPerson {
  name: string;
  sets: number;
  closes: number;
  cash: number;
  revenue: number;
}

// Part 7 — Top Closers ranks by Closes / Cash Collected / Revenue Generated;
// Top Setters ranks by Sets / Cash Collected / Revenue Generated. Same
// RepMetricOption/RepLeaderboard pattern the rep dashboards already use, not
// a new leaderboard, scoped to just these 3 metrics per role per the brief.
// Factories (not module-scope constants) because their dollar formatting now
// comes from the display-currency-aware `money` returned by useMoney(),
// which only exists inside a component.
const buildHubCloserMetrics = (
  money: (c: number) => string,
): RepMetricOption<HubCloserPerson>[] => [
  {
    key: "closes",
    label: "Closes",
    spectrum: "hot",
    primary: (p) => `${p.closes}`,
    secondary: (p) => money(p.cash),
    rankBy: (p) => p.closes,
  },
  {
    key: "cash",
    label: "Cash Collected",
    spectrum: "hot",
    primary: (p) => money(p.cash),
    secondary: (p) => `${p.closes} closed`,
    rankBy: (p) => p.cash,
  },
  {
    key: "revenue",
    label: "Revenue Generated",
    spectrum: "hot",
    primary: (p) => money(p.revenue),
    secondary: (p) => `${p.closes} closed`,
    rankBy: (p) => p.revenue,
  },
];
const buildHubSetterMetrics = (
  money: (c: number) => string,
): RepMetricOption<HubSetterPerson>[] => [
  {
    key: "sets",
    label: "Sets",
    spectrum: "mid",
    primary: (p) => `${p.sets} sets`,
    secondary: (p) => `${p.closes} closes`,
    rankBy: (p) => p.sets,
  },
  {
    key: "cash",
    label: "Cash Collected",
    spectrum: "hot",
    primary: (p) => money(p.cash),
    secondary: (p) => `${p.sets} sets`,
    rankBy: (p) => p.cash,
  },
  {
    key: "revenue",
    label: "Revenue Generated",
    spectrum: "hot",
    primary: (p) => money(p.revenue),
    secondary: (p) => `${p.sets} sets`,
    rankBy: (p) => p.revenue,
  },
];

async function fetchPeriod(
  orgId: string,
  from: string,
  to: string,
  filters: { socialPlatform: SocialPlatform | "all"; acquisitionSource: AcquisitionSource | "all" },
) {
  const fromISO = `${from}T00:00:00`;
  const toISO = `${to}T23:59:59`;
  const [pays, leads, calls, content, setters] = await Promise.all([
    supabase
      .from("payments")
      .select("amount_cents, collected_at")
      .eq("org_id", orgId)
      .gte("collected_at", fromISO)
      .lte("collected_at", toISO),
    // full_name/email/lead_email/closer_name/scheduled_for are only read by
    // the Level 4 funnel drilldown panel (which only ever looks at the
    // current-period call's leadRows/callRows), but Supabase's typed
    // `.select()` needs a literal string — not a conditional — to infer row
    // types, so both periods fetch the same superset of columns.
    supabase
      .from("leads")
      .select("id, created_at, source_platform, source_campaign, full_name, email")
      .eq("org_id", orgId)
      .gte("created_at", fromISO)
      .lte("created_at", toISO),
    supabase
      .from("calls")
      .select(
        "showed, closed, offer_made, contract_value_cents, cash_collected_cents, created_at, source_platform, source_campaign, lead_email, closer_name, scheduled_for",
      )
      .eq("org_id", orgId)
      .gte("created_at", fromISO)
      .lte("created_at", toISO),
    supabase
      .from("content_metrics")
      .select("views, leads_generated, captured_at")
      .eq("org_id", orgId)
      .gte("captured_at", fromISO)
      .lte("captured_at", toISO),
    supabase
      .from("setter_activity")
      .select(
        "cash_collected_cents, total_revenue_cents, calls_on_calendar, live_calls, sets, closes, activity_date",
      )
      .eq("org_id", orgId)
      .gte("activity_date", from)
      .lte("activity_date", to),
  ]);
  const payList = pays.data ?? [];
  const matches = (row: {
    source_platform?: string | null;
    source_type?: string | null;
    source_campaign?: string | null;
  }) =>
    (filters.socialPlatform === "all" ||
      normalizeSocialPlatform(row.source_campaign, row.source_platform) ===
        filters.socialPlatform) &&
    acquisitionSourceMatches(row.source_type, filters.acquisitionSource, row.source_campaign);
  const leadList = (leads.data ?? []).filter(matches);
  const callList = (calls.data ?? []).filter(matches);
  const contentList =
    filters.socialPlatform === "all" && filters.acquisitionSource === "all"
      ? (content.data ?? [])
      : [];
  const setterList =
    filters.socialPlatform === "all" && filters.acquisitionSource === "all"
      ? (setters.data ?? [])
      : [];
  const paymentsCash =
    filters.socialPlatform === "all" && filters.acquisitionSource === "all"
      ? payList.reduce((s, p) => s + (p.amount_cents ?? 0), 0)
      : 0;
  const callsCash = callList.reduce((s, c) => s + (c.cash_collected_cents ?? 0), 0);
  const setterCash = setterList.reduce((s, a) => s + (a.cash_collected_cents ?? 0), 0);
  // Unified cash = max of (payments) vs (sales-team self-reported). Avoids double counting
  // when both sources record the same dollars; surfaces sales data when payments aren't wired.
  const reportedCash = callsCash + setterCash;
  // Funnel: take max of (per-call rows) vs (sales-team day logs) so the tiles populate
  // regardless of whether the data lands in calls/* or setter_activity/*.
  const callsBooked = callList.length;
  const callsShowed = callList.filter((c) => c.showed).length;
  const callsOffers = callList.filter((c) => c.offer_made).length;
  const callsClosed = callList.filter((c) => c.closed).length;
  const setterBooked = setterList.reduce((s, a) => s + (a.calls_on_calendar ?? a.sets ?? 0), 0);
  const setterShowed = setterList.reduce((s, a) => s + (a.live_calls ?? 0), 0);
  const setterClosed = setterList.reduce((s, a) => s + (a.closes ?? 0), 0);
  return {
    cash: Math.max(paymentsCash, reportedCash),
    paymentsCash,
    callsCash,
    setterCash,
    newLeads: leadList.length,
    totalCalls: Math.max(callsBooked, setterBooked),
    showed: Math.max(callsShowed, setterShowed),
    offers: callsOffers,
    closed: Math.max(callsClosed, setterClosed),
    contractValue: callList.reduce((s, c) => s + (c.contract_value_cents ?? 0), 0),
    views: contentList.reduce((s, m) => s + (m.views ?? 0), 0),
    contentLeads: contentList.reduce((s, m) => s + (m.leads_generated ?? 0), 0),
    // Row-level data for the Level 4 funnel diagnostic's record drilldowns —
    // only the current-period call renders these, but returning them from
    // both is cheap and keeps fetchPeriod's shape uniform.
    leadRows: leadList,
    callRows: callList,
  };
}

const FUNNEL_LABELS = ["Views", "Leads", "Booked", "Showed", "Offers", "Closed"] as const;
const FUNNEL_SPECTRUM: SpectrumPosition[] = ["cold", "cold", "mid", "mid", "mid", "hot"];

const NO_UPSTREAM: Derivation = {
  status: "insufficient_data",
  sentence: "No row-level records or upstream constraint to derive for this stage.",
};
const NOT_A_FUNNEL_STAGE_CAP: Derivation = {
  status: "insufficient_data",
  sentence:
    "A content attribution breakdown, not a funnel stage — no upstream constraint to derive.",
};
const NOT_A_FUNNEL_STAGE_WORKING: Derivation = {
  status: "insufficient_data",
  sentence:
    "A content attribution breakdown, not a funnel stage — no prior-period comparison to derive.",
};

// Leads and calls are different real shapes, so both funnel-drilldown
// branches map into one shared display record — keeps a single concrete T
// for MetricDetailPanel instead of a union across branches.
type FunnelRecord = {
  id: string;
  primary: string;
  detail: string;
  date: string | null;
  cashCents: number | null;
};
const buildFunnelRecordColumns = (money: (c: number) => string): DetailColumn<FunnelRecord>[] => [
  { key: "primary", label: "Record", render: (r) => r.primary },
  { key: "detail", label: "Detail", render: (r) => r.detail },
  {
    key: "date",
    label: "Date",
    render: (r) => (r.date ? new Date(r.date).toLocaleDateString() : "—"),
  },
  {
    key: "cash",
    label: "Cash",
    align: "right",
    render: (r) => (r.cashCents == null ? "—" : money(r.cashCents)),
  },
];

function Dashboard() {
  const { data: org } = useCurrentOrg();
  const orgId = org?.org_id;
  const { devBypass } = useAuth();
  const { range } = useDateRange();
  const navigate = useNavigate();
  const money = useMoney();
  const [socialPlatform, setSocialPlatform] = useState<SocialPlatform | "all">("all");
  const [acquisitionSource, setAcquisitionSource] = useState<AcquisitionSource | "all">("all");
  const HUB_CLOSER_METRICS = buildHubCloserMetrics(money);
  const HUB_SETTER_METRICS = buildHubSetterMetrics(money);
  const FUNNEL_RECORD_COLUMNS = buildFunnelRecordColumns(money);

  // Active-by-tier portfolio counts (executive KPI row below). Deliberately
  // keyed only on orgId, not the page's date range — an "Active" count is a
  // current-state snapshot, not a historical figure that should shrink just
  // because the user narrows the date filter.
  const { data: activeTierCounts } = useQuery({
    queryKey: ["hub-active-tier-counts", orgId, devBypass],
    enabled: !!orgId,
    queryFn: async () => {
      if (devBypass) return { low: 0, high: 0, unclassified: 0, total: 0 };
      const { data, error } = await supabase
        .from("clients")
        .select("id, leads(ticket_tier)")
        .eq("org_id", orgId!)
        .eq("status", "active");
      if (error) throw error;
      const rows = (data ?? []) as Array<{ leads: { ticket_tier: string | null } | null }>;
      const low = rows.filter((r) => r.leads?.ticket_tier === "low").length;
      const high = rows.filter((r) => r.leads?.ticket_tier === "high").length;
      return { low, high, unclassified: rows.length - low - high, total: rows.length };
    },
  });

  const {
    data: stats,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: [
      "exec-dash",
      orgId,
      range.from,
      range.to,
      devBypass,
      socialPlatform,
      acquisitionSource,
    ],
    enabled: !!orgId,
    queryFn: async () => {
      // Dev bypass has no real Supabase session, so every query below would come back
      // RLS-empty — skip the round trips and hand back a populated mock dashboard.
      if (devBypass) return mockDashboardStats(range.from, range.to);

      const fromISO = `${range.from}T00:00:00`;
      const toISO = `${range.to}T23:59:59`;

      // Previous period of same length for WoW deltas
      const days = Math.max(
        1,
        Math.round((new Date(range.to).getTime() - new Date(range.from).getTime()) / 86400e3) + 1,
      );
      const prevTo = new Date(new Date(range.from).getTime() - 86400e3).toISOString().slice(0, 10);
      const prevFrom = new Date(new Date(range.from).getTime() - days * 86400e3)
        .toISOString()
        .slice(0, 10);

      // Current month pace data
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const daysInMonth = monthEnd.getDate();
      const dayOfMonth = now.getDate();

      const [curr, prev, monthPays, monthCalls, monthSetters, setterAct, alerts, insights] =
        await Promise.all([
          fetchPeriod(orgId!, range.from, range.to, { socialPlatform, acquisitionSource }),
          fetchPeriod(orgId!, prevFrom, prevTo, { socialPlatform, acquisitionSource }),
          supabase
            .from("payments")
            .select("amount_cents")
            .eq("org_id", orgId!)
            .gte("collected_at", `${monthStart}T00:00:00`),
          supabase
            .from("calls")
            .select("cash_collected_cents")
            .eq("org_id", orgId!)
            .gte("created_at", `${monthStart}T00:00:00`),
          supabase
            .from("setter_activity")
            .select("cash_collected_cents")
            .eq("org_id", orgId!)
            .gte("activity_date", monthStart),
          supabase
            .from("setter_activity")
            .select(
              "team_member_name, role, sets, closes, cash_collected_cents, total_revenue_cents",
            )
            .eq("org_id", orgId!)
            .gte("activity_date", range.from)
            .lte("activity_date", range.to),
          supabase
            .from("alerts")
            .select("id, severity, title, created_at")
            .eq("org_id", orgId!)
            .eq("acknowledged", false)
            .order("created_at", { ascending: false })
            .limit(6),
          supabase
            .from("ai_insights")
            .select("id, title, body, module, created_at")
            .eq("org_id", orgId!)
            .eq("dismissed", false)
            .order("created_at", { ascending: false })
            .limit(4),
        ]);

      // Closer leaderboard from calls
      const callsForLeaders = await supabase
        .from("calls")
        .select("closer_name, closed, cash_collected_cents, contract_value_cents")
        .eq("org_id", orgId!)
        .gte("created_at", fromISO)
        .lte("created_at", toISO);
      const callList = callsForLeaders.data ?? [];
      const closerMap = new Map<
        string,
        { name: string; calls: number; closes: number; cash: number; revenue: number }
      >();
      for (const c of callList) {
        const name = c.closer_name ?? "Unassigned";
        const r = closerMap.get(name) ?? { name, calls: 0, closes: 0, cash: 0, revenue: 0 };
        r.calls += 1;
        if (c.closed) r.closes += 1;
        r.cash += c.cash_collected_cents ?? 0;
        r.revenue += c.contract_value_cents ?? 0;
        closerMap.set(name, r);
      }
      const closers = Array.from(closerMap.values())
        .sort((a, b) => b.cash - a.cash)
        .slice(0, 5);

      const setterMap = new Map<
        string,
        { name: string; sets: number; closes: number; cash: number; revenue: number }
      >();
      for (const a of setterAct.data ?? []) {
        const r = setterMap.get(a.team_member_name) ?? {
          name: a.team_member_name,
          sets: 0,
          closes: 0,
          cash: 0,
          revenue: 0,
        };
        r.sets += a.sets ?? 0;
        r.closes += a.closes ?? 0;
        r.cash += a.cash_collected_cents ?? 0;
        r.revenue += a.total_revenue_cents ?? 0;
        setterMap.set(a.team_member_name, r);
      }
      const setters = Array.from(setterMap.values())
        .sort((a, b) => b.sets - a.sets)
        .slice(0, 5);

      // Daily series
      const seriesDays = Math.min(60, days);
      type SeriesPoint = {
        d: string;
        cash: number;
        leads: number;
        views: number;
        calls: number;
        showed: number;
        offers: number;
        closed: number;
        contractValue: number;
      };
      const series: SeriesPoint[] = [];
      const fromTime = new Date(range.from).getTime();
      for (let i = 0; i < seriesDays; i++) {
        const dt = new Date(fromTime + i * 86400e3);
        series.push({
          d: dt.toISOString().slice(5, 10),
          cash: 0,
          leads: 0,
          views: 0,
          calls: 0,
          showed: 0,
          offers: 0,
          closed: 0,
          contractValue: 0,
        });
      }
      const [seriesPays, seriesLeads, seriesCalls, seriesSetters, seriesContent] =
        await Promise.all([
          supabase
            .from("payments")
            .select("amount_cents, collected_at")
            .eq("org_id", orgId!)
            .gte("collected_at", fromISO)
            .lte("collected_at", toISO),
          supabase
            .from("leads")
            .select("created_at")
            .eq("org_id", orgId!)
            .gte("created_at", fromISO)
            .lte("created_at", toISO),
          supabase
            .from("calls")
            .select(
              "showed, closed, offer_made, contract_value_cents, cash_collected_cents, created_at",
            )
            .eq("org_id", orgId!)
            .gte("created_at", fromISO)
            .lte("created_at", toISO),
          supabase
            .from("setter_activity")
            .select(
              "cash_collected_cents, calls_on_calendar, sets, live_calls, closes, activity_date",
            )
            .eq("org_id", orgId!)
            .gte("activity_date", range.from)
            .lte("activity_date", range.to),
          supabase
            .from("content_metrics")
            .select("views, captured_at")
            .eq("org_id", orgId!)
            .gte("captured_at", fromISO)
            .lte("captured_at", toISO),
        ]);
      const idx = (iso?: string | null) => {
        if (!iso) return -1;
        const k = iso.slice(5, 10);
        return series.findIndex((s) => s.d === k);
      };
      const payByDay = new Map<number, number>();
      const reportedByDay = new Map<number, number>();
      for (const p of seriesPays.data ?? []) {
        const i = idx(p.collected_at);
        if (i >= 0) payByDay.set(i, (payByDay.get(i) ?? 0) + (p.amount_cents ?? 0));
      }
      for (const cc of seriesCalls.data ?? []) {
        const i = idx(cc.created_at);
        if (i < 0) continue;
        reportedByDay.set(i, (reportedByDay.get(i) ?? 0) + (cc.cash_collected_cents ?? 0));
        series[i].calls += 1;
        if (cc.showed) series[i].showed += 1;
        if (cc.offer_made || cc.closed) series[i].offers += 1;
        if (cc.closed) series[i].closed += 1;
        series[i].contractValue += cc.contract_value_cents ?? 0;
      }
      for (const a of seriesSetters.data ?? []) {
        const i = idx(a.activity_date);
        if (i < 0) continue;
        reportedByDay.set(i, (reportedByDay.get(i) ?? 0) + (a.cash_collected_cents ?? 0));
        series[i].calls = Math.max(series[i].calls, a.calls_on_calendar ?? a.sets ?? 0);
        series[i].showed = Math.max(series[i].showed, a.live_calls ?? 0);
        series[i].closed = Math.max(series[i].closed, a.closes ?? 0);
      }
      for (let i = 0; i < series.length; i++)
        series[i].cash = Math.max(payByDay.get(i) ?? 0, reportedByDay.get(i) ?? 0);
      for (const l of seriesLeads.data ?? []) {
        const i = idx(l.created_at);
        if (i >= 0) series[i].leads += 1;
      }
      for (const m of seriesContent.data ?? []) {
        const i = idx(m.captured_at);
        if (i >= 0) series[i].views += m.views ?? 0;
      }

      // Funnel with conversion percentages
      const funnel = [
        { stage: "Views", value: curr.views, conv: null as string | null },
        {
          stage: "Leads",
          value: curr.newLeads,
          conv: curr.views ? pct(curr.newLeads, curr.views) : null,
        },
        {
          stage: "Booked",
          value: curr.totalCalls,
          conv: curr.newLeads ? pct(curr.totalCalls, curr.newLeads) : null,
        },
        {
          stage: "Showed",
          value: curr.showed,
          conv: curr.totalCalls ? pct(curr.showed, curr.totalCalls) : null,
        },
        {
          stage: "Offers",
          value: curr.offers,
          conv: curr.showed ? pct(curr.offers, curr.showed) : null,
        },
        {
          stage: "Closed",
          value: curr.closed,
          conv: curr.offers ? pct(curr.closed, curr.offers) : null,
        },
      ];

      // Pace predictor
      const monthPaymentsCash = (monthPays.data ?? []).reduce(
        (s, p) => s + (p.amount_cents ?? 0),
        0,
      );
      const monthReportedCash =
        (monthCalls.data ?? []).reduce((s, c) => s + (c.cash_collected_cents ?? 0), 0) +
        (monthSetters.data ?? []).reduce((s, a) => s + (a.cash_collected_cents ?? 0), 0);
      const monthCash = Math.max(monthPaymentsCash, monthReportedCash);
      const dailyPace = dayOfMonth > 0 ? monthCash / dayOfMonth : 0;
      const projection = dailyPace * daysInMonth;

      return {
        curr,
        prev,
        series,
        closers,
        setters,
        funnel,
        alerts: alerts.data ?? [],
        insights: insights.data ?? [],
        pace: { monthCash, projection, dayOfMonth, daysInMonth, dailyPace },
      };
    },
  });

  type DashboardPeriod = Awaited<ReturnType<typeof fetchPeriod>>;
  const c = stats?.curr as DashboardPeriod | undefined;
  const p = stats?.prev as DashboardPeriod | undefined;

  // Leaderboards get their own independently-overridable date range, same C3
  // pattern the rep dashboards already established — defaults to the page
  // range until explicitly overridden.
  const [closerMetric, setCloserMetric] = useState("cash");
  const [setterMetric, setSetterMetric] = useState("cash");
  const [lbOverride, setLbOverride] = useState<DateRange | null>(null);
  const lbRange = lbOverride ?? range;

  // Independent from the main dashboard query above (same C3 convention rep
  // dashboards use) so overriding the leaderboard's own date range actually
  // refetches scoped data instead of just relabeling the main-range numbers.
  const { data: lbData } = useQuery({
    queryKey: ["hub-leaderboard", orgId, lbRange.from, lbRange.to, devBypass],
    enabled: !!orgId,
    queryFn: async (): Promise<{ closers: HubCloserPerson[]; setters: HubSetterPerson[] }> => {
      if (devBypass) {
        const m = mockDashboardStats(lbRange.from, lbRange.to);
        return { closers: m.closers, setters: m.setters };
      }
      const fromISO = `${lbRange.from}T00:00:00`;
      const toISO = `${lbRange.to}T23:59:59`;
      const [callsRes, settersRes] = await Promise.all([
        supabase
          .from("calls")
          .select("closer_name, closed, cash_collected_cents, contract_value_cents")
          .eq("org_id", orgId!)
          .gte("created_at", fromISO)
          .lte("created_at", toISO),
        supabase
          .from("setter_activity")
          .select("team_member_name, sets, closes, cash_collected_cents, total_revenue_cents")
          .eq("org_id", orgId!)
          .gte("activity_date", lbRange.from)
          .lte("activity_date", lbRange.to),
      ]);
      const closerMap = new Map<string, HubCloserPerson>();
      for (const c of callsRes.data ?? []) {
        const name = c.closer_name ?? "Unassigned";
        const r = closerMap.get(name) ?? { name, calls: 0, closes: 0, cash: 0, revenue: 0 };
        r.calls += 1;
        if (c.closed) r.closes += 1;
        r.cash += c.cash_collected_cents ?? 0;
        r.revenue += c.contract_value_cents ?? 0;
        closerMap.set(name, r);
      }
      const setterMap = new Map<string, HubSetterPerson>();
      for (const a of settersRes.data ?? []) {
        const r = setterMap.get(a.team_member_name) ?? {
          name: a.team_member_name,
          sets: 0,
          closes: 0,
          cash: 0,
          revenue: 0,
        };
        r.sets += a.sets ?? 0;
        r.closes += a.closes ?? 0;
        r.cash += a.cash_collected_cents ?? 0;
        r.revenue += a.total_revenue_cents ?? 0;
        setterMap.set(a.team_member_name, r);
      }
      return { closers: Array.from(closerMap.values()), setters: Array.from(setterMap.values()) };
    },
  });

  const hubSeries = stats?.series ?? [];
  const hubLabels = hubSeries.map((point) => point.d);
  const reachConversionSeries = hubSeries.map((point) =>
    Number(point.views ?? 0) > 0 ? (Number(point.leads ?? 0) / Number(point.views ?? 0)) * 100 : 0,
  );
  const moneySeries: MoneyPoint[] = useMemo(
    () => (stats?.series ?? []).map((s) => ({ d: s.d, cash: s.cash, revenue: s.contractValue })),
    [stats?.series],
  );
  const cashRatePct = c?.contractValue ? (c.cash / c.contractValue) * 100 : undefined;
  const prevCashRatePct = p?.contractValue ? (p.cash / p.contractValue) * 100 : undefined;

  // Level 3 · Content attribution — reuses the same canonical multi-touch
  // engine (buildAttributionPathsForModel) the Content Command Center runs,
  // scoped to the Main Hub's own date range (same independent-query
  // convention as the leaderboards above). Never a second attribution engine
  // — just a lighter query against the shared model logic.
  const [attributionModel, setAttributionModel] = useState<AttributionModel>("first_touch");
  const { data: attribution } = useQuery({
    queryKey: ["hub-attribution", orgId, range.from, range.to, devBypass],
    enabled: !!orgId,
    queryFn: async () => {
      if (devBypass) {
        return {
          pathsByModel: {} as Record<AttributionModel, CanonicalLifecycleAttributionPath[]>,
          contentMeta: new Map<string, { title: string; platform: string; views: number }>(),
          bookedByContent: new Map<string, number>(),
          showedByContent: new Map<string, number>(),
          closedCalls: [] as {
            id: string;
            created_at: string | null;
            contract_value_cents: number | null;
            cash_collected_cents: number | null;
            lead_id: string | null;
            source_content_id: string | null;
          }[],
        };
      }
      const fromISO = `${range.from}T00:00:00`;
      const toISO = `${range.to}T23:59:59`;
      const [leadsRes, callsRes, touchesRes, closedRes, metricsRes] = await Promise.all([
        supabase
          .from("leads")
          .select("id, created_at, source_content_id")
          .eq("org_id", orgId!)
          .gte("created_at", fromISO)
          .lte("created_at", toISO),
        // ALL calls (not just closed) — needed for real Booked/Showed counts
        // per content via the call's own direct source_content_id field.
        // This is a call-level fact independent of which touch-attribution
        // model is selected above, so it's computed once, not per model.
        supabase
          .from("calls")
          .select(
            "id, lead_id, created_at, closed, showed, source_content_id, cash_collected_cents",
          )
          .eq("org_id", orgId!)
          .gte("created_at", fromISO)
          .lte("created_at", toISO),
        supabase
          .from("lead_content_touches")
          .select("id, lead_id, content_id, touched_at")
          .eq("org_id", orgId!)
          .gte("touched_at", fromISO)
          .lte("touched_at", toISO),
        supabase
          .from("calls")
          .select(
            "id, created_at, contract_value_cents, cash_collected_cents, lead_id, source_content_id",
          )
          .eq("org_id", orgId!)
          .eq("closed", true)
          .gte("created_at", fromISO)
          .lte("created_at", toISO),
        supabase
          .from("content_metrics")
          .select("content_id, views, content_pieces!inner(title, platform)")
          .eq("org_id", orgId!)
          .gte("captured_at", fromISO)
          .lte("captured_at", toISO),
      ]);
      const modelInput = {
        leads: (leadsRes.data ?? []).map((l) => ({
          id: l.id,
          created_at: l.created_at,
          source_content_id: l.source_content_id,
        })),
        calls: (closedRes.data ?? []).map((c2) => ({
          id: c2.id,
          lead_id: c2.lead_id,
          created_at: c2.created_at,
          closed: true,
          source_content_id: c2.source_content_id,
        })),
        touches: touchesRes.data ?? [],
        sampleSize: closedRes.data?.length ?? 0,
      };
      const pathsByModel = Object.fromEntries(
        ATTRIBUTION_MODELS.map((model) => [
          model,
          buildAttributionPathsForModel(model, modelInput),
        ]),
      ) as Record<AttributionModel, CanonicalLifecycleAttributionPath[]>;
      const contentMeta = new Map<string, { title: string; platform: string; views: number }>();
      for (const m of metricsRes.data ?? []) {
        const cp = Array.isArray(m.content_pieces) ? m.content_pieces[0] : m.content_pieces;
        if (!m.content_id) continue;
        const existing = contentMeta.get(m.content_id);
        contentMeta.set(m.content_id, {
          title: cp?.title ?? "(untitled)",
          platform: cp?.platform ?? "Unknown",
          views: (existing?.views ?? 0) + (m.views ?? 0),
        });
      }
      const bookedByContent = new Map<string, number>();
      const showedByContent = new Map<string, number>();
      for (const call of callsRes.data ?? []) {
        if (!call.source_content_id) continue;
        bookedByContent.set(
          call.source_content_id,
          (bookedByContent.get(call.source_content_id) ?? 0) + 1,
        );
        if (call.showed) {
          showedByContent.set(
            call.source_content_id,
            (showedByContent.get(call.source_content_id) ?? 0) + 1,
          );
        }
      }
      return {
        pathsByModel,
        contentMeta,
        bookedByContent,
        showedByContent,
        closedCalls: closedRes.data ?? [],
      };
    },
  });

  // Level 1 pacing target — rolls up the real, individually-configured closer
  // "Cash Collected" monthly targets from the Rep KPI Target Engine (never an
  // invented company-wide number). Anchored to the calendar month containing
  // today, matching periodWindow's own calendar-month semantics — deliberately
  // independent of the page's own (possibly partial/custom) date range.
  const settingsFn = useServerFn(getWorkspaceSettingsFn);
  const { data: workspaceSettings } = useQuery({
    queryKey: ["workspace-settings", orgId, devBypass],
    enabled: devBypass || !!orgId,
    queryFn: () =>
      devBypass
        ? Promise.resolve(DEFAULT_WORKSPACE_SETTINGS)
        : settingsFn({ data: { orgId: orgId! } }),
  });
  const minCapSample =
    workspaceSettings?.funnel_instrument.minCapSample ??
    DEFAULT_WORKSPACE_SETTINGS.funnel_instrument.minCapSample;

  const todayISO = new Date().toISOString().slice(0, 10);
  const { data: closerCashTargetCents } = useQuery({
    queryKey: ["hub-cash-target", orgId, devBypass],
    enabled: !!orgId && !devBypass,
    queryFn: async () => {
      const records = await fetchRepKpiTargets(orgId!, "closer");
      const active = currentTargetsAsOf(records, todayISO).filter(
        (r) => r.metricKey === "cash_collected_cents" && r.period === "monthly",
      );
      return active.reduce((sum, r) => sum + r.targetValue, 0);
    },
  });
  const targetProgress = stats?.pace
    ? computeTargetProgress({
        format: "money_cents",
        period: "monthly",
        anchorISODate: todayISO,
        targetValue:
          closerCashTargetCents && closerCashTargetCents > 0 ? closerCashTargetCents : null,
        actualValue: stats.pace.monthCash,
      })
    : null;

  // Level 3/4 detail-panel state — same click-any-metric pattern the rep
  // dashboards use (MetricDetailPanel + Derivation), scoped to whichever
  // funnel stage or attribution content row was clicked.
  type HubDetailSelection =
    | { kind: "funnel"; index: number }
    | { kind: "attribution"; contentId: string; label: string };
  const [hubSelected, setHubSelected] = useState<HubDetailSelection | null>(null);

  // Level 4 · Funnel diagnostic — reshapes the already-computed funnel counts
  // (both periods) into FunnelStage[] for FunnelInstrument + the shared
  // deriveCap/deriveWorking engine. No new numbers, just the existing
  // curr/prev totals in the shape that engine expects.
  const funnelStages: DerivedFunnelStage[] = useMemo(
    () =>
      (stats?.funnel ?? []).map((f, i) => ({
        key: FUNNEL_LABELS[i]?.toLowerCase() ?? f.stage.toLowerCase(),
        label: f.stage,
        value: f.value,
        spectrum: FUNNEL_SPECTRUM[i] ?? "mid",
      })),
    [stats?.funnel],
  );
  const prevFunnelStages: DerivedFunnelStage[] = useMemo(
    () =>
      p
        ? [
            { key: "views", label: "Views", value: p.views, spectrum: "cold" as SpectrumPosition },
            {
              key: "leads",
              label: "Leads",
              value: p.newLeads,
              spectrum: "cold" as SpectrumPosition,
            },
            {
              key: "booked",
              label: "Booked",
              value: p.totalCalls,
              spectrum: "mid" as SpectrumPosition,
            },
            {
              key: "showed",
              label: "Showed",
              value: p.showed,
              spectrum: "mid" as SpectrumPosition,
            },
            {
              key: "offers",
              label: "Offers",
              value: p.offers,
              spectrum: "mid" as SpectrumPosition,
            },
            {
              key: "closed",
              label: "Closed",
              value: p.closed,
              spectrum: "hot" as SpectrumPosition,
            },
          ]
        : [],
    [p],
  );
  // deriveCap/deriveWorking always exclude Views: it's impressions, a
  // different unit/scale than every downstream stage's head-count, so any
  // rate comparison that included it (leak-finding, "what's working",
  // capped-upside math) would either spuriously win/lose or produce a wildly
  // inflated estimate purely from the unit mismatch, not real funnel health.
  // capStages therefore starts at Leads — deriveCap's own "needs 2 upstream
  // stages" rule then correctly leaves Booked (only Leads behind it) as
  // insufficient too, same as it already does for Leads itself.
  const capStages = useMemo(() => funnelStages.slice(1), [funnelStages]);
  const prevCapStages = useMemo(() => prevFunnelStages.slice(1), [prevFunnelStages]);
  const funnelWorking = useMemo(
    () => deriveWorking(capStages, prevCapStages, minCapSample),
    [capStages, prevCapStages, minCapSample],
  );
  // Largest leak = the adjacent stage pair (within capStages) with the
  // lowest conversion rate, gated by the same sample-size floor deriveCap
  // itself requires — picking "worst rate" rather than "biggest raw drop"
  // surfaces a real bottleneck instead of just whichever stage has the most
  // volume. leakIndex is expressed in the FULL funnelStages index space
  // (capIndex + 1) so callers can look up labels directly.
  const leakIndex = useMemo(() => {
    let worst: { index: number; rate: number } | null = null;
    for (let i = 2; i < capStages.length; i++) {
      const prevStage = capStages[i - 1];
      if (prevStage.value < minCapSample) continue;
      const rate = prevStage.value > 0 ? capStages[i].value / prevStage.value : 0;
      if (!worst || rate < worst.rate) worst = { index: i, rate };
    }
    return worst ? worst.index + 1 : null;
  }, [capStages, minCapSample]);
  const leakCap = useMemo(
    () => (leakIndex != null ? deriveCap(capStages, leakIndex - 1, minCapSample) : null),
    [capStages, leakIndex, minCapSample],
  );
  // Only Showed/Offers/Closed are ever selected as leakIndex (see above), so
  // only those three need an action.
  const LEAK_ACTIONS: Record<string, string> = {
    showed: "Prioritize a confirmation/reminder sequence for booked calls.",
    offers: "Review call-to-offer script consistency — offers aren't reaching enough shows.",
    closed: "Audit objection handling and post-call follow-up cadence on unclosed offers.",
  };
  const leakAction = leakIndex != null ? LEAK_ACTIONS[funnelStages[leakIndex]?.key] : undefined;

  // Level 3 · Content attribution — per-content rows for the selected model.
  // Leads/Closes/Cash/Revenue come from the canonical paths (buildAttributionPathsForModel,
  // the same engine Content Command Center uses); Booked/Showed come from the
  // direct call-level source_content_id field, which is model-independent.
  const attributionRows = useMemo(() => {
    const paths = attribution?.pathsByModel?.[attributionModel] ?? [];
    const cashById: Record<string, number | null | undefined> = {};
    const revenueById: Record<string, number | null | undefined> = {};
    for (const c2 of attribution?.closedCalls ?? []) {
      if (c2.id) {
        cashById[c2.id] = c2.cash_collected_cents;
        revenueById[c2.id] = c2.contract_value_cents;
      }
    }
    const cashAgg = aggregateCashByContent(paths, cashById);
    const revenueAgg = aggregateCashByContent(paths, revenueById);
    const cashByContent = new Map(cashAgg.map((a) => [a.contentId, a.cashCents]));
    const revenueByContent = new Map(revenueAgg.map((a) => [a.contentId, a.cashCents]));
    const leadsByContent = new Map<string, Set<string>>();
    const closesByContent = new Map<string, Set<string>>();
    for (const path of paths) {
      if (!path.contentId) continue;
      if (!leadsByContent.has(path.contentId)) leadsByContent.set(path.contentId, new Set());
      leadsByContent.get(path.contentId)!.add(path.personKey);
      if (path.callId) {
        if (!closesByContent.has(path.contentId)) closesByContent.set(path.contentId, new Set());
        closesByContent.get(path.contentId)!.add(path.callId);
      }
    }
    const contentIds = new Set<string>([
      ...leadsByContent.keys(),
      ...(attribution?.bookedByContent.keys() ?? []),
    ]);
    return Array.from(contentIds)
      .map((contentId) => {
        const meta = attribution?.contentMeta.get(contentId);
        return {
          contentId,
          title: meta?.title ?? "(untitled)",
          platform: meta?.platform ?? "Unknown",
          views: meta?.views ?? 0,
          leads: leadsByContent.get(contentId)?.size ?? 0,
          booked: attribution?.bookedByContent.get(contentId) ?? 0,
          showed: attribution?.showedByContent.get(contentId) ?? 0,
          closes: closesByContent.get(contentId)?.size ?? 0,
          cashCents: cashByContent.get(contentId) ?? 0,
          revenueCents: revenueByContent.get(contentId) ?? 0,
        };
      })
      .filter((r) => r.leads > 0 || r.booked > 0 || r.cashCents > 0)
      .sort((a, b) => b.cashCents - a.cashCents)
      .slice(0, 8);
  }, [attribution, attributionModel]);

  // Revenue by Source — top channels (grouped by platform) for the selected
  // attribution model, replacing the old "Money-origin flow" path panel with
  // a compact executive summary. Uses the same canonical paths + cash/revenue
  // maps as attributionRows above (never a second attribution engine) via the
  // shared aggregateCashByPlatform helper. Platform is resolved off the same
  // contentMeta lookup the per-content table already builds (content_pieces
  // join via content_metrics) — no new query. Attribution strength per
  // channel is the modal (most common) evidence.strength across that
  // channel's own paths — read off each path, never recomputed.
  type SourceStrength = "high" | "medium" | "low" | "unknown";
  const revenueBySourceRows = useMemo(() => {
    const paths = attribution?.pathsByModel?.[attributionModel] ?? [];
    const cashById: Record<string, number | null | undefined> = {};
    const revenueById: Record<string, number | null | undefined> = {};
    for (const c2 of attribution?.closedCalls ?? []) {
      if (c2.id) {
        cashById[c2.id] = c2.cash_collected_cents;
        revenueById[c2.id] = c2.contract_value_cents;
      }
    }
    const platformByContentId: Record<string, string | null | undefined> = {};
    attribution?.contentMeta.forEach((meta, contentId) => {
      platformByContentId[contentId] = meta.platform;
    });
    const cashByPlatform = aggregateCashByPlatform(paths, cashById, platformByContentId);
    const revenueByPlatform = aggregateCashByPlatform(paths, revenueById, platformByContentId);
    const revenueByPlatformMap = new Map(revenueByPlatform.map((r) => [r.platform, r.cashCents]));
    const strengthCountsByPlatform = new Map<string, Record<SourceStrength, number>>();
    for (const path of paths) {
      const platform =
        path.platform ?? (path.contentId ? platformByContentId[path.contentId] : null);
      if (!platform) continue;
      const bucket =
        strengthCountsByPlatform.get(platform) ??
        ({ high: 0, medium: 0, low: 0, unknown: 0 } as Record<SourceStrength, number>);
      bucket[path.evidence.strength] += 1;
      strengthCountsByPlatform.set(platform, bucket);
    }
    const modalStrength = (platform: string): SourceStrength => {
      const bucket = strengthCountsByPlatform.get(platform);
      if (!bucket) return "unknown";
      return (Object.entries(bucket) as [SourceStrength, number][]).sort(
        (a, b) => b[1] - a[1],
      )[0][0];
    };
    return cashByPlatform
      .map((row) => ({
        platform: row.platform,
        cashCents: row.cashCents,
        revenueCents: revenueByPlatformMap.get(row.platform) ?? 0,
        closes: row.callCount,
        strength: modalStrength(row.platform),
      }))
      .sort((a, b) => b.cashCents - a.cashCents)
      .slice(0, 5);
  }, [attribution, attributionModel]);

  // Two independently-typed panels (rather than one union-typed panel) so
  // each MetricDetailPanel<T> instantiation below infers its own concrete T
  // instead of TypeScript trying to unify a funnel-row shape with a
  // closed-call shape across one shared generic.
  const funnelSelectedIndex = hubSelected?.kind === "funnel" ? hubSelected.index : null;
  const funnelPanel = useMemo(() => {
    if (funnelSelectedIndex == null) return null;
    const stage = funnelStages[funnelSelectedIndex];
    if (!stage) return null;
    const leadRows = c?.leadRows ?? [];
    const callRows = c?.callRows ?? [];
    let rows: FunnelRecord[] = [];
    let emptyRowsLabel = "No records in range.";
    if (funnelSelectedIndex === 1) {
      rows = leadRows.map((r) => ({
        id: r.id,
        primary: r.full_name || r.email || "—",
        detail: r.source_platform ?? r.source_campaign ?? "—",
        date: r.created_at,
        cashCents: null,
      }));
    } else if (funnelSelectedIndex >= 2) {
      const filterFn =
        funnelSelectedIndex === 3
          ? (r: (typeof callRows)[number]) => !!r.showed
          : funnelSelectedIndex === 4
            ? (r: (typeof callRows)[number]) => !!r.offer_made || !!r.closed
            : funnelSelectedIndex === 5
              ? (r: (typeof callRows)[number]) => !!r.closed
              : () => true;
      rows = callRows.filter(filterFn).map((r, i) => ({
        id: `${r.created_at}-${r.lead_email ?? i}`,
        primary: r.lead_email ?? "—",
        detail: r.closer_name ?? "—",
        date: r.scheduled_for ?? r.created_at,
        cashCents: r.cash_collected_cents ?? 0,
      }));
    } else {
      // Views (index 0): aggregates from content performance, not individual
      // leads — no row-level records or upstream constraint to derive.
      emptyRowsLabel = "Views aggregate from content performance — no individual records here.";
    }
    return {
      title: stage.label,
      subtitle: formatRangeLabel(range),
      columns: FUNNEL_RECORD_COLUMNS,
      rows,
      rowKey: (r: FunnelRecord) => r.id,
      // capStages excludes Views, so a full-array index maps to capIndex - 1.
      // Views itself (index 0) has no representation in capStages at all —
      // deriveCap already correctly rejects Leads/Booked (capIndex 0/1, below
      // its own "needs 2 upstream stages" floor) with a specific message,
      // rather than (for Booked) wrongly using Views as its "lost
      // population" and producing a nonsensically inflated estimate.
      cap:
        funnelSelectedIndex === 0
          ? NO_UPSTREAM
          : deriveCap(capStages, funnelSelectedIndex - 1, minCapSample),
      working: funnelSelectedIndex === 0 ? NO_UPSTREAM : funnelWorking,
      emptyRowsLabel,
    };
  }, [
    funnelSelectedIndex,
    funnelStages,
    capStages,
    funnelWorking,
    minCapSample,
    c,
    range,
    FUNNEL_RECORD_COLUMNS,
  ]);

  const attribSelected = hubSelected?.kind === "attribution" ? hubSelected : null;
  const attributionPanel = useMemo(() => {
    if (!attribSelected) return null;
    const paths = attribution?.pathsByModel?.[attributionModel] ?? [];
    const callIds = new Set(
      paths.filter((p2) => p2.contentId === attribSelected.contentId).map((p2) => p2.callId),
    );
    const rows = (attribution?.closedCalls ?? []).filter((c2) => c2.id && callIds.has(c2.id));
    type ClosedCall = (typeof rows)[number];
    const columns: DetailColumn<ClosedCall>[] = [
      {
        key: "date",
        label: "Closed",
        render: (r) => (r.created_at ? new Date(r.created_at).toLocaleDateString() : "—"),
      },
      {
        key: "cash",
        label: "Cash",
        align: "right",
        render: (r) => money(r.cash_collected_cents ?? 0),
      },
      {
        key: "revenue",
        label: "Revenue",
        align: "right",
        render: (r) => money(r.contract_value_cents ?? 0),
      },
    ];
    return {
      title: attribSelected.label,
      subtitle: `${ATTRIBUTION_MODEL_LABELS[attributionModel]} attribution · ${formatRangeLabel(range)}`,
      columns,
      rows,
      rowKey: (r: ClosedCall) => r.id ?? "",
      cap: NOT_A_FUNNEL_STAGE_CAP,
      working: NOT_A_FUNNEL_STAGE_WORKING,
      emptyRowsLabel: "No closed calls resolved to this content for this model.",
    };
  }, [attribSelected, attribution, attributionModel, range, money]);

  return (
    <>
      <TopBar
        title="Executive Command Center"
        subtitle="Real-time KPIs across content, attribution, and sales"
        showDateRange
      />
      <div className="space-y-6 p-4 md:p-6">
        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card/60 p-3">
          <div className="mr-auto min-w-[12rem]">
            <div className="text-2xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Executive filters
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Filters recalculate only metrics with explicit attribution.
            </div>
          </div>
          <label className="grid gap-1 text-2xs font-medium uppercase tracking-wider text-muted-foreground">
            Social Platform
            <Select
              value={socialPlatform}
              onValueChange={(value) => setSocialPlatform(value as SocialPlatform | "all")}
            >
              <SelectTrigger className="h-8 w-44 text-xs normal-case tracking-normal text-foreground">
                <SelectValue placeholder="All Platforms" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Platforms</SelectItem>
                {SOCIAL_PLATFORMS.map((platform) => (
                  <SelectItem key={platform} value={platform}>
                    <span className="flex items-center gap-1.5">
                      <PlatformIcon platform={platform} /> {platform}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="grid gap-1 text-2xs font-medium uppercase tracking-wider text-muted-foreground">
            Acquisition Source
            <Select
              value={acquisitionSource}
              onValueChange={(value) => setAcquisitionSource(value as AcquisitionSource | "all")}
            >
              <SelectTrigger className="h-8 w-44 text-xs normal-case tracking-normal text-foreground">
                <SelectValue placeholder="All Sources" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sources</SelectItem>
                {ACQUISITION_SOURCES.map((source) => (
                  <SelectItem key={source} value={source}>
                    {source}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        </div>
        {isError && (
          <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 animate-in fade-in-0 slide-in-from-top-1 duration-200">
            <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-destructive">
                Couldn't load dashboard data
              </div>
              <div className="text-xs text-muted-foreground truncate">
                {error instanceof Error ? error.message : "Unknown error"}
              </div>
            </div>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        )}

        {/* Executive portfolio row — money + portfolio state, above everything
            else on the page. One home for each of these 5 figures: Cash
            Collected/Revenue Generated aren't repeated as plain KpiCards
            anywhere else on Main Hub (the CashHero below is a distinct hero
            visualization, not a duplicate KPI card), and the old "Contract
            Value / Cash" Company KPIs entry was removed in favor of this row. */}
        {!!stats && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <KpiCard
              label="Total Cash Collected"
              value={money(c?.cash ?? 0)}
              spectrum="hot"
              supporting={formatRangeLabel(range)}
            />
            <KpiCard
              label="Total Revenue Generated"
              value={money(c?.contractValue ?? 0)}
              spectrum="hot"
              supporting={formatRangeLabel(range)}
            />
            <KpiCard
              label="MRR — Low Ticket"
              value="Not tracked"
              supporting="Requires a client-level recurring-revenue field this schema doesn't have yet."
              className="opacity-70"
            />
            <KpiCard
              label="Low Ticket Active"
              value={fmt(activeTierCounts?.low ?? 0)}
              supporting={
                activeTierCounts ? `of ${fmt(activeTierCounts.total)} active clients` : undefined
              }
              spectrum="cold"
              onClick={() => navigate({ to: "/clients" } as never)}
            />
            <KpiCard
              label="High Ticket Active"
              value={fmt(activeTierCounts?.high ?? 0)}
              supporting={
                activeTierCounts ? `of ${fmt(activeTierCounts.total)} active clients` : undefined
              }
              spectrum="mid"
              onClick={() => navigate({ to: "/clients" } as never)}
            />
          </div>
        )}

        {/* Cash Collected mega-hero (Phase 4) — the page's one hero moment (B1): mega
            number + count-up, daily-cash area chart as an ambient background, delta vs
            prior period, and month-end pace folded in. Replaces the standalone PaceCard
            (relocated here, not removed — same monthCash/projection/dailyPace/progress
            values, now paired with the number they're pacing against). */}
        {/* cols=3: hero (col-span-2) + tall (col-span-1) sum to exactly 3 —
            the default cols=4 left the 4th column empty at wide viewports,
            a real regression this project's own bento-gap assertion should
            have caught (see Playwright verification below). */}
        {/* Gated behind !!stats, not !isLoading — confirmed real bug otherwise on
            two levels. (1) CashHero mounted unconditionally, so on every load/
            date-range change it first mounted with curr=undefined, and useCountUp's
            "skip animation on first mount" logic locked onto that placeholder 0 as
            its baseline, then visibly animated up over 700ms while WeeklyDigest
            (which waits for curr to be defined before rendering at all) snapped
            straight to the already-resolved value — same number, two different-
            looking states on screen at once purely from render timing, not a data
            divergence. (2) Gating on `!isLoading` alone doesn't close this: this
            query is `enabled: !!orgId`, and orgId itself comes from an async
            useCurrentOrg() query — react-query's `isLoading` is `isPending &&
            isFetching`, which is *false* while a disabled query is waiting on its
            `enabled` condition (not yet fetching), even though `stats` is still
            undefined. `!!stats` is the actual "do we have real data" check. */}
        {!!stats && (
          <>
            <BentoGrid rowHeight="10.5rem" cols={3}>
              <BentoCell span="hero">
                <CashHero
                  curr={c?.cash}
                  prev={p?.cash}
                  revenue={c?.contractValue}
                  series={moneySeries}
                  pace={stats?.pace}
                  prevCashRatePct={prevCashRatePct}
                />
              </BentoCell>
              <BentoCell span="tall">
                <PaceTallCard pace={stats?.pace} targetProgress={targetProgress} />
              </BentoCell>
            </BentoGrid>
          </>
        )}

        {/* Company KPIs stay focused on executive-level measures. Detailed
            funnel stages remain in Level 3 and are not duplicated here.
            Revenue Generated (formerly labeled "Contract Value / Cash" here)
            moved to the top executive KPI row below — one home, not two. */}
        {!!stats && (
          <KpiBand
            title="Company KPIs"
            items={[
              {
                key: "newLeads",
                label: "New Leads",
                value: fmt(c?.newLeads ?? 0),
                spectrum: "cold",
                spark: stats.series.map((point) => point.leads),
                sparkLabels: stats.series.map((point) => point.d),
                sparkVariant: "bar",
                deltaPct: pctDelta(c?.newLeads ?? 0, p?.newLeads ?? 0),
                priorValue: fmt(p?.newLeads ?? 0),
                empty: !c?.newLeads,
                emptyHint: "No new leads logged in this range.",
              },
              {
                key: "totalViews",
                label: "Total Views",
                value: fmt(c?.views ?? 0),
                spectrum: "cold",
                spark: stats.series.map((point) => point.views),
                sparkLabels: stats.series.map((point) => point.d),
                deltaPct: pctDelta(c?.views ?? 0, p?.views ?? 0),
                priorValue: fmt(p?.views ?? 0),
                empty: !c?.views,
                emptyHint: "Log content metrics to see views here.",
              },
            ]}
          />
        )}

        <div className="mt-8 mb-4 text-sm font-bold uppercase tracking-[0.16em] text-foreground">
          Level 2 · Operating performance
        </div>
        {/* Operating metrics — VSL/Applications/Rep-efficiency/Client-momentum
            data that used to live in the flat `HubMetrics` bands before Part 6
            deleted that module without folding any of it back in (confirmed
            real data loss, not a UI opinion). Restored via the same composed
            KpiBand/RateSmallMultiples vocabulary as the rest of this page. */}
        <HubOperatingMetrics />

        <div className="mt-8 mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-bold uppercase tracking-[0.16em] text-foreground">
            Level 3 · Content attribution
          </div>
          <label className="grid gap-1 text-2xs font-medium uppercase tracking-wider text-muted-foreground">
            Attribution model
            <Select
              value={attributionModel}
              onValueChange={(value) => setAttributionModel(value as AttributionModel)}
            >
              <SelectTrigger className="h-8 w-44 text-xs normal-case tracking-normal text-foreground">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ATTRIBUTION_MODELS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {ATTRIBUTION_MODEL_LABELS[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        </div>
        {/* Where did the money come from? Compact top-channels summary — same
            canonical paths as the per-content table below (never a second
            attribution engine), grouped by platform. "Explore Attribution →"
            deep-links to the master Attribution page on this same model. */}
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-foreground">Revenue by Source</div>
              <div className="text-2xs text-muted-foreground">
                {`${ATTRIBUTION_MODEL_LABELS[attributionModel]} basis${attributionModel === "assisted_touch" ? " — assisted credit, not direct revenue credit" : ""}`}
              </div>
            </div>
            <Link
              to="/attribution"
              search={{ model: attributionModel }}
              className="shrink-0 whitespace-nowrap text-xs text-primary hover:underline"
            >
              Explore Attribution →
            </Link>
          </div>
          {revenueBySourceRows.length === 0 ? (
            <div className="py-4 text-center text-xs text-muted-foreground">
              No attributed revenue by source for this model in range.
            </div>
          ) : (
            <div className="divide-y divide-border/70">
              {revenueBySourceRows.map((row) => (
                <div
                  key={row.platform}
                  className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <PlatformIcon
                      platform={row.platform}
                      className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                    />
                    <span className="truncate text-sm font-medium">{row.platform}</span>
                    <span
                      className={cn(
                        "shrink-0 text-3xs font-semibold uppercase tracking-wider",
                        row.strength === "high"
                          ? "text-spectrum-hot"
                          : row.strength === "medium"
                            ? "text-spectrum-mid"
                            : "text-muted-foreground",
                      )}
                    >
                      {row.strength} confidence
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-4 font-mono text-xs tabular-nums">
                    <span className="text-muted-foreground">{fmt(row.closes)} closes</span>
                    <span className="text-muted-foreground">{money(row.revenueCents)} rev</span>
                    <span className="font-semibold text-foreground">{money(row.cashCents)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="mt-3 overflow-hidden rounded-lg border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/70 text-left text-2xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Content</th>
                  <th className="px-3 py-2 text-right font-medium">Views</th>
                  <th className="px-3 py-2 text-right font-medium">Leads</th>
                  <th className="px-3 py-2 text-right font-medium">Booked</th>
                  <th className="px-3 py-2 text-right font-medium">Shows</th>
                  <th className="px-3 py-2 text-right font-medium">Closes</th>
                  <th className="px-3 py-2 text-right font-medium">Cash</th>
                  <th className="px-4 py-2 text-right font-medium">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {attributionRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-6 text-center text-xs text-muted-foreground">
                      No attributed content activity in this range for this model.
                    </td>
                  </tr>
                ) : (
                  attributionRows.map((row) => (
                    <tr
                      key={row.contentId}
                      className="cursor-pointer hover:bg-muted/20"
                      onClick={() =>
                        setHubSelected({
                          kind: "attribution",
                          contentId: row.contentId,
                          label: row.title,
                        })
                      }
                    >
                      <td className="px-4 py-2.5">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <PlatformIcon
                            platform={row.platform}
                            className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                          />
                          <span className="truncate text-sm font-medium">{row.title}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs tabular-nums">
                        {fmt(row.views)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs tabular-nums">
                        {fmt(row.leads)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs tabular-nums">
                        {fmt(row.booked)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs tabular-nums">
                        {fmt(row.showed)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs tabular-nums">
                        {fmt(row.closes)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-sm font-semibold text-foreground">
                        {money(row.cashCents)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums">
                        {money(row.revenueCents)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {attributionRows.length > 0 && (
            <div className="border-t border-border/70 px-4 py-2 text-3xs text-muted-foreground">
              Booked/Shows reflect each call's own logged source and stay the same across every
              attribution model above — they're a direct call-level fact, not a multi-touch credit.
            </div>
          )}
        </div>

        <div className="mt-8 mb-4 text-sm font-bold uppercase tracking-[0.16em] text-foreground">
          Level 4 · Funnel diagnostic
        </div>
        {/* What part of the funnel is working or leaking? Same real
            Views→Leads→Booked→Showed→Offers→Closed counts the page already
            computes, now in the canonical FunnelInstrument (clickable stages
            → real underlying records) plus one deterministic leak finding —
            no AI call, the same deriveCap/deriveWorking engine the rep
            dashboards use. */}
        <FunnelInstrument
          title="Views → Leads → Booked → Showed → Offers → Closed"
          subtitle={formatRangeLabel(range)}
          stages={funnelStages}
          onStageClick={(i) => setHubSelected({ kind: "funnel", index: i })}
        />
        <div className="mt-3 rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            <AlertTriangle className="h-3.5 w-3.5 text-spectrum-mid" /> Largest funnel leak
          </div>
          {leakCap ? (
            <>
              <p
                className={cn(
                  "mt-2 text-sm",
                  leakCap.status === "insufficient_data"
                    ? "italic text-muted-foreground"
                    : "text-foreground",
                )}
              >
                {leakIndex != null
                  ? `Largest leak: ${funnelStages[leakIndex - 1]?.label} → ${funnelStages[leakIndex]?.label}. `
                  : ""}
                {leakCap.sentence}
              </p>
              {leakCap.status === "ok" && leakAction && (
                <p className="mt-2 text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">Recommended: </span>
                  {leakAction}
                </p>
              )}
            </>
          ) : (
            <p className="mt-2 text-sm italic text-muted-foreground">
              Revenue impact unavailable — insufficient connected data.
            </p>
          )}
        </div>

        <div className="mt-8 mb-4 text-sm font-bold uppercase tracking-[0.16em] text-foreground">
          Executive insights
        </div>
        {/* What requires attention? A small, honest list — never a recreation
            of the removed Action & Intelligence section. Deterministic rules
            over already-computed real numbers (funnel leak, pace-vs-target),
            never a generic AI claim; "All clear" when nothing qualifies. */}
        <ExecutiveInsights
          leakIndex={leakIndex}
          leakCap={leakCap}
          leakAction={leakAction}
          funnelStages={funnelStages}
          targetProgress={targetProgress}
          fmtMoney={money}
        />

        <div className="mt-8 mb-4 text-sm font-bold uppercase tracking-[0.16em] text-foreground">
          Team efficiency
        </div>
        {/* Leaderboards — RepLeaderboard + metric-selector, same component and
            pattern the rep dashboards already use. Closers rank by Closes /
            Cash Collected / Revenue Generated; Setters by Sets / Cash
            Collected / Revenue Generated (Part 7). Preserved as-is — not part
            of the Level 3/4 reconstruction, just renumbered out of the way
            since Level 4 now means the funnel diagnostic. */}
        <div className="grid gap-4 lg:grid-cols-2">
          <RepLeaderboard
            titlePrefix="Top closers"
            metrics={HUB_CLOSER_METRICS}
            metricKey={closerMetric}
            onMetricChange={setCloserMetric}
            people={lbData?.closers ?? []}
            emptyLabel="No closers in range."
            dateRange={lbRange}
            onDateRangeChange={setLbOverride}
            overridden={!!lbOverride}
            onResetRange={() => setLbOverride(null)}
          />
          <RepLeaderboard
            titlePrefix="Top setters"
            metrics={HUB_SETTER_METRICS}
            metricKey={setterMetric}
            onMetricChange={setSetterMetric}
            people={lbData?.setters ?? []}
            emptyLabel="No setters in range."
            dateRange={lbRange}
            onDateRangeChange={setLbOverride}
            overridden={!!lbOverride}
            onResetRange={() => setLbOverride(null)}
          />
        </div>

        {/* Level 5 Action and Intelligence is intentionally removed per product specification. */}
      </div>
      {funnelPanel && (
        <MetricDetailPanel
          open={hubSelected?.kind === "funnel"}
          onOpenChange={(v) => !v && setHubSelected(null)}
          title={funnelPanel.title}
          subtitle={funnelPanel.subtitle}
          columns={funnelPanel.columns}
          rows={funnelPanel.rows}
          rowKey={funnelPanel.rowKey}
          cap={funnelPanel.cap}
          working={funnelPanel.working}
          emptyRowsLabel={funnelPanel.emptyRowsLabel}
        />
      )}
      {attributionPanel && (
        <MetricDetailPanel
          open={hubSelected?.kind === "attribution"}
          onOpenChange={(v) => !v && setHubSelected(null)}
          title={attributionPanel.title}
          subtitle={attributionPanel.subtitle}
          columns={attributionPanel.columns}
          rows={attributionPanel.rows}
          rowKey={attributionPanel.rowKey}
          cap={attributionPanel.cap}
          working={attributionPanel.working}
          emptyRowsLabel={attributionPanel.emptyRowsLabel}
        />
      )}
    </>
  );
}

function TrendChart({
  data,
  labels,
  spectrum,
  variant = "line",
}: {
  data: number[];
  labels: string[];
  spectrum: SpectrumPosition;
  variant?: "line" | "bar";
}) {
  return (
    <div className="flex h-14 items-center px-1">
      <InteractiveSparkline
        data={data}
        labels={labels}
        variant={variant}
        width={220}
        height={42}
        stroke={SPECTRUM_VAR[spectrum]}
        fill={SPECTRUM_VAR[spectrum]}
        strokeWidth={1.5}
      />
    </div>
  );
}

type PaceStats = {
  monthCash: number;
  projection: number;
  dayOfMonth: number;
  daysInMonth: number;
  dailyPace: number;
};

/** Cash Collected mega-hero (Part B1/B4) — the dashboard's one hero moment. Mega
 * number (serif, spectrum-hot per B4's "converted/cash" position) count-up's on
 * date-range change; the daily-cash series renders as a dim ambient background
 * area chart, not a readable standalone chart (the full readable version stays
 * in the Charts row below, untouched — nothing here replaces it). */
function MoneyHeroTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ payload: MoneyPoint }>;
  label?: string;
}) {
  const money = useMoney();
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  if (!point) return null;
  const rate = point.revenue > 0 ? (point.cash / point.revenue) * 100 : 0;
  const date = new Date(`${point.d}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return (
    <FollowCursorTooltip active={active}>
      <div className="rounded-lg border border-border bg-popover/95 px-3 py-2 text-xs shadow-xl">
        <div className="mb-1.5 text-2xs font-medium text-muted-foreground">{date || label}</div>
        <div className="space-y-0.5 font-mono tabular-nums">
          <div className="flex items-center justify-between gap-5">
            <span className="text-spectrum-hot">Cash Collected</span>
            <span className="text-spectrum-hot">{money(point.cash)}</span>
          </div>
          <div className="flex items-center justify-between gap-5">
            <span className="text-foreground">Revenue Generated</span>
            <span className="text-foreground">{money(point.revenue)}</span>
          </div>
          <div className="mt-1 border-t border-border/60 pt-1 text-muted-foreground">
            Cash collected rate: <span className="text-foreground">{rate.toFixed(1)}%</span>
          </div>
        </div>
      </div>
    </FollowCursorTooltip>
  );
}

function CashHero({
  curr,
  prev,
  revenue,
  series,
  pace,
  prevCashRatePct,
}: {
  curr?: number;
  prev?: number;
  revenue?: number;
  series: MoneyPoint[];
  pace?: PaceStats;
  prevCashRatePct?: number;
}) {
  const animated = useCountUp(curr ?? 0, 700);
  const money = useMoney();
  const hasDelta = curr !== undefined && prev !== undefined;
  const delta =
    hasDelta && prev! > 0 ? ((curr! - prev!) / prev!) * 100 : hasDelta && curr! > 0 ? 100 : 0;
  const up = delta > 0.5;
  const down = delta < -0.5;
  const DeltaIcon = up ? TrendingUp : down ? TrendingDown : Minus;
  const cashRate = revenue && revenue > 0 ? ((curr ?? 0) / revenue) * 100 : 0;
  const cashRateDeltaPts =
    revenue && revenue > 0 && prevCashRatePct !== undefined
      ? cashRate - prevCashRatePct
      : undefined;

  return (
    <div className="group relative flex h-full flex-col justify-between overflow-hidden rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="glass-highlight pointer-events-none absolute inset-0 rounded-2xl" />
      <div className="relative flex items-center justify-between gap-3 border-b border-border/60 pb-2.5">
        <div className="flex min-w-0 items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          <Activity className="h-4 w-4 shrink-0 text-spectrum-hot" />
          <span className="truncate">Cash Collected vs. Revenue Generated</span>
        </div>
        {hasDelta && (
          <span
            className={cn(
              "flex shrink-0 items-center gap-1 rounded-full border border-border/70 bg-background/35 px-2 py-1 font-mono text-2xs",
              up && "text-[color:var(--color-success)]",
              down && "text-destructive",
              !up && !down && "text-muted-foreground",
            )}
          >
            <DeltaIcon className="h-2.5 w-2.5" /> {Math.abs(delta).toFixed(0)}%
          </span>
        )}
      </div>
      <div className="relative mt-3 flex flex-wrap items-end gap-3 font-sans tabular-nums">
        <div>
          <div className="text-3xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Cash Collected
          </div>
          <div className="mt-0.5 text-3xl font-bold tracking-tight text-spectrum-hot md:text-4xl">
            {money(animated)}
          </div>
        </div>
        <div className="pb-1 text-lg text-muted-foreground">→</div>
        <div>
          <div className="text-3xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Revenue Generated
          </div>
          <div className="mt-0.5 text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            {money(revenue ?? 0)}
          </div>
        </div>
      </div>
      <div className="relative mt-3 flex items-center justify-between text-3xs uppercase tracking-[0.12em] text-muted-foreground">
        <span className="flex items-center gap-2">
          <span className="h-1.5 w-3 rounded-full bg-spectrum-hot" />
          Cash
        </span>
        <span className="flex items-center gap-2">
          <span className="h-0 w-3 border-t border-dashed border-muted-foreground" />
          Revenue
        </span>
      </div>
      <div className="relative mt-3 flex h-full min-h-0 flex-1 flex-col rounded-lg border border-border/60 bg-background/20 px-1 py-1">
        <div className="min-h-0 flex-1">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={series} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="cashHeroGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--spectrum-hot)" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="var(--spectrum-hot)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="2 4"
                stroke="var(--border)"
                vertical={false}
                opacity={0.45}
              />
              <XAxis dataKey="d" hide />
              <YAxis hide domain={["auto", "auto"]} />
              <Tooltip
                cursor={{ stroke: "var(--spectrum-hot)", strokeDasharray: "3 3", opacity: 0.8 }}
                content={<MoneyHeroTooltip />}
              />
              <Area
                type="monotone"
                dataKey="cash"
                name="cash"
                stroke="var(--spectrum-hot)"
                fill="url(#cashHeroGrad)"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="revenue"
                name="revenue"
                stroke="var(--muted-foreground)"
                strokeDasharray="5 4"
                strokeWidth={1.6}
                dot={false}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="relative mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-border/60 pt-2 text-2xs text-muted-foreground">
        <span>
          vs prior period ·{" "}
          <span className="font-mono text-foreground">
            {prev !== undefined ? money(prev) : "—"}
          </span>
        </span>
        <span>
          Cash collected rate:{" "}
          <span className="font-mono text-foreground">{cashRate.toFixed(1)}%</span>
          {cashRateDeltaPts !== undefined && (
            <span
              className={cn(
                "ml-1 font-mono",
                cashRateDeltaPts >= 0 ? "text-[color:var(--color-success)]" : "text-destructive",
              )}
            >
              ({cashRateDeltaPts >= 0 ? "+" : ""}
              {cashRateDeltaPts.toFixed(1)}pt vs prior)
            </span>
          )}
        </span>
        {pace && (
          <span>
            Pace{" "}
            <span className="font-mono font-semibold text-foreground">{money(pace.dailyPace)}</span>
            /day
          </span>
        )}
      </div>
    </div>
  );
}

/** Month-end pace, in a "tall" bento cell alongside the cash hero — relocated
 * from the old standalone PaceCard (same monthCash/projection/dailyPace/progress
 * values, vertical layout to fit the 1x2 span). */
const TARGET_STATUS_TONE: Record<string, string> = {
  ahead: "text-[color:var(--color-success)]",
  on_pace: "text-[color:var(--color-success)]",
  behind: "text-spectrum-mid",
  at_risk: "text-destructive",
  no_target: "text-muted-foreground",
  insufficient_data: "text-muted-foreground",
};

function PaceTallCard({
  pace,
  targetProgress,
}: {
  pace?: PaceStats;
  targetProgress?: TargetProgress | null;
}) {
  const money = useMoney();
  if (!pace) return null;
  const progress = Math.min(100, (pace.dayOfMonth / pace.daysInMonth) * 100);
  const remaining = Math.max(0, pace.daysInMonth - pace.dayOfMonth);
  const hasTarget = targetProgress && targetProgress.status !== "no_target";
  return (
    <div className="relative flex h-full flex-col gap-3 overflow-hidden rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted/60 text-spectrum-mid">
          <Target className="h-4 w-4" />
        </div>
        <div className="flex-1 text-3xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Month-end pace
        </div>
        <span className="h-1.5 w-1.5 rounded-full bg-spectrum-mid" />
      </div>

      <div className="flex flex-1 flex-col justify-center gap-2">
        <div>
          <div className="font-sans text-4xl font-bold tabular-nums tracking-tight text-spectrum-mid">
            {money(pace.projection)}
          </div>
          <div className="mt-0.5 text-3xs uppercase tracking-[0.14em] text-muted-foreground">
            Projected close
          </div>
        </div>
        {/* Same monthCash/dailyPace values as before, just grouped into a real
            content block instead of two loose lines — fills the tall cell's
            middle instead of leaving it as dead space. */}
        <div className="grid grid-cols-2 gap-2 rounded-xl border border-border/50 bg-background/35 p-2.5">
          <div>
            <div className="font-sans text-base font-semibold tabular-nums">
              {money(pace.monthCash)}
            </div>
            <div className="mt-0.5 text-3xs uppercase tracking-wide text-muted-foreground">
              Collected so far
            </div>
          </div>
          <div>
            <div className="font-sans text-base font-semibold tabular-nums">
              {money(pace.dailyPace)}
            </div>
            <div className="mt-0.5 text-3xs uppercase tracking-wide text-muted-foreground">
              Per day
            </div>
          </div>
        </div>

        {/* Real target rollup from the Rep KPI Target Engine (sum of active
            closer monthly Cash Collected targets) — never invented. Anchored
            to the calendar month, independent of the page's own date range,
            so a partial custom range never gets misread as a full-period
            result (Priority 9 §9). */}
        {hasTarget && targetProgress ? (
          <div className="rounded-xl border border-border/50 bg-background/35 p-2.5">
            <div className="flex items-center justify-between text-3xs uppercase tracking-wide text-muted-foreground">
              <span>Target · {targetProgress.periodLabel}</span>
              <span className={cn("font-semibold", TARGET_STATUS_TONE[targetProgress.status])}>
                {STATUS_LABELS[targetProgress.status]}
              </span>
            </div>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="font-sans text-base font-semibold tabular-nums">
                {money(targetProgress.targetValue ?? 0)}
              </span>
              <span
                className={cn(
                  "font-mono text-xs tabular-nums",
                  (targetProgress.variance ?? 0) >= 0
                    ? "text-[color:var(--color-success)]"
                    : "text-destructive",
                )}
              >
                {(targetProgress.variance ?? 0) >= 0 ? "+" : "−"}
                {money(Math.abs(targetProgress.variance ?? 0))}
              </span>
            </div>
            {targetProgress.requiredDailyPace != null && targetProgress.daysRemaining > 0 && (
              <div className="mt-1 text-3xs text-muted-foreground">
                Needs {money(targetProgress.requiredDailyPace)}/day to reach target ·{" "}
                {targetProgress.daysRemaining} days left in the month
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border/50 bg-background/20 p-2.5 text-3xs text-muted-foreground">
            No monthly Cash Collected target configured for the closer team yet — set one in Team →
            KPI Targets to see pace-to-target here.
          </div>
        )}
      </div>

      <div>
        <div className="mb-1.5 flex justify-between text-3xs uppercase tracking-[0.14em] text-muted-foreground">
          <span>
            Day {pace.dayOfMonth}/{pace.daysInMonth} (calendar month)
          </span>
          <span>
            {remaining} left · {progress.toFixed(0)}%
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-muted">
          <div className="h-full rounded-full bg-spectrum-mid" style={{ width: `${progress}%` }} />
        </div>
      </div>
    </div>
  );
}

/**
 * "What requires attention?" — a small, honest list of real, deterministic
 * findings (never a recreation of the removed Action & Intelligence section,
 * never an AI call). Each insight is derived from numbers already computed
 * on this page; "All clear" when nothing meets the bar rather than padding
 * the list to hit a count.
 */
function ExecutiveInsights({
  leakIndex,
  leakCap,
  leakAction,
  funnelStages,
  targetProgress,
  fmtMoney,
}: {
  leakIndex: number | null;
  leakCap: Derivation | null;
  leakAction?: string;
  funnelStages: DerivedFunnelStage[];
  targetProgress?: TargetProgress | null;
  fmtMoney: (cents: number) => string;
}) {
  type Insight = {
    key: string;
    claim: string;
    metric: string;
    implication?: string;
    action: string;
  };
  const insights: Insight[] = [];

  if (leakIndex != null && leakCap?.status === "ok" && leakAction) {
    const from = funnelStages[leakIndex - 1]?.label;
    const to = funnelStages[leakIndex]?.label;
    insights.push({
      key: "leak",
      claim: `Largest funnel leak: ${from} → ${to}`,
      metric: leakCap.sentence,
      implication:
        "The single biggest constraint on how much of your top-of-funnel volume turns into cash this period.",
      action: leakAction,
    });
  }

  if (
    targetProgress &&
    (targetProgress.status === "behind" || targetProgress.status === "at_risk")
  ) {
    insights.push({
      key: "pace",
      claim:
        targetProgress.status === "at_risk"
          ? "At risk of missing this month's cash target"
          : "Behind pace on this month's cash target",
      metric: targetProgress.reason,
      implication:
        targetProgress.variance != null
          ? `Currently ${fmtMoney(Math.abs(targetProgress.variance))} ${
              targetProgress.variance < 0 ? "short of" : "ahead of"
            } where this month should be.`
          : undefined,
      action:
        leakIndex != null && funnelStages[leakIndex]
          ? `Focus on ${funnelStages[leakIndex - 1]?.label} → ${funnelStages[leakIndex]?.label} (see Funnel Diagnostic above) to close the gap.`
          : "Increase booked-call volume or prioritize higher-intent leads to close the gap.",
    });
  }

  if (insights.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-4 text-sm text-foreground">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-[color:var(--color-success)]" />
        All clear — continue monitoring cash pace and funnel conversion.
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {insights.slice(0, 5).map((insight) => (
        <div key={insight.key} className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-3xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            <Lightbulb className="h-3.5 w-3.5 text-spectrum-mid" /> Requires attention
          </div>
          <div className="mt-1.5 text-sm font-semibold text-foreground">{insight.claim}</div>
          <p className="mt-1 text-xs text-muted-foreground">{insight.metric}</p>
          {insight.implication && (
            <p className="mt-1 text-xs text-muted-foreground">{insight.implication}</p>
          )}
          <p className="mt-2 text-xs">
            <span className="font-semibold text-foreground">Recommended: </span>
            <span className="text-muted-foreground">{insight.action}</span>
          </p>
        </div>
      ))}
    </div>
  );
}
