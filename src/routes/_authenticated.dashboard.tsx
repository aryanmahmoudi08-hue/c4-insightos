import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useCurrentOrg } from "@/hooks/use-auth";
import { mockDashboardStats } from "@/lib/dev-mock-data";
import { PlatformIcon } from "@/components/platform-icon";
import { TopBar } from "@/components/app-sidebar";
import { useDateRange } from "@/hooks/use-date-range";
import { Link } from "@tanstack/react-router";
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
} from "lucide-react";
import { useMemo, useState } from "react";
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
import { KpiBand } from "@/components/kpi-band";
import { KpiCard } from "@/components/kpi-card";
import { InteractiveSparkline } from "@/components/interactive-sparkline";
import { HubOperatingMetrics } from "@/components/hub-operating-metrics";
import { MoneyInstrument, type MoneyPoint } from "@/components/money-instrument";
import { RepLeaderboard, type RepMetricOption } from "@/components/rep-leaderboard";
import { pctDelta } from "@/lib/trend";
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
const money = (c: number) =>
  "$" + new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(c / 100));
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
const HUB_CLOSER_METRICS: RepMetricOption<HubCloserPerson>[] = [
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
const HUB_SETTER_METRICS: RepMetricOption<HubSetterPerson>[] = [
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
    supabase
      .from("leads")
      .select("id, created_at, source_platform, source_campaign")
      .eq("org_id", orgId)
      .gte("created_at", fromISO)
      .lte("created_at", toISO),
    supabase
      .from("calls")
      .select(
        "showed, closed, offer_made, contract_value_cents, cash_collected_cents, created_at, source_platform, source_campaign",
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
  };
}

function Dashboard() {
  const { data: org } = useCurrentOrg();
  const orgId = org?.org_id;
  const { devBypass } = useAuth();
  const { range } = useDateRange();
  const [socialPlatform, setSocialPlatform] = useState<SocialPlatform | "all">("all");
  const [acquisitionSource, setAcquisitionSource] = useState<AcquisitionSource | "all">("all");

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

      const [
        curr,
        prev,
        monthPays,
        monthCalls,
        monthSetters,
        setterAct,
        alerts,
        insights,
        contentAttribution,
      ] = await Promise.all([
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
          .select("team_member_name, role, sets, closes, cash_collected_cents, total_revenue_cents")
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
        // Content-to-cash: top pieces by attributed cash in range
        supabase
          .from("content_metrics")
          .select(
            "content_id, cash_collected_cents, leads_generated, closes, views, content_pieces!inner(title, platform)",
          )
          .eq("org_id", orgId!)
          .gte("captured_at", fromISO)
          .lte("captured_at", toISO)
          .order("cash_collected_cents", { ascending: false, nullsFirst: false })
          .limit(5),
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
        contentAttribution: contentAttribution.data ?? [],
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
                />
              </BentoCell>
              <BentoCell span="tall">
                <PaceTallCard pace={stats?.pace} />
              </BentoCell>
            </BentoGrid>
          </>
        )}

        {/* Company KPIs stay focused on four executive-level measures. Detailed
            funnel stages remain in Level 3 and are not duplicated here. */}
        {!!stats && (
          <KpiBand
            title="Company KPIs"
            items={[
              {
                key: "contractValue",
                label: "Contract Value / Cash",
                value: money(c?.contractValue ?? 0),
                spectrum: "hot",
                featured: true,
                spark: stats.series.map((point) => point.contractValue),
                sparkLabels: stats.series.map((point) => point.d),
                deltaPct: pctDelta(c?.contractValue ?? 0, p?.contractValue ?? 0),
                priorValue: money(p?.contractValue ?? 0),
                empty: !c?.contractValue,
                emptyHint: "Contract value shows up once a deal closes.",
              },
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

        <div className="mt-8 mb-4 text-sm font-bold uppercase tracking-[0.16em] text-foreground">
          Level 3 · Funnel and cash outcomes
        </div>
        {/* Reach and Close are deliberate summary instruments: two horizontal cards
            keep the funnel readable without nesting legacy stage capsules inside a
            grouped container. The cash-vs-revenue chart remains below them. */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ReachSummaryCard
            views={c?.views ?? 0}
            leads={c?.newLeads ?? 0}
            priorViews={p?.views ?? 0}
            priorLeads={p?.newLeads ?? 0}
            series={hubSeries}
          />
          <CloseSummaryCard
            booked={c?.totalCalls ?? 0}
            showed={c?.showed ?? 0}
            offers={c?.offers ?? 0}
            closed={c?.closed ?? 0}
            series={hubSeries}
          />
        </div>
        <div className="mt-8 mb-4 text-sm font-bold uppercase tracking-[0.16em] text-foreground">
          Level 3 · Content attribution
        </div>
        {/* Content-to-cash attribution strip */}
        <ContentToCashStrip rows={stats?.contentAttribution ?? []} />

        <div className="mt-8 mb-4 text-sm font-bold uppercase tracking-[0.16em] text-foreground">
          Level 4 · Team efficiency
        </div>
        {/* Leaderboards — RepLeaderboard + metric-selector, same component and
            pattern the rep dashboards already use. Closers rank by Closes /
            Cash Collected / Revenue Generated; Setters by Sets / Cash
            Collected / Revenue Generated (Part 7). */}
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
    </>
  );
}

type FunnelSeriesPoint = {
  d: string;
  views?: number;
  leads?: number;
  calls?: number;
  showed?: number;
  offers?: number;
  closed?: number;
};

function StatusDot({ tone }: { tone: "cold" | "mid" | "hot" }) {
  return (
    <span
      className="h-2 w-2 rounded-full shadow-[0_0_10px_currentColor]"
      style={{ color: SPECTRUM_VAR[tone], background: SPECTRUM_VAR[tone] }}
      aria-hidden
    />
  );
}

function ReachSummaryCard({
  views,
  leads,
  priorViews,
  priorLeads,
  series,
}: {
  views: number;
  leads: number;
  priorViews: number;
  priorLeads: number;
  series: FunnelSeriesPoint[];
}) {
  const conversion = views > 0 ? (leads / views) * 100 : 0;
  const priorConversion = priorViews > 0 ? (priorLeads / priorViews) * 100 : 0;
  const conversionDelta =
    priorConversion > 0 ? ((conversion - priorConversion) / priorConversion) * 100 : 0;
  const chartData = series.map((point) => ({
    d: point.d,
    views: Number(point.views ?? 0),
    leads: Number(point.leads ?? 0),
  }));
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-spectrum-cold/30 bg-gradient-to-br from-card via-card to-spectrum-cold/[0.08] p-4 shadow-[0_18px_55px_-34px_rgba(34,211,238,0.55)]">
      <div className="glass-highlight pointer-events-none absolute inset-0 rounded-2xl" />
      <div className="relative flex items-center justify-between gap-3 border-b border-border/60 pb-3">
        <div className="flex min-w-0 items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          <Activity className="h-4 w-4 shrink-0 text-spectrum-cold" />
          <span className="truncate">Reach: Views to Leads</span>
        </div>
        <StatusDot tone="cold" />
      </div>
      <div className="relative mt-4 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
        <div className="min-w-0">
          <div className="font-sans text-3xl font-bold tabular-nums tracking-tight text-spectrum-cold">
            {fmt(views)}
          </div>
          <div className="mt-1 text-2xs text-muted-foreground">Top-of-funnel volume</div>
          <div className="mt-1 text-3xs text-muted-foreground">vs {fmt(priorViews)} prior</div>
        </div>
        <div className="min-w-[5.5rem] text-center">
          <div className="font-sans text-xl font-bold tabular-nums text-spectrum-hot">
            {conversion.toFixed(2)}%
          </div>
          <div className="mt-0.5 flex items-center justify-center gap-1 text-3xs uppercase tracking-[0.12em] text-muted-foreground">
            {conversionDelta >= 0 ? (
              <TrendingUp className="h-3 w-3 text-[color:var(--color-success)]" />
            ) : (
              <TrendingDown className="h-3 w-3 text-destructive" />
            )}
            {Math.abs(conversionDelta).toFixed(0)}% · Lead Conv
          </div>
        </div>
        <div className="min-w-0 text-right">
          <div className="font-sans text-3xl font-bold tabular-nums tracking-tight text-spectrum-cold">
            {fmt(leads)}
          </div>
          <div className="mt-1 text-2xs text-muted-foreground">Qualified outcomes</div>
          <div className="mt-1 text-3xs text-muted-foreground">vs {fmt(priorLeads)} prior</div>
        </div>
      </div>
      <div className="relative mt-4 rounded-lg border border-spectrum-cold/20 bg-background/20 px-2 py-2">
        <div className="mb-1 flex items-center justify-between text-3xs uppercase tracking-[0.12em] text-muted-foreground">
          <span>Volume history</span>
          <span className="flex items-center gap-2">
            <span className="text-spectrum-cold">Views</span>
            <span className="text-spectrum-hot">Leads</span>
          </span>
        </div>
        <div className="h-16">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 3, right: 3, left: 3, bottom: 0 }}>
              <CartesianGrid
                stroke="var(--border)"
                strokeDasharray="2 3"
                vertical={false}
                opacity={0.35}
              />
              <XAxis dataKey="d" hide />
              <YAxis yAxisId="views" hide domain={["auto", "auto"]} />
              <YAxis yAxisId="leads" hide domain={["auto", "auto"]} />
              <Tooltip
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 11,
                }}
                formatter={(value: number, name: string) => [
                  value.toLocaleString(),
                  name === "views" ? "Views" : "Leads",
                ]}
                labelFormatter={(label) => String(label)}
              />
              <Line
                yAxisId="views"
                type="monotone"
                dataKey="views"
                name="views"
                stroke={SPECTRUM_VAR.cold}
                strokeWidth={1.8}
                dot={false}
                isAnimationActive={false}
              />
              <Line
                yAxisId="leads"
                type="monotone"
                dataKey="leads"
                name="leads"
                stroke={SPECTRUM_VAR.hot}
                strokeWidth={1.8}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function CloseSummaryCard({
  booked,
  showed,
  offers,
  closed,
  series,
}: {
  booked: number;
  showed: number;
  offers: number;
  closed: number;
  series: FunnelSeriesPoint[];
}) {
  const stages = [
    { label: "Booked", value: booked, tone: "mid" as const, rate: null },
    {
      label: "Showed",
      value: showed,
      tone: "mid" as const,
      rate: booked > 0 ? (showed / booked) * 100 : null,
    },
    {
      label: "Offers",
      value: offers,
      tone: "mid" as const,
      rate: showed > 0 ? (offers / showed) * 100 : null,
    },
    {
      label: "Closed",
      value: closed,
      tone: "hot" as const,
      rate: offers > 0 ? (closed / offers) * 100 : null,
    },
  ];
  const chartData = stages.map((stage) => ({
    stage: stage.label,
    value: series.reduce((sum, point) => {
      const key = stage.label === "Booked" ? "calls" : stage.label.toLowerCase();
      return sum + Number(point[key as keyof FunnelSeriesPoint] ?? 0);
    }, 0),
  }));
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-spectrum-hot/30 bg-gradient-to-br from-card via-card to-spectrum-hot/[0.08] p-4 shadow-[0_18px_55px_-34px_rgba(236,72,153,0.55)]">
      <div className="glass-highlight pointer-events-none absolute inset-0 rounded-2xl" />
      <div className="relative flex items-center justify-between gap-3 border-b border-border/60 pb-3">
        <div className="flex min-w-0 items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          <Flame className="h-4 w-4 shrink-0 text-spectrum-hot" />
          <span className="truncate">Close: Booked to Closed</span>
        </div>
        <StatusDot tone="hot" />
      </div>
      <div className="relative mt-4 grid grid-cols-4 gap-1.5">
        {stages.map((stage, index) => (
          <div
            key={stage.label}
            className="relative min-w-0 rounded-lg border border-spectrum-mid/20 bg-spectrum-mid/[0.07] px-2 py-2.5 text-center"
          >
            <div className="text-3xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              {stage.label}
            </div>
            <div className="mt-1 font-sans text-2xl font-bold tabular-nums text-foreground">
              {fmt(stage.value)}
            </div>
            {stage.rate !== null && (
              <div className="mt-1 text-3xs font-mono tabular-nums text-spectrum-mid">
                {stage.rate.toFixed(1)}%
              </div>
            )}
            {index < stages.length - 1 && (
              <span className="absolute -right-2 top-1/2 z-10 text-muted-foreground">→</span>
            )}
          </div>
        ))}
      </div>
      <div className="relative mt-3 h-1.5 overflow-hidden rounded-full bg-muted/60">
        {stages.map((stage, index) => (
          <span
            key={stage.label}
            className="inline-block h-full"
            style={{
              width: `${Math.max(8, (stage.value / Math.max(booked, 1)) * 25)}%`,
              background: SPECTRUM_VAR[stage.tone],
              opacity: 0.55 + index * 0.12,
            }}
          />
        ))}
      </div>
      <div className="relative mt-3 rounded-lg border border-spectrum-hot/20 bg-background/20 px-2 py-2">
        <div className="mb-1 text-3xs uppercase tracking-[0.12em] text-muted-foreground">
          Stage volume
        </div>
        <div className="h-14">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 2, right: 2, left: 2, bottom: 0 }}>
              <CartesianGrid
                stroke="var(--border)"
                strokeDasharray="2 3"
                vertical={false}
                opacity={0.35}
              />
              <XAxis dataKey="stage" hide />
              <YAxis hide domain={[0, "auto"]} />
              <Tooltip
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 11,
                }}
                formatter={(value: number) => [value.toLocaleString(), "Count"]}
              />
              <Bar
                dataKey="value"
                fill={SPECTRUM_VAR.hot}
                radius={[3, 3, 0, 0]}
                maxBarSize={32}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
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
  );
}

