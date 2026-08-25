import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useCurrentOrg } from "@/hooks/use-auth";
import { mockDashboardStats } from "@/lib/dev-mock-data";
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
} from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { ResponsiveContainer, AreaChart, Area } from "recharts";
import { SlimHeader } from "@/components/slim-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { BentoGrid, BentoCell } from "@/components/bento-grid";
import { useCountUp } from "@/hooks/use-count-up";
import { KpiBand } from "@/components/kpi-band";
import { HubOperatingMetrics } from "@/components/hub-operating-metrics";
import { FunnelInstrument } from "@/components/funnel-instrument";
import { MoneyInstrument, type MoneyPoint } from "@/components/money-instrument";
import { RepLeaderboard, type RepMetricOption } from "@/components/rep-leaderboard";
import type { FunnelStage } from "@/lib/funnel-derivation";
import { pctDelta } from "@/lib/trend";
import type { DateRange } from "@/components/date-range-picker";

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

async function fetchPeriod(orgId: string, from: string, to: string) {
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
      .select("id, created_at")
      .eq("org_id", orgId)
      .gte("created_at", fromISO)
      .lte("created_at", toISO),
    supabase
      .from("calls")
      .select("showed, closed, offer_made, contract_value_cents, cash_collected_cents, created_at")
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
  const leadList = leads.data ?? [];
  const callList = calls.data ?? [];
  const contentList = content.data ?? [];
  const setterList = setters.data ?? [];
  const paymentsCash = payList.reduce((s, p) => s + (p.amount_cents ?? 0), 0);
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

  const {
    data: stats,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["exec-dash", orgId, range.from, range.to, devBypass],
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
        fetchPeriod(orgId!, range.from, range.to),
        fetchPeriod(orgId!, prevFrom, prevTo),
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

  const c = stats?.curr;
  const p = stats?.prev;

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

  // Split by natural scale break — Views runs 100k+ while Leads/Booked/Showed/
  // Offers/Closed run in the 10s-100s, same reason the rep dashboards split
  // their own funnels into Reach/Close rather than one instrument spanning
  // every order of magnitude (a single linear axis would make 5 of 6 bars
  // visually disappear next to Views).
  const reachStages: FunnelStage[] = useMemo(
    () => [
      { key: "views", label: "Views", value: c?.views ?? 0, spectrum: "cold" },
      { key: "leads", label: "Leads", value: c?.newLeads ?? 0, spectrum: "cold" },
    ],
    [c],
  );
  const closeStages: FunnelStage[] = useMemo(
    () => [
      { key: "booked", label: "Booked", value: c?.totalCalls ?? 0, spectrum: "mid" },
      { key: "showed", label: "Showed", value: c?.showed ?? 0, spectrum: "mid" },
      { key: "offers", label: "Offers", value: c?.offers ?? 0, spectrum: "mid" },
      { key: "closed", label: "Closed", value: c?.closed ?? 0, spectrum: "hot" },
    ],
    [c],
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
      <div className="p-4 md:p-6 space-y-4">
        <SlimHeader
          icon={<Activity className="h-4 w-4" />}
          title="Executive Command Center"
          subtitle="Real-time KPIs across content, attribution, and sales"
          accent="accent"
          right={
            <span className="text-2xs font-mono text-muted-foreground">
              {isLoading
                ? "syncing…"
                : `${range.from} → ${range.to} · vs prior ${Math.max(1, Math.round((new Date(range.to).getTime() - new Date(range.from).getTime()) / 86400e3) + 1)}d`}
            </span>
          }
        />

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
            <BentoGrid rowHeight="9.5rem" cols={3}>
              <BentoCell span="hero">
                <CashHero
                  curr={c?.cash}
                  prev={p?.cash}
                  series={stats?.series ?? []}
                  pace={stats?.pace}
                />
              </BentoCell>
              <BentoCell span="tall">
                <PaceTallCard pace={stats?.pace} />
              </BentoCell>
            </BentoGrid>

            {/* Weekly digest */}
            <WeeklyDigest pace={stats?.pace} curr={c} prev={p} />
          </>
        )}

        {/* KPI band — same composed KpiBand treatment already fixed on the rep
            dashboards (Part 4 of this project): real breathing room, consistent
            value sizing, money/outcome metrics featured over volume metrics.
            Cash Collected lives in the mega-hero above, not duplicated here. */}
        {!!stats && (
          <KpiBand
            title="Company KPIs"
            items={[
              {
                key: "contractValue",
                label: "Contract Value",
                value: money(c?.contractValue ?? 0),
                spectrum: "hot",
                featured: true,
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
                deltaPct: pctDelta(c?.views ?? 0, p?.views ?? 0),
                priorValue: fmt(p?.views ?? 0),
                empty: !c?.views,
                emptyHint: "Log content metrics to see views here.",
              },
              {
                key: "callsBooked",
                label: "Calls Booked",
                value: fmt(c?.totalCalls ?? 0),
                spectrum: "mid",
                deltaPct: pctDelta(c?.totalCalls ?? 0, p?.totalCalls ?? 0),
                priorValue: fmt(p?.totalCalls ?? 0),
                empty: !c?.totalCalls,
                emptyHint: "Nothing on the calendar yet for this range.",
              },
              {
                key: "showed",
                label: "Showed",
                value: fmt(c?.showed ?? 0),
                spectrum: "mid",
                deltaPct: pctDelta(c?.showed ?? 0, p?.showed ?? 0),
                priorValue: fmt(p?.showed ?? 0),
                empty: !c?.showed,
                emptyHint: "Mark calls as showed to populate.",
              },
              {
                key: "offersMade",
                label: "Offers Made",
                value: fmt(c?.offers ?? 0),
                spectrum: "mid",
                deltaPct: pctDelta(c?.offers ?? 0, p?.offers ?? 0),
                priorValue: fmt(p?.offers ?? 0),
                empty: !c?.offers,
                emptyHint: "Mark an offer made on a call to populate.",
              },
              {
                key: "closes",
                label: "Closes",
                value: fmt(c?.closed ?? 0),
                spectrum: "hot",
                featured: true,
                deltaPct: pctDelta(c?.closed ?? 0, p?.closed ?? 0),
                priorValue: fmt(p?.closed ?? 0),
                empty: !c?.closed,
                emptyHint: "No closes yet this range — they'll show up here.",
              },
            ]}
          />
        )}

        {/* Operating metrics — VSL/Applications/Rep-efficiency/Client-momentum
            data that used to live in the flat `HubMetrics` bands before Part 6
            deleted that module without folding any of it back in (confirmed
            real data loss, not a UI opinion). Restored via the same composed
            KpiBand/RateSmallMultiples vocabulary as the rest of this page. */}
        <HubOperatingMetrics />

        {/* Charts row — composed instruments (FunnelInstrument/MoneyInstrument),
            same components AND layout the rep dashboards already use: Reach +
            Close funnels side by side, money chart alongside — not a parallel
            hand-rolled chart + flat proportional bar. */}
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <FunnelInstrument title="Reach" subtitle="Views → Leads" stages={reachStages} />
            <FunnelInstrument title="Close" subtitle="Booked → Closed" stages={closeStages} />
          </div>
          <MoneyInstrument series={moneySeries} cashRatePct={cashRatePct} fmtMoney={money} />
        </div>

        {/* Content-to-cash attribution strip */}
        <ContentToCashStrip rows={stats?.contentAttribution ?? []} />

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

        {/* Alerts + Insights */}
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/30">
              <div className="text-xs font-semibold uppercase tracking-wider">Open alerts</div>
              <Link
                to="/insights"
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                View all <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="divide-y divide-border">
              {(stats?.alerts ?? []).map((a) => (
                <div key={a.id} className="px-4 py-2.5 flex items-start gap-3">
                  <span
                    className={`mt-1 h-2 w-2 rounded-full ${a.severity === "critical" ? "bg-destructive" : a.severity === "warning" ? "bg-[color:var(--color-warning)]" : "bg-primary"}`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{a.title}</div>
                    <div className="text-2xs text-muted-foreground">
                      {new Date(a.created_at).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
              {(!stats?.alerts || stats.alerts.length === 0) && (
                <EmptyState
                  icon={<Inbox className="h-4 w-4" />}
                  title="All systems nominal"
                  description="No open alerts in this range."
                />
              )}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/30">
              <div className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-accent" /> AI insights
              </div>
              <Link
                to="/insights"
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                Open module <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="divide-y divide-border">
              {(stats?.insights ?? []).map((i) => (
                <div key={i.id} className="px-4 py-2.5">
                  <div className="text-sm font-medium truncate">{i.title}</div>
                  <div className="text-2xs text-muted-foreground line-clamp-2">{i.body}</div>
                  <div className="text-3xs uppercase tracking-wider text-accent mt-1">
                    {i.module}
                  </div>
                </div>
              ))}
              {(!stats?.insights || stats.insights.length === 0) && (
                <EmptyState
                  icon={<Sparkles className="h-4 w-4" />}
                  title="No insights yet"
                  description="Generate signals from the AI Insights module."
                  action={
                    <Link to="/insights" className="text-xs text-primary hover:underline">
                      Open AI Insights →
                    </Link>
                  }
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

type DigestItem = { label: string; value: string; deltaPct: number };

/** One row of the Period Digest — same value+delta-badge visual language
 * KpiBand already establishes (font-mono value, spectrum/trend-toned delta
 * chip with icon), replacing the old plain `↑ Cash $42,500 (+16%)` bullet. */
function DigestRow({ item, positive }: { item: DigestItem; positive: boolean }) {
  const Icon = positive ? TrendingUp : TrendingDown;
  const tone = positive ? "text-[color:var(--color-success)]" : "text-destructive";
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-background/50 px-2.5 py-1.5">
      <span className="text-2xs font-medium text-foreground">{item.label}</span>
      <span className="flex items-center gap-1.5 font-mono text-2xs">
        <span className="font-semibold text-foreground">{item.value}</span>
        <span className={cn("flex items-center gap-0.5", tone)}>
          <Icon className="h-2.5 w-2.5" />
          {Math.abs(item.deltaPct).toFixed(0)}%
        </span>
      </span>
    </div>
  );
}

function WeeklyDigest({
  pace,
  curr,
  prev,
}: {
  pace?: { monthCash: number; projection: number; dailyPace: number };
  curr?: { cash: number; newLeads: number; closed: number; views: number };
  prev?: { cash: number; newLeads: number; closed: number; views: number };
}) {
  if (!curr) return null;
  const winners: DigestItem[] = [];
  const losers: DigestItem[] = [];
  const cmp = (label: string, c: number, p: number, fmtFn: (n: number) => string) => {
    if (p === 0 && c === 0) return;
    const deltaPct = p > 0 ? ((c - p) / p) * 100 : 100;
    const item: DigestItem = { label, value: fmtFn(c), deltaPct };
    if (deltaPct >= 5) winners.push(item);
    else if (deltaPct <= -5) losers.push(item);
  };
  cmp("Cash", curr.cash, prev?.cash ?? 0, money);
  cmp("Leads", curr.newLeads, prev?.newLeads ?? 0, fmt);
  cmp("Closes", curr.closed, prev?.closed ?? 0, fmt);
  cmp("Views", curr.views, prev?.views ?? 0, fmt);
  // Wins/Pressure keep green/red — this is a genuine state signal (trending up
  // vs down), the same category as a delta badge's arrow, not a funnel-position
  // volume metric. What was missing was the L1 depth/typography treatment every
  // other card on this page now has.
  return (
    <div className="hover-lift relative overflow-hidden rounded-2xl border border-border bg-card p-4">
      <div className="glass-highlight pointer-events-none absolute inset-0 rounded-2xl" />
      <div className="relative flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-muted/60 text-foreground">
            <Calendar className="h-4 w-4" />
          </div>
          <div>
            <div className="text-3xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Period Digest
            </div>
            <div className="display-serif text-lg leading-tight">
              Vs prior period of equal length
            </div>
          </div>
        </div>
        {pace && (
          <div className="text-2xs font-mono text-muted-foreground">
            Month pace ·{" "}
            <span className="text-foreground font-semibold">{money(pace.projection)}</span>{" "}
            projected · {money(pace.dailyPace)}/day
          </div>
        )}
      </div>
      <div className="relative mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-[color:var(--color-success)]/25 bg-[color:var(--color-success)]/[0.06] p-3 space-y-1.5">
          <div className="flex items-center gap-1.5 text-3xs font-semibold uppercase tracking-wider text-[color:var(--color-success)]">
            <TrendingUp className="h-3 w-3" /> Wins
          </div>
          {winners.length === 0 ? (
            <div className="text-2xs italic text-muted-foreground">
              No metrics up &gt;5% vs prior.
            </div>
          ) : (
            <div className="space-y-1">
              {winners.map((w) => (
                <DigestRow key={w.label} item={w} positive />
              ))}
            </div>
          )}
        </div>
        <div className="rounded-xl border border-destructive/25 bg-destructive/[0.06] p-3 space-y-1.5">
          <div className="flex items-center gap-1.5 text-3xs font-semibold uppercase tracking-wider text-destructive">
            <TrendingDown className="h-3 w-3" /> Pressure
          </div>
          {losers.length === 0 ? (
            <div className="text-2xs italic text-muted-foreground">
              Nothing falling &gt;5% vs prior.
            </div>
          ) : (
            <div className="space-y-1">
              {losers.map((w) => (
                <DigestRow key={w.label} item={w} positive={false} />
              ))}
            </div>
          )}
        </div>
      </div>
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
function CashHero({
  curr,
  prev,
  series,
  pace,
}: {
  curr?: number;
  prev?: number;
  series: { d: string; cash: number }[];
  pace?: PaceStats;
}) {
  const animated = useCountUp(curr ?? 0, 700);
  const hasDelta = curr !== undefined && prev !== undefined;
  const delta =
    hasDelta && prev! > 0 ? ((curr! - prev!) / prev!) * 100 : hasDelta && curr! > 0 ? 100 : 0;
  const up = delta > 0.5;
  const down = delta < -0.5;
  const DeltaIcon = up ? TrendingUp : down ? TrendingDown : Minus;

  return (
    <div className="hover-lift group relative flex h-full flex-col justify-between overflow-hidden rounded-2xl border border-border bg-card p-5">
      <div className="pointer-events-none absolute inset-0 opacity-40 transition-opacity group-hover:opacity-55">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="cashHeroGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--spectrum-hot)" stopOpacity={0.55} />
                <stop offset="100%" stopColor="var(--spectrum-hot)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="cash"
              stroke="var(--spectrum-hot)"
              strokeWidth={1.5}
              fill="url(#cashHeroGrad)"
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="glass-highlight pointer-events-none absolute inset-0 rounded-2xl" />

      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-3xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Cash Collected
          </div>
          <div className="display-serif mt-1 text-5xl font-bold tabular-nums text-spectrum-hot md:text-6xl">
            {money(animated)}
          </div>
        </div>
        {hasDelta && (
          <span
            className={cn(
              "badge-glass shrink-0 font-mono normal-case tracking-normal",
              up && "text-[color:var(--color-success)]",
              down && "text-destructive",
              !up && !down && "text-muted-foreground",
            )}
          >
            <DeltaIcon className="h-2.5 w-2.5" />
            {Math.abs(delta).toFixed(0)}%
          </span>
        )}
      </div>

      <div className="relative flex items-end justify-between gap-3 text-2xs">
        <div className="text-muted-foreground">
          vs prior period · {prev !== undefined ? money(prev) : "—"}
        </div>
        {pace && (
          <div className="font-mono text-muted-foreground">
            Pace <span className="font-semibold text-foreground">{money(pace.dailyPace)}</span>/day
          </div>
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
    <div className="flex h-full flex-col gap-4 rounded-2xl border border-border bg-gradient-to-b from-spectrum-mid/10 via-card to-card p-4">
      <div className="flex items-center gap-2">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-spectrum-mid/15 text-spectrum-mid">
          <Target className="h-4 w-4" />
        </div>
        <div className="text-3xs font-semibold uppercase tracking-wider text-muted-foreground">
          Month-end pace
        </div>
      </div>

      <div className="flex flex-1 flex-col justify-center gap-3">
        <div>
          <div className="font-mono text-3xl font-bold tabular-nums text-spectrum-mid">
            {money(pace.projection)}
          </div>
          <div className="mt-0.5 text-2xs text-muted-foreground">Projected close</div>
        </div>
        {/* Same monthCash/dailyPace values as before, just grouped into a real
            content block instead of two loose lines — fills the tall cell's
            middle instead of leaving it as dead space. */}
        <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted/20 p-2.5">
          <div>
            <div className="font-mono text-sm font-semibold">{money(pace.monthCash)}</div>
            <div className="text-3xs text-muted-foreground">Collected so far</div>
          </div>
          <div>
            <div className="font-mono text-sm font-semibold">{money(pace.dailyPace)}</div>
            <div className="text-3xs text-muted-foreground">Per day</div>
          </div>
        </div>
      </div>

      <div>
        <div className="mb-1 flex justify-between text-3xs uppercase tracking-wider text-muted-foreground">
          <span>
            Day {pace.dayOfMonth}/{pace.daysInMonth}
          </span>
          <span>
            {remaining} left · {progress.toFixed(0)}%
          </span>
        </div>
        <div className="h-1.5 rounded bg-muted overflow-hidden">
          <div className="h-full rounded bg-spectrum-mid" style={{ width: `${progress}%` }} />
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
        <div className="text-xs font-semibold uppercase tracking-wider">
          Content → Cash attribution
        </div>
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
        <div className="divide-y divide-border">
          {items.map((it, i) => {
            const maxCash = items[0].cash || 1;
            const w = Math.max(4, Math.round((it.cash / maxCash) * 100));
            return (
              <div key={it.id} className="px-4 py-2.5">
                <div className="flex items-center gap-3">
                  <div className="grid h-7 w-7 place-items-center rounded-md bg-muted text-2xs font-mono font-bold">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{it.title}</div>
                    <div className="text-2xs text-muted-foreground">
                      {it.platform} · {fmt(it.views)} views · {it.leads} leads · {it.closes} closes
                    </div>
                  </div>
                  <div className="text-sm font-mono font-semibold text-[color:var(--color-success)]">
                    {money(it.cash)}
                  </div>
                </div>
                <div className="h-1.5 rounded bg-muted/30 overflow-hidden mt-1.5">
                  <div
                    className="h-full rounded bg-[color:var(--color-success)]"
                    style={{ width: `${w}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
