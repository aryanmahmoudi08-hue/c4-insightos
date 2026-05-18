import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-auth";
import { TopBar } from "@/components/app-sidebar";
import { KpiTile, DashboardBar } from "@/components/kpi-tile";
import { DateRangePicker, RANGES, type DateRange } from "@/components/date-range-picker";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Sparkles } from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell,
} from "recharts";

export const Route = createFileRoute("/_authenticated/dashboard")({ component: Dashboard });

const fmt = (n: number) => new Intl.NumberFormat("en-US").format(Math.round(n));
const money = (c: number) => "$" + new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(c / 100));
const pct = (n: number, d: number) => d > 0 ? `${((n / d) * 100).toFixed(1)}%` : "0.0%";

function Dashboard() {
  const { data: org } = useCurrentOrg();
  const orgId = org?.org_id;
  const [range, setRange] = useState<DateRange>(RANGES.last30());

  const { data: stats, isLoading } = useQuery({
    queryKey: ["exec-dash", orgId, range.from, range.to],
    enabled: !!orgId,
    queryFn: async () => {
      const fromISO = `${range.from}T00:00:00`;
      const toISO = `${range.to}T23:59:59`;
      const [pays, leads, calls, content, setterAct, alerts, insights] = await Promise.all([
        supabase.from("payments").select("amount_cents, collected_at").eq("org_id", orgId!).gte("collected_at", fromISO).lte("collected_at", toISO),
        supabase.from("leads").select("id, status, created_at, traffic_source_id").eq("org_id", orgId!).gte("created_at", fromISO).lte("created_at", toISO),
        supabase.from("calls").select("showed, closed, offer_made, contract_value_cents, cash_collected_cents, closer_name, scheduled_for, created_at").eq("org_id", orgId!).gte("created_at", fromISO).lte("created_at", toISO),
        supabase.from("content_metrics").select("views, leads_generated, calls_booked, closes, cash_collected_cents, captured_at, content_id").eq("org_id", orgId!).gte("captured_at", fromISO).lte("captured_at", toISO),
        supabase.from("setter_activity").select("team_member_name, role, sets, closes, cash_collected_cents, activity_date").eq("org_id", orgId!).gte("activity_date", range.from).lte("activity_date", range.to),
        supabase.from("alerts").select("id, severity, title, created_at, acknowledged").eq("org_id", orgId!).eq("acknowledged", false).order("created_at", { ascending: false }).limit(6),
        supabase.from("ai_insights").select("id, title, body, module, confidence, created_at").eq("org_id", orgId!).eq("dismissed", false).order("created_at", { ascending: false }).limit(4),
      ]);

      const payList = pays.data ?? [];
      const leadList = leads.data ?? [];
      const callList = calls.data ?? [];
      const contentList = content.data ?? [];
      const actList = setterAct.data ?? [];

      const cash = payList.reduce((s, p) => s + (p.amount_cents ?? 0), 0);
      const newLeads = leadList.length;
      const totalCalls = callList.length;
      const showed = callList.filter(c => c.showed).length;
      const offers = callList.filter(c => c.offer_made).length;
      const closed = callList.filter(c => c.closed).length;
      const contractValue = callList.reduce((s, c) => s + (c.contract_value_cents ?? 0), 0);
      const views = contentList.reduce((s, m) => s + (m.views ?? 0), 0);
      const contentLeads = contentList.reduce((s, m) => s + (m.leads_generated ?? 0), 0);
      const contentBooked = contentList.reduce((s, m) => s + (m.calls_booked ?? 0), 0);
      const cashPer1k = views ? Math.round(cash / (views / 1000)) : 0;
      const leadsPer1k = views ? +(contentLeads / (views / 1000)).toFixed(2) : 0;
      const setsTotal = actList.reduce((s, a) => s + (a.sets ?? 0), 0);

      // Daily cash + leads series
      const daysCount = Math.min(60, Math.max(1, Math.round((new Date(range.to).getTime() - new Date(range.from).getTime()) / 86400e3) + 1));
      const series: { d: string; cash: number; leads: number }[] = [];
      const fromTime = new Date(range.from).getTime();
      for (let i = 0; i < daysCount; i++) {
        const dt = new Date(fromTime + i * 86400e3);
        series.push({ d: dt.toISOString().slice(5, 10), cash: 0, leads: 0 });
      }
      const idx = (iso?: string | null) => {
        if (!iso) return -1;
        const k = iso.slice(5, 10);
        return series.findIndex(s => s.d === k);
      };
      for (const p of payList) { const i = idx(p.collected_at); if (i >= 0) series[i].cash += p.amount_cents ?? 0; }
      for (const l of leadList) { const i = idx(l.created_at); if (i >= 0) series[i].leads += 1; }

      // Closer leaderboard (from calls.closer_name + setter_activity if dialer/closer)
      const closerMap = new Map<string, { name: string; calls: number; closes: number; cash: number }>();
      for (const c of callList) {
        const name = c.closer_name ?? "Unassigned";
        const r = closerMap.get(name) ?? { name, calls: 0, closes: 0, cash: 0 };
        r.calls += 1;
        if (c.closed) r.closes += 1;
        r.cash += c.cash_collected_cents ?? 0;
        closerMap.set(name, r);
      }
      const closers = Array.from(closerMap.values()).sort((a, b) => b.cash - a.cash).slice(0, 5);

      // Setter leaderboard
      const setterMap = new Map<string, { name: string; sets: number; closes: number; cash: number }>();
      for (const a of actList) {
        const r = setterMap.get(a.team_member_name) ?? { name: a.team_member_name, sets: 0, closes: 0, cash: 0 };
        r.sets += a.sets ?? 0;
        r.closes += a.closes ?? 0;
        r.cash += a.cash_collected_cents ?? 0;
        setterMap.set(a.team_member_name, r);
      }
      const setters = Array.from(setterMap.values()).sort((a, b) => b.sets - a.sets).slice(0, 5);

      // Funnel
      const funnel = [
        { stage: "Views", value: views },
        { stage: "Leads", value: newLeads },
        { stage: "Booked", value: totalCalls },
        { stage: "Showed", value: showed },
        { stage: "Offers", value: offers },
        { stage: "Closed", value: closed },
      ];

      return {
        cash, newLeads, totalCalls, showed, offers, closed, contractValue,
        views, contentLeads, contentBooked, cashPer1k, leadsPer1k, setsTotal,
        series, closers, setters, funnel,
        alerts: alerts.data ?? [], insights: insights.data ?? [],
      };
    },
  });

  const showRate = pct(stats?.showed ?? 0, stats?.totalCalls ?? 0);
  const closeRate = pct(stats?.closed ?? 0, stats?.showed ?? 0);
  const offerRate = pct(stats?.offers ?? 0, stats?.showed ?? 0);

  return (
    <>
      <TopBar title="Executive Command Center" subtitle="Real-time KPIs across content, attribution, and sales" />
      <div className="p-6 space-y-4">
        <DashboardBar title="EXECUTIVE COMMAND CENTER" accent="primary" />

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <DateRangePicker value={range} onChange={setRange} />
          <div className="text-xs text-muted-foreground font-mono">{isLoading ? "syncing…" : `${range.from} → ${range.to}`}</div>
        </div>

        {/* Hero KPI grid */}
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
          <KpiTile label="CASH COLLECTED" value={money(stats?.cash ?? 0)} tone="money" />
          <KpiTile label="CONTRACT VALUE" value={money(stats?.contractValue ?? 0)} tone="money" />
          <KpiTile label="CASH / 1K VIEWS" value={money(stats?.cashPer1k ?? 0)} tone="money" />
          <KpiTile label="NEW LEADS" value={fmt(stats?.newLeads ?? 0)} />
          <KpiTile label="LEADS / 1K VIEWS" value={(stats?.leadsPer1k ?? 0).toFixed(2)} />
          <KpiTile label="TOTAL VIEWS" value={fmt(stats?.views ?? 0)} />
          <KpiTile label="CALLS BOOKED" value={fmt(stats?.totalCalls ?? 0)} />
          <KpiTile label="SHOWED" value={fmt(stats?.showed ?? 0)} hint={showRate} />
          <KpiTile label="OFFERS MADE" value={fmt(stats?.offers ?? 0)} hint={offerRate} />
          <KpiTile label="CLOSES" value={fmt(stats?.closed ?? 0)} />
          <KpiTile label="SHOW RATE" value={showRate} tone="rate" />
          <KpiTile label="CLOSE RATE" value={closeRate} tone="rate" />
        </div>

        {/* Charts row */}
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-lg border border-border bg-card p-4 lg:col-span-2">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold">Daily cash collected</div>
                <div className="text-xs text-muted-foreground">{range.from} → {range.to}</div>
              </div>
              <div className="text-xs font-mono text-muted-foreground">{money(stats?.cash ?? 0)} total</div>
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
              <div className="text-sm font-semibold">Funnel snapshot</div>
              <div className="text-xs text-muted-foreground">Views → Closed</div>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats?.funnel ?? []} layout="vertical" margin={{ left: 8, right: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.28 0.02 265 / 0.5)" horizontal={false} />
                  <XAxis type="number" stroke="oklch(0.65 0.02 260)" fontSize={10} tickFormatter={(v) => fmt(v)} />
                  <YAxis type="category" dataKey="stage" stroke="oklch(0.65 0.02 260)" fontSize={11} width={60} />
                  <Tooltip contentStyle={{ background: "oklch(0.18 0.015 265)", border: "1px solid oklch(0.28 0.02 265)", borderRadius: 8, fontSize: 12 }} formatter={(v: number) => fmt(v)} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {(stats?.funnel ?? []).map((_, i) => (
                      <Cell key={i} fill={`oklch(${0.72 - i * 0.05} ${0.18 - i * 0.02} ${258 + i * 6})`} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

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