function CashHero({
  curr,
  prev,
  revenue,
  series,
  pace,
}: {
  curr?: number;
  prev?: number;
  revenue?: number;
  series: MoneyPoint[];
  pace?: PaceStats;
}) {
  const animated = useCountUp(curr ?? 0, 700);
  const hasDelta = curr !== undefined && prev !== undefined;
  const delta =
    hasDelta && prev! > 0 ? ((curr! - prev!) / prev!) * 100 : hasDelta && curr! > 0 ? 100 : 0;
  const up = delta > 0.5;
  const down = delta < -0.5;
  const DeltaIcon = up ? TrendingUp : down ? TrendingDown : Minus;
  const cashRate = revenue && revenue > 0 ? ((curr ?? 0) / revenue) * 100 : 0;

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
function PaceTallCard({ pace }: { pace?: PaceStats }) {
  if (!pace) return null;
  const progress = Math.min(100, (pace.dayOfMonth / pace.daysInMonth) * 100);
  const remaining = Math.max(0, pace.daysInMonth - pace.dayOfMonth);
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
      </div>

      <div>
        <div className="mb-1.5 flex justify-between text-3xs uppercase tracking-[0.14em] text-muted-foreground">
          <span>
            Day {pace.dayOfMonth}/{pace.daysInMonth}
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

type ContentAttrRow = {
  content_id: string;
  cash_collected_cents: number | null;
  leads_generated: number | null;
  closes: number | null;
  views: number | null;
  content_pieces:
    | { title: string | null; platform: string }
    | { title: string | null; platform: string }[];
};

function ContentToCashStrip({ rows }: { rows: ContentAttrRow[] }) {
  const items = rows
    .filter((r) => (r.cash_collected_cents ?? 0) > 0 || (r.leads_generated ?? 0) > 0)
    .map((r) => {
      const cp = Array.isArray(r.content_pieces) ? r.content_pieces[0] : r.content_pieces;
      return {
        id: r.content_id,
        title: cp?.title ?? "(untitled)",
        platform: cp?.platform ?? "",
        cash: r.cash_collected_cents ?? 0,
        leads: r.leads_generated ?? 0,
        closes: r.closes ?? 0,
        views: r.views ?? 0,
      };
    })
    .slice(0, 5);

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/30">
        <div className="text-xs font-semibold uppercase tracking-wider">Content → Revenue</div>
        <Link
          to="/content"
          className="text-xs text-primary hover:underline flex items-center gap-1"
        >
          Open module <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>
      {items.length === 0 ? (
        <div className="p-6 text-center text-xs text-muted-foreground">
          No attributed content cash in this range. Log content with cash_collected_cents to see top
          performers here.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/70 text-left text-2xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2 font-medium">Content</th>
                <th className="px-3 py-2 text-right font-medium">Views</th>
                <th className="px-3 py-2 text-right font-medium">Leads</th>
                <th className="px-3 py-2 text-right font-medium">Closes</th>
                <th className="px-4 py-2 text-right font-medium">Cash</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/70">
              {items.map((it) => (
                <tr key={it.id} className="hover:bg-muted/20">
                  <td className="px-4 py-2.5">
                    <Link to="/content" className="block min-w-0 hover:underline">
                      <div className="truncate text-sm font-medium">{it.title}</div>
                      <div className="text-3xs text-muted-foreground">{it.platform}</div>
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs tabular-nums">
                    {fmt(it.views)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs tabular-nums">
                    {it.leads}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs tabular-nums">
                    {it.closes}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-sm font-semibold text-foreground">
                    {money(it.cash)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
