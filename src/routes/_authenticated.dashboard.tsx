import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-auth";
import { TopBar } from "@/components/app-sidebar";
import { useDateRange } from "@/hooks/use-date-range";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Sparkles, TrendingUp, TrendingDown, Minus, Target, Activity, Calendar, Inbox } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { Sparkline } from "@/components/sparkline";
import { SlimHeader } from "@/components/slim-header";
import { EmptyState } from "@/components/empty-state";


export const Route = createFileRoute("/_authenticated/dashboard")({ component: Dashboard });

const fmt = (n: number) => new Intl.NumberFormat("en-US").format(Math.round(n));
const money = (c: number) => "$" + new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(c / 100));
const pct = (n: number, d: number) => d > 0 ? `${((n / d) * 100).toFixed(1)}%` : "0.0%";

async function fetchPeriod(orgId: string, from: string, to: string) {
  const fromISO = `${from}T00:00:00`;
  const toISO = `${to}T23:59:59`;
  const [pays, leads, calls, content, setters] = await Promise.all([
    supabase.from("payments").select("amount_cents, collected_at").eq("org_id", orgId).gte("collected_at", fromISO).lte("collected_at", toISO),
    supabase.from("leads").select("id, created_at").eq("org_id", orgId).gte("created_at", fromISO).lte("created_at", toISO),
    supabase.from("calls").select("showed, closed, offer_made, contract_value_cents, cash_collected_cents, created_at").eq("org_id", orgId).gte("created_at", fromISO).lte("created_at", toISO),
    supabase.from("content_metrics").select("views, leads_generated, captured_at").eq("org_id", orgId).gte("captured_at", fromISO).lte("captured_at", toISO),
    supabase.from("setter_activity").select("cash_collected_cents, total_revenue_cents, calls_on_calendar, live_calls, sets, closes, activity_date").eq("org_id", orgId).gte("activity_date", from).lte("activity_date", to),
  ]);
  const payList = pays.data ?? []; const leadList = leads.data ?? []; const callList = calls.data ?? []; const contentList = content.data ?? []; const setterList = setters.data ?? [];
  const paymentsCash = payList.reduce((s, p) => s + (p.amount_cents ?? 0), 0);
  const callsCash = callList.reduce((s, c) => s + (c.cash_collected_cents ?? 0), 0);
  const setterCash = setterList.reduce((s, a) => s + (a.cash_collected_cents ?? 0), 0);
  // Unified cash = max of (payments) vs (sales-team self-reported). Avoids double counting
  // when both sources record the same dollars; surfaces sales data when payments aren't wired.
  const reportedCash = callsCash + setterCash;
  // Funnel: take max of (per-call rows) vs (sales-team day logs) so the tiles populate
  // regardless of whether the data lands in calls/* or setter_activity/*.
  const callsBooked = callList.length;
  const callsShowed = callList.filter(c => c.showed).length;
  const callsOffers = callList.filter(c => c.offer_made).length;
  const callsClosed = callList.filter(c => c.closed).length;
  const setterBooked = setterList.reduce((s, a) => s + (a.calls_on_calendar ?? a.sets ?? 0), 0);
  const setterShowed = setterList.reduce((s, a) => s + (a.live_calls ?? 0), 0);
  const setterClosed = setterList.reduce((s, a) => s + (a.closes ?? 0), 0);
  return {
    cash: Math.max(paymentsCash, reportedCash),
    paymentsCash, callsCash, setterCash,
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
  const { range } = useDateRange();

  const { data: stats, isLoading } = useQuery({
    queryKey: ["exec-dash", orgId, range.from, range.to],
    enabled: !!orgId,
    queryFn: async () => {
      const fromISO = `${range.from}T00:00:00`;
      const toISO = `${range.to}T23:59:59`;

      // Previous period of same length for WoW deltas
      const days = Math.max(1, Math.round((new Date(range.to).getTime() - new Date(range.from).getTime()) / 86400e3) + 1);
      const prevTo = new Date(new Date(range.from).getTime() - 86400e3).toISOString().slice(0, 10);
      const prevFrom = new Date(new Date(range.from).getTime() - days * 86400e3).toISOString().slice(0, 10);

      // Current month pace data
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const daysInMonth = monthEnd.getDate();
      const dayOfMonth = now.getDate();

      const [
        curr, prev, monthPays, monthCalls, monthSetters,
        setterAct, alerts, insights,
        contentAttribution,
      ] = await Promise.all([
        fetchPeriod(orgId!, range.from, range.to),
        fetchPeriod(orgId!, prevFrom, prevTo),
        supabase.from("payments").select("amount_cents").eq("org_id", orgId!).gte("collected_at", `${monthStart}T00:00:00`),
        supabase.from("calls").select("cash_collected_cents").eq("org_id", orgId!).gte("created_at", `${monthStart}T00:00:00`),
        supabase.from("setter_activity").select("cash_collected_cents").eq("org_id", orgId!).gte("activity_date", monthStart),
        supabase.from("setter_activity").select("team_member_name, role, sets, closes, cash_collected_cents").eq("org_id", orgId!).gte("activity_date", range.from).lte("activity_date", range.to),
        supabase.from("alerts").select("id, severity, title, created_at").eq("org_id", orgId!).eq("acknowledged", false).order("created_at", { ascending: false }).limit(6),
        supabase.from("ai_insights").select("id, title, body, module, confidence, created_at").eq("org_id", orgId!).eq("dismissed", false).order("created_at", { ascending: false }).limit(4),
        // Content-to-cash: top pieces by attributed cash in range
        supabase.from("content_metrics")
          .select("content_id, cash_collected_cents, leads_generated, closes, views, content_pieces!inner(title, platform)")
          .eq("org_id", orgId!).gte("captured_at", fromISO).lte("captured_at", toISO)
          .order("cash_collected_cents", { ascending: false, nullsFirst: false })
          .limit(5),
      ]);

      // Closer leaderboard from calls
      const callsForLeaders = await supabase.from("calls").select("closer_name, closed, cash_collected_cents").eq("org_id", orgId!).gte("created_at", fromISO).lte("created_at", toISO);
      const callList = callsForLeaders.data ?? [];
      const closerMap = new Map<string, { name: string; calls: number; closes: number; cash: number }>();
      for (const c of callList) {
        const name = c.closer_name ?? "Unassigned";
        const r = closerMap.get(name) ?? { name, calls: 0, closes: 0, cash: 0 };
        r.calls += 1; if (c.closed) r.closes += 1; r.cash += c.cash_collected_cents ?? 0;
        closerMap.set(name, r);
      }
      const closers = Array.from(closerMap.values()).sort((a, b) => b.cash - a.cash).slice(0, 5);

      const setterMap = new Map<string, { name: string; sets: number; closes: number; cash: number }>();
      for (const a of setterAct.data ?? []) {
        const r = setterMap.get(a.team_member_name) ?? { name: a.team_member_name, sets: 0, closes: 0, cash: 0 };
        r.sets += a.sets ?? 0; r.closes += a.closes ?? 0; r.cash += a.cash_collected_cents ?? 0;
        setterMap.set(a.team_member_name, r);
      }
      const setters = Array.from(setterMap.values()).sort((a, b) => b.sets - a.sets).slice(0, 5);

      // Daily series
      const seriesDays = Math.min(60, days);
      const series: { d: string; cash: number; leads: number }[] = [];
      const fromTime = new Date(range.from).getTime();
      for (let i = 0; i < seriesDays; i++) {
        const dt = new Date(fromTime + i * 86400e3);
        series.push({ d: dt.toISOString().slice(5, 10), cash: 0, leads: 0 });
      }
      const [seriesPays, seriesLeads, seriesCalls, seriesSetters] = await Promise.all([
        supabase.from("payments").select("amount_cents, collected_at").eq("org_id", orgId!).gte("collected_at", fromISO).lte("collected_at", toISO),
        supabase.from("leads").select("created_at").eq("org_id", orgId!).gte("created_at", fromISO).lte("created_at", toISO),
        supabase.from("calls").select("cash_collected_cents, created_at").eq("org_id", orgId!).gte("created_at", fromISO).lte("created_at", toISO),
        supabase.from("setter_activity").select("cash_collected_cents, activity_date").eq("org_id", orgId!).gte("activity_date", range.from).lte("activity_date", range.to),
      ]);
      const idx = (iso?: string | null) => { if (!iso) return -1; const k = iso.slice(5, 10); return series.findIndex(s => s.d === k); };
      // Per-day: prefer max of payments vs (calls + setter) to avoid double-counting same dollars
      const payByDay = new Map<number, number>();
      const reportedByDay = new Map<number, number>();
      for (const p of seriesPays.data ?? []) { const i = idx(p.collected_at); if (i >= 0) payByDay.set(i, (payByDay.get(i) ?? 0) + (p.amount_cents ?? 0)); }
      for (const c of seriesCalls.data ?? []) { const i = idx(c.created_at); if (i >= 0) reportedByDay.set(i, (reportedByDay.get(i) ?? 0) + (c.cash_collected_cents ?? 0)); }
      for (const a of seriesSetters.data ?? []) { const i = idx(a.activity_date); if (i >= 0) reportedByDay.set(i, (reportedByDay.get(i) ?? 0) + (a.cash_collected_cents ?? 0)); }
      for (let i = 0; i < series.length; i++) series[i].cash = Math.max(payByDay.get(i) ?? 0, reportedByDay.get(i) ?? 0);
      for (const l of seriesLeads.data ?? []) { const i = idx(l.created_at); if (i >= 0) series[i].leads += 1; }

      // Funnel with conversion percentages
      const funnel = [
        { stage: "Views", value: curr.views, conv: null as string | null },
        { stage: "Leads", value: curr.newLeads, conv: curr.views ? pct(curr.newLeads, curr.views) : null },
        { stage: "Booked", value: curr.totalCalls, conv: curr.newLeads ? pct(curr.totalCalls, curr.newLeads) : null },
        { stage: "Showed", value: curr.showed, conv: curr.totalCalls ? pct(curr.showed, curr.totalCalls) : null },
        { stage: "Offers", value: curr.offers, conv: curr.showed ? pct(curr.offers, curr.showed) : null },
        { stage: "Closed", value: curr.closed, conv: curr.offers ? pct(curr.closed, curr.offers) : null },
      ];

      // Pace predictor
      const monthPaymentsCash = (monthPays.data ?? []).reduce((s, p) => s + (p.amount_cents ?? 0), 0);
      const monthReportedCash = (monthCalls.data ?? []).reduce((s, c) => s + (c.cash_collected_cents ?? 0), 0)
        + (monthSetters.data ?? []).reduce((s, a) => s + (a.cash_collected_cents ?? 0), 0);
      const monthCash = Math.max(monthPaymentsCash, monthReportedCash);
      const dailyPace = dayOfMonth > 0 ? monthCash / dayOfMonth : 0;
      const projection = dailyPace * daysInMonth;

      return {
        curr, prev, series, closers, setters, funnel,
        alerts: alerts.data ?? [], insights: insights.data ?? [],
        contentAttribution: contentAttribution.data ?? [],
        pace: { monthCash, projection, dayOfMonth, daysInMonth, dailyPace },
      };
    },
  });

  const c = stats?.curr;
  const p = stats?.prev;
  const showRate = pct(c?.showed ?? 0, c?.totalCalls ?? 0);
  const closeRate = pct(c?.closed ?? 0, c?.showed ?? 0);
  const offerRate = pct(c?.offers ?? 0, c?.showed ?? 0);

  return (
    <>
      <TopBar title="Executive Command Center" subtitle="Real-time KPIs across content, attribution, and sales" showDateRange />
      <div className="p-4 md:p-6 space-y-4">
        <DashboardBar title="EXECUTIVE COMMAND CENTER" accent="primary" />

        <div className="flex items-center justify-end gap-3 flex-wrap">
          <div className="text-xs text-muted-foreground font-mono">{isLoading ? "syncing…" : `${range.from} → ${range.to} · vs prior ${Math.max(1, Math.round((new Date(range.to).getTime() - new Date(range.from).getTime()) / 86400e3) + 1)}d`}</div>
        </div>


        {/* Pace predictor */}
        <PaceCard pace={stats?.pace} />

        {/* Hero KPI grid with WoW deltas */}
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
          <DeltaKpi label="CASH COLLECTED" value={money(c?.cash ?? 0)} curr={c?.cash ?? 0} prev={p?.cash ?? 0} tone="money" />
          <DeltaKpi label="CONTRACT VALUE" value={money(c?.contractValue ?? 0)} curr={c?.contractValue ?? 0} prev={p?.contractValue ?? 0} tone="money" />
          <DeltaKpi label="NEW LEADS" value={fmt(c?.newLeads ?? 0)} curr={c?.newLeads ?? 0} prev={p?.newLeads ?? 0} />
          <DeltaKpi label="TOTAL VIEWS" value={fmt(c?.views ?? 0)} curr={c?.views ?? 0} prev={p?.views ?? 0} />
          <DeltaKpi label="CALLS BOOKED" value={fmt(c?.totalCalls ?? 0)} curr={c?.totalCalls ?? 0} prev={p?.totalCalls ?? 0} />
          <DeltaKpi label="SHOWED" value={fmt(c?.showed ?? 0)} curr={c?.showed ?? 0} prev={p?.showed ?? 0} hint={showRate} />
          <DeltaKpi label="OFFERS MADE" value={fmt(c?.offers ?? 0)} curr={c?.offers ?? 0} prev={p?.offers ?? 0} hint={offerRate} />
          <DeltaKpi label="CLOSES" value={fmt(c?.closed ?? 0)} curr={c?.closed ?? 0} prev={p?.closed ?? 0} hint={closeRate} tone="rate" />
        </div>

        {/* Charts row */}
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-lg border border-border bg-card p-4 lg:col-span-2">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold">Daily cash collected</div>
                <div className="text-xs text-muted-foreground">{range.from} → {range.to}</div>
              </div>
              <div className="text-xs font-mono text-muted-foreground">{money(c?.cash ?? 0)} total</div>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats?.series ?? []}>
                  <defs>
                    <linearGradient id="cashGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="oklch(0.66 0.18 258)" stopOpacity={0.6} />
                      <stop offset="100%" stopColor="oklch(0.66 0.18 258)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.28 0.02 265 / 0.5)" />
                  <XAxis dataKey="d" stroke="oklch(0.65 0.02 260)" fontSize={10} />
                  <YAxis stroke="oklch(0.65 0.02 260)" fontSize={10} tickFormatter={(v) => "$" + Math.round(v / 100)} />
                  <Tooltip contentStyle={{ background: "oklch(0.18 0.015 265)", border: "1px solid oklch(0.28 0.02 265)", borderRadius: 8, fontSize: 12 }}
                    formatter={(v: number) => money(v)} />
                  <Area type="monotone" dataKey="cash" stroke="oklch(0.66 0.18 258)" fill="url(#cashGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <div className="mb-3">
              <div className="text-sm font-semibold">Funnel · stage conversion</div>
              <div className="text-xs text-muted-foreground">% = conversion from previous stage</div>
            </div>
            <div className="space-y-1.5">
              {(stats?.funnel ?? []).map((f, i) => {
                const max = stats?.funnel[0]?.value ?? 1;
                const width = Math.max(4, Math.round((f.value / Math.max(1, max)) * 100));
                return (
                  <div key={f.stage} className="space-y-0.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-medium">{f.stage}</span>
                      <span className="font-mono text-muted-foreground">{fmt(f.value)} {f.conv && <span className="text-accent ml-1">{f.conv}</span>}</span>
                    </div>
                    <div className="h-6 rounded bg-muted/30 overflow-hidden">
                      <div className="h-full rounded" style={{ width: `${width}%`, background: `oklch(${0.72 - i * 0.05} ${0.18 - i * 0.02} ${258 + i * 6})` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Content-to-cash attribution strip */}
        <ContentToCashStrip rows={stats?.contentAttribution ?? []} />

        {/* Leaderboards */}
        <div className="grid gap-4 lg:grid-cols-2">
          <Leaderboard title="Top closers · by cash" rows={(stats?.closers ?? []).map(c => ({
            name: c.name, primary: money(c.cash), secondary: `${c.closes}/${c.calls} closed`,
          }))} accent="success" />
          <Leaderboard title="Top setters · by sets" rows={(stats?.setters ?? []).map(s => ({
            name: s.name, primary: fmt(s.sets) + " sets", secondary: `${s.closes} closes · ${money(s.cash)}`,
          }))} accent="primary" />
        </div>

        {/* Alerts + Insights */}
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/30">
              <div className="text-xs font-semibold uppercase tracking-wider">Open alerts</div>
              <Link to="/insights" className="text-xs text-primary hover:underline flex items-center gap-1">view all <ArrowUpRight className="h-3 w-3" /></Link>
            </div>
            <div className="divide-y divide-border">
              {(stats?.alerts ?? []).map(a => (
                <div key={a.id} className="px-4 py-2.5 flex items-start gap-3">
                  <span className={`mt-1 h-2 w-2 rounded-full ${a.severity === "critical" ? "bg-destructive" : a.severity === "warning" ? "bg-[color:var(--color-warning)]" : "bg-primary"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{a.title}</div>
                    <div className="text-[11px] text-muted-foreground">{new Date(a.created_at).toLocaleString()}</div>
                  </div>
                </div>
              ))}
              {(!stats?.alerts || stats.alerts.length === 0) && <div className="p-6 text-center text-xs text-muted-foreground">No open alerts. All systems nominal.</div>}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/30">
              <div className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5 text-accent" /> AI insights</div>
              <Link to="/insights" className="text-xs text-primary hover:underline flex items-center gap-1">open module <ArrowUpRight className="h-3 w-3" /></Link>
            </div>
            <div className="divide-y divide-border">
              {(stats?.insights ?? []).map(i => (
                <div key={i.id} className="px-4 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-medium truncate">{i.title}</div>
                    <span className="text-[10px] font-mono text-muted-foreground">{Math.round(Number(i.confidence) * 100)}%</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground line-clamp-2">{i.body}</div>
                  <div className="text-[10px] uppercase tracking-wider text-accent mt-1">{i.module}</div>
                </div>
              ))}
              {(!stats?.insights || stats.insights.length === 0) && <div className="p-6 text-center text-xs text-muted-foreground">No insights yet. Generate from the AI Insights module.</div>}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function DeltaKpi({ label, value, curr, prev, hint, tone = "default" }: { label: string; value: string; curr: number; prev: number; hint?: string; tone?: "default" | "money" | "rate" }) {
  const delta = prev > 0 ? ((curr - prev) / prev) * 100 : (curr > 0 ? 100 : 0);
  const Icon = delta > 1 ? TrendingUp : delta < -1 ? TrendingDown : Minus;
  const deltaTone = delta > 1 ? "text-[color:var(--color-success)]" : delta < -1 ? "text-destructive" : "text-muted-foreground";
  return (
    <div className="rounded-md border border-border bg-card overflow-hidden flex flex-col">
      <div className={cn(
        "px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-center border-b border-border",
        tone === "money" && "bg-[color:var(--color-success)]/10 text-[color:var(--color-success)]",
        tone === "rate" && "bg-accent/10 text-accent",
        tone === "default" && "bg-muted/40 text-muted-foreground",
      )}>{label}</div>
      <div className="flex-1 grid place-items-center px-3 py-3 min-h-[64px]">
        <div className="font-mono text-xl font-bold tabular-nums">{value}</div>
        <div className={`flex items-center gap-1 text-[10px] font-mono ${deltaTone} mt-0.5`}>
          <Icon className="h-3 w-3" />{Math.abs(delta).toFixed(0)}% vs prior
        </div>
        {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
      </div>
    </div>
  );
}

function PaceCard({ pace }: { pace?: { monthCash: number; projection: number; dayOfMonth: number; daysInMonth: number; dailyPace: number } }) {
  if (!pace) return null;
  const progress = Math.min(100, (pace.dayOfMonth / pace.daysInMonth) * 100);
  return (
    <div className="rounded-lg border border-border bg-gradient-to-r from-primary/10 via-card to-card p-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-md bg-primary/15 text-primary"><Target className="h-5 w-5" /></div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Month-end pace</div>
            <div className="text-2xl font-mono font-bold">{money(pace.projection)}</div>
            <div className="text-[11px] text-muted-foreground">projected · {money(pace.monthCash)} collected · {money(pace.dailyPace)} / day</div>
          </div>
        </div>
        <div className="flex-1 min-w-[200px] max-w-md">
          <div className="flex justify-between text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
            <span>Day {pace.dayOfMonth} of {pace.daysInMonth}</span>
            <span>{progress.toFixed(0)}% through month</span>
          </div>
          <div className="h-2 rounded bg-muted overflow-hidden">
            <div className="h-full rounded bg-primary" style={{ width: `${progress}%` }} />
          </div>
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
  content_pieces: { title: string | null; platform: string } | { title: string | null; platform: string }[];
};

function ContentToCashStrip({ rows }: { rows: ContentAttrRow[] }) {
  const items = rows
    .filter(r => (r.cash_collected_cents ?? 0) > 0 || (r.leads_generated ?? 0) > 0)
    .map(r => {
      const cp = Array.isArray(r.content_pieces) ? r.content_pieces[0] : r.content_pieces;
      return { id: r.content_id, title: cp?.title ?? "(untitled)", platform: cp?.platform ?? "", cash: r.cash_collected_cents ?? 0, leads: r.leads_generated ?? 0, closes: r.closes ?? 0, views: r.views ?? 0 };
    })
    .slice(0, 5);

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/30">
        <div className="text-xs font-semibold uppercase tracking-wider">Content → Cash attribution</div>
        <Link to="/content" className="text-xs text-primary hover:underline flex items-center gap-1">open module <ArrowUpRight className="h-3 w-3" /></Link>
      </div>
      {items.length === 0 ? (
        <div className="p-6 text-center text-xs text-muted-foreground">No attributed content cash in this range. Log content with cash_collected_cents to see top performers here.</div>
      ) : (
        <div className="divide-y divide-border">
          {items.map((it, i) => {
            const maxCash = items[0].cash || 1;
            const w = Math.max(4, Math.round((it.cash / maxCash) * 100));
            return (
              <div key={it.id} className="px-4 py-2.5">
                <div className="flex items-center gap-3">
                  <div className="grid h-7 w-7 place-items-center rounded-md bg-muted text-[11px] font-mono font-bold">{i + 1}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{it.title}</div>
                    <div className="text-[11px] text-muted-foreground">{it.platform} · {fmt(it.views)} views · {it.leads} leads · {it.closes} closes</div>
                  </div>
                  <div className="text-sm font-mono font-semibold text-[color:var(--color-success)]">{money(it.cash)}</div>
                </div>
                <div className="h-1.5 rounded bg-muted/30 overflow-hidden mt-1.5">
                  <div className="h-full rounded bg-[color:var(--color-success)]" style={{ width: `${w}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Leaderboard({ title, rows, accent }: { title: string; rows: { name: string; primary: string; secondary: string }[]; accent: "success" | "primary" }) {
  const color = accent === "success" ? "text-[color:var(--color-success)]" : "text-primary";
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border bg-muted/30 text-xs font-semibold uppercase tracking-wider">{title}</div>
      <div className="divide-y divide-border">
        {rows.map((r, i) => (
          <div key={r.name + i} className="flex items-center gap-3 px-4 py-2.5">
            <div className="grid h-7 w-7 place-items-center rounded-md bg-muted text-[11px] font-mono font-bold">{i + 1}</div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{r.name}</div>
              <div className="text-[11px] text-muted-foreground">{r.secondary}</div>
            </div>
            <div className={`text-sm font-mono font-semibold ${color}`}>{r.primary}</div>
          </div>
        ))}
        {rows.length === 0 && <div className="p-6 text-center text-xs text-muted-foreground">No data in this date range.</div>}
      </div>
    </div>
  );
}
