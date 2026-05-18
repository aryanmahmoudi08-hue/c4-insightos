import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-auth";
import { TopBar } from "@/components/app-sidebar";
import { StatCard } from "@/components/stat-card";
import { DollarSign, PhoneCall, Users, Video, TrendingUp, Target } from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";

export const Route = createFileRoute("/_authenticated/dashboard")({ component: Dashboard });

function fmt(n: number) { return new Intl.NumberFormat("en-US").format(n); }
function money(c: number) { return "$" + new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(c / 100); }

function Dashboard() {
  const { data: org } = useCurrentOrg();
  const orgId = org?.org_id;

  const { data: stats } = useQuery({
    queryKey: ["dash", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * 86400e3).toISOString();
      const [pays, leads, calls, content] = await Promise.all([
        supabase.from("payments").select("amount_cents, collected_at").eq("org_id", orgId!).gte("collected_at", since),
        supabase.from("leads").select("id, status, created_at").eq("org_id", orgId!).gte("created_at", since),
        supabase.from("calls").select("showed, closed, contract_value_cents, scheduled_for").eq("org_id", orgId!).gte("scheduled_for", since),
        supabase.from("content_metrics").select("views, leads_generated, closes, cash_collected_cents, captured_at").eq("org_id", orgId!).gte("captured_at", since),
      ]);
      const cash = (pays.data ?? []).reduce((s, p) => s + (p.amount_cents ?? 0), 0);
      const newLeads = leads.data?.length ?? 0;
      const showed = (calls.data ?? []).filter(c => c.showed).length;
      const total = calls.data?.length ?? 0;
      const closed = (calls.data ?? []).filter(c => c.closed).length;
      const views = (content.data ?? []).reduce((s, m) => s + (m.views ?? 0), 0);
      const ctxLeads = (content.data ?? []).reduce((s, m) => s + (m.leads_generated ?? 0), 0);
      const cashPer1k = views ? Math.round(cash / (views / 1000)) : 0;
      const showRate = total ? Math.round((showed / total) * 100) : 0;
      const closeRate = showed ? Math.round((closed / showed) * 100) : 0;
      const series = buildSeries(pays.data ?? []);
      return { cash, newLeads, showRate, closeRate, views, ctxLeads, cashPer1k, series, totalCalls: total };
    },
  });

  return (
    <>
      <TopBar title="Executive Dashboard" subtitle="Last 30 days · all systems" />
      <div className="p-6 space-y-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <StatCard label="Cash Collected" value={money(stats?.cash ?? 0)} icon={<DollarSign className="h-4 w-4" />} accent="success" />
          <StatCard label="Cash / 1k Views" value={money(stats?.cashPer1k ?? 0)} icon={<TrendingUp className="h-4 w-4" />} accent="primary" />
          <StatCard label="New Leads" value={fmt(stats?.newLeads ?? 0)} icon={<Users className="h-4 w-4" />} accent="accent" />
          <StatCard label="Calls Booked" value={fmt(stats?.totalCalls ?? 0)} icon={<PhoneCall className="h-4 w-4" />} />
          <StatCard label="Show Rate" value={(stats?.showRate ?? 0) + "%"} icon={<Target className="h-4 w-4" />} accent={(stats?.showRate ?? 0) < 70 ? "warning" : "success"} />
          <StatCard label="Close Rate" value={(stats?.closeRate ?? 0) + "%"} icon={<Video className="h-4 w-4" />} accent="primary" />
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold">Daily cash collected</div>
              <div className="text-xs text-muted-foreground">Trailing 30 days</div>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats?.series ?? []}>
                <defs>
                  <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.66 0.18 258)" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="oklch(0.66 0.18 258)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.28 0.02 265 / 0.6)" />
                <XAxis dataKey="d" stroke="oklch(0.65 0.02 260)" fontSize={11} />
                <YAxis stroke="oklch(0.65 0.02 260)" fontSize={11} tickFormatter={(v) => "$" + Math.round(v/100)} />
                <Tooltip contentStyle={{ background: "oklch(0.18 0.015 265)", border: "1px solid oklch(0.28 0.02 265)", borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number) => money(v)} />
                <Area type="monotone" dataKey="cents" stroke="oklch(0.66 0.18 258)" fill="url(#g1)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="text-sm font-semibold mb-1">Attribution snapshot</div>
            <p className="text-xs text-muted-foreground">Content piece → lead → call → cash. Wire ingestion in <span className="text-foreground">Connectors</span> to populate the Sankey.</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="text-sm font-semibold mb-1">AI insights</div>
            <p className="text-xs text-muted-foreground">Open the <span className="text-foreground">AI Insights</span> module to run the rule engine + Gemini grounded analysis.</p>
          </div>
        </div>
      </div>
    </>
  );
}

function buildSeries(pays: Array<{ amount_cents: number | null; collected_at: string }>) {
  const days: Record<string, number> = {};
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400e3);
    days[d.toISOString().slice(5, 10)] = 0;
  }
  for (const p of pays) {
    const k = p.collected_at.slice(5, 10);
    if (k in days) days[k] += p.amount_cents ?? 0;
  }
  return Object.entries(days).map(([d, cents]) => ({ d, cents }));
}
