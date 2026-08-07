import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-auth";
import { TopBar } from "@/components/app-sidebar";
import { StatCard } from "@/components/stat-card";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, TrendingUp, Target, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";

export const Route = createFileRoute("/_authenticated/traffic")({ component: Traffic });

const fmtMoney = (cents: number) => `$${Math.round(cents / 100).toLocaleString()}`;

function Traffic() {
  const { data: org } = useCurrentOrg();
  const orgId = org?.org_id;
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: sources } = useQuery({
    queryKey: ["traffic-sources", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from("traffic_sources").select("id, name, category, is_active").eq("org_id", orgId!);
      if (error) throw error;
      return data;
    },
  });

  const { data: leads } = useQuery({
    queryKey: ["leads-by-source", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from("leads").select("id, traffic_source_id, status").eq("org_id", orgId!);
      if (error) throw error;
      return data;
    },
  });

  // Pull calls + clients to compute close rate, avg deal, and LTV per source
  const { data: calls } = useQuery({
    queryKey: ["traffic-calls", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase.from("calls").select("lead_id, closed, contract_value_cents, cash_collected_cents").eq("org_id", orgId!);
      return data ?? [];
    },
  });
  const { data: clients } = useQuery({
    queryKey: ["traffic-clients", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase.from("clients").select("lead_id, contract_value_cents").eq("org_id", orgId!);
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async (f: FormData) => {
      const { error } = await supabase.from("traffic_sources").insert({
        org_id: orgId!,
        name: String(f.get("name") || ""),
        category: String(f.get("category") || "organic"),
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Source added"); qc.invalidateQueries({ queryKey: ["traffic-sources"] }); setOpen(false); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const breakdown = useMemo(() => {
    const leadsBySource = new Map<string, string[]>(); // sourceId -> leadIds
    for (const l of leads ?? []) {
      if (!l.traffic_source_id) continue;
      const arr = leadsBySource.get(l.traffic_source_id) ?? [];
      arr.push(l.id);
      leadsBySource.set(l.traffic_source_id, arr);
    }
    const callsByLead = new Map<string, typeof calls>();
    for (const c of calls ?? []) {
      if (!c.lead_id) continue;
      const arr = callsByLead.get(c.lead_id) ?? [];
      arr.push(c);
      callsByLead.set(c.lead_id, arr);
    }
    const clientsByLead = new Map<string, number>();
    for (const cl of clients ?? []) {
      if (!cl.lead_id) continue;
      clientsByLead.set(cl.lead_id, (clientsByLead.get(cl.lead_id) ?? 0) + (cl.contract_value_cents ?? 0));
    }

    return (sources ?? []).map(s => {
      const leadIds = leadsBySource.get(s.id) ?? [];
      const matched = (leads ?? []).filter(l => l.traffic_source_id === s.id);
      const won = matched.filter(l => l.status === "closed").length;
      let totalDealCents = 0;
      let dealCount = 0;
      let ltvCents = 0;
      for (const lid of leadIds) {
        const cs = callsByLead.get(lid) ?? [];
        for (const c of cs) {
          if (c.closed) { totalDealCents += c.contract_value_cents ?? 0; dealCount += 1; }
        }
        ltvCents += clientsByLead.get(lid) ?? 0;
      }
      const closeRate = matched.length ? (won / matched.length) * 100 : 0;
      const avgDeal = dealCount ? totalDealCents / dealCount : 0;
      const revenuePerLead = matched.length ? (totalDealCents + ltvCents) / matched.length : 0;
      // Score: close rate (%) × avg deal ($, in thousands) — surfaces revenue-efficient channels
      const score = closeRate * (avgDeal / 100000);
      return {
        id: s.id,
        name: s.name,
        category: s.category,
        leads: matched.length,
        clients: won,
        closeRate: Number(closeRate.toFixed(1)),
        avgDeal: Math.round(avgDeal / 100),
        ltv: Math.round(ltvCents / 100),
        revenue: Math.round((totalDealCents + ltvCents) / 100),
        revenuePerLead: Math.round(revenuePerLead / 100),
        score: Number(score.toFixed(2)),
      };
    });
  }, [sources, leads, calls, clients]);

  const unattributed = (leads ?? []).filter(l => !l.traffic_source_id).length;
  const totalLeads = leads?.length ?? 0;
  const totalSources = sources?.length ?? 0;

  // Best source: highest score, requires at least 3 leads to avoid noise
  const bestSource = useMemo(() => {
    const eligible = breakdown.filter(b => b.leads >= 3);
    return eligible.sort((a, b) => b.score - a.score)[0] ?? null;
  }, [breakdown]);

  const ranked = useMemo(() => [...breakdown].sort((a, b) => b.revenuePerLead - a.revenuePerLead || b.revenue - a.revenue), [breakdown]);
  const totalRevenue = ranked.reduce((s, b) => s + b.revenue, 0);
  const attributedLeads = ranked.reduce((s, b) => s + b.leads, 0);
  const avgRevPerLead = attributedLeads ? Math.round(totalRevenue / attributedLeads) : 0;

  const verdict = (b: typeof ranked[number]) => {
    if (b.leads < 3) return { label: "Not enough data", tone: "border-border text-muted-foreground bg-muted/40" };
    if (b.revenuePerLead >= avgRevPerLead * 1.25) return { label: "Double down", tone: "border-[color:var(--color-success)]/40 text-[color:var(--color-success)] bg-[color:var(--color-success)]/10" };
    if (b.revenuePerLead >= avgRevPerLead * 0.6) return { label: "Keep steady", tone: "border-border text-foreground bg-muted/40" };
    if (b.leads >= 10 && b.clients === 0) return { label: "Cut or fix", tone: "border-destructive/40 text-destructive bg-destructive/10" };
    return { label: "Needs work", tone: "border-[color:var(--color-warning)]/40 text-[color:var(--color-warning)] bg-[color:var(--color-warning)]/10" };
  };

  return (
    <>
      <TopBar title="Traffic" subtitle="Where leads come from — and which channels actually turn into cash" />
      <div className="p-4 md:p-6 space-y-5">
        {/* Plain-language headline numbers */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Revenue from tracked channels" value={fmtMoney(totalRevenue * 100)} accent="success" icon={<TrendingUp className="h-4 w-4" />} />
          <StatCard label="Revenue per lead" value={`$${avgRevPerLead.toLocaleString()}`} accent="primary" hint="Across every tracked channel" />
          <StatCard label="Leads tracked" value={attributedLeads} hint={`${totalSources} channels`} />
          <StatCard label="Leads with no source" value={unattributed}
            accent={unattributed > totalLeads / 4 ? "warning" : "primary"}
            hint={totalLeads ? `${Math.round((unattributed / totalLeads) * 100)}% of all leads — tag these` : ""} />
        </div>

        {/* One-line read */}
        {bestSource ? (
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-start gap-3">
              <Target className="mt-0.5 h-5 w-5 shrink-0 text-[color:var(--color-success)]" />
              <div className="min-w-0 flex-1">
                <div className="mb-0.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <Sparkles className="h-3 w-3" /> What the data says
                </div>
                <p className="text-sm leading-relaxed">
                  <span className="font-semibold">{bestSource.name}</span> is your strongest channel: {bestSource.leads} leads turned into{" "}
                  {bestSource.clients} clients ({bestSource.closeRate}% close rate) at{" "}
                  <span className="font-mono">${bestSource.avgDeal.toLocaleString()}</span> per deal. Put more time and budget here first.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border bg-card/50 p-4 text-sm text-muted-foreground">
            Tag at least 3 leads to a channel and close one deal — then this box tells you exactly where to double down.
          </div>
        )}

        {/* Share of leads — single clean bar, no mixed scales */}
        <section className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-2.5">
            <div className="text-[11px] font-semibold uppercase tracking-wider">Share of leads by channel</div>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild><Button size="sm" className="h-7 text-[11px]"><Plus className="h-3 w-3 mr-1" />Add channel</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>New traffic channel</DialogTitle></DialogHeader>
                <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); create.mutate(new FormData(e.currentTarget)); }}>
                  <div className="space-y-1.5"><Label>Name</Label><Input name="name" placeholder="Instagram Reels / YouTube Long / Meta Ads" required /></div>
                  <div className="space-y-1.5"><Label>Category</Label>
                    <Select name="category" defaultValue="organic"><SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{["organic", "paid", "referral", "email", "affiliate", "partnership", "other"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                    </Select></div>
                  <Button type="submit" className="w-full" disabled={create.isPending}>Save</Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
          <div className="p-4 space-y-2.5">
            {ranked.map((b) => {
              const share = attributedLeads ? (b.leads / attributedLeads) * 100 : 0;
              return (
                <div key={b.id} className="flex items-center gap-3">
                  <div className="w-40 shrink-0 truncate text-xs font-medium">{b.name}</div>
                  <div className="h-6 flex-1 overflow-hidden rounded bg-muted/40">
                    <div className="h-full bg-primary/70" style={{ width: `${Math.max(2, share)}%` }} />
                  </div>
                  <div className="w-28 shrink-0 text-right font-mono text-[11px] text-muted-foreground">
                    {b.leads} leads · {share.toFixed(0)}%
                  </div>
                </div>
              );
            })}
            {ranked.length === 0 && <div className="py-6 text-center text-xs text-muted-foreground">No channels yet.</div>}
          </div>
        </section>

        {/* Channel cards — the readable version of the old multi-metric chart */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ranked.map((b) => {
            const v = verdict(b);
            const bar = Math.min(100, avgRevPerLead ? (b.revenuePerLead / (avgRevPerLead * 2)) * 100 : 0);
            return (
              <div key={b.id} className="rounded-lg border border-border bg-card p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{b.name}</div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{b.category}</div>
                  </div>
                  <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${v.tone}`}>{v.label}</span>
                </div>

                <div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Revenue per lead</span>
                    <span className="font-mono text-lg font-semibold">${b.revenuePerLead.toLocaleString()}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded bg-muted">
                    <div className="h-full bg-[color:var(--color-success)]" style={{ width: `${Math.max(2, bar)}%` }} />
                  </div>
                  <div className="mt-1 text-[10px] text-muted-foreground">Workspace average ${avgRevPerLead.toLocaleString()}</div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <Stat label="Leads" value={b.leads.toString()} />
                  <Stat label="Became clients" value={b.clients.toString()} />
                  <Stat label="Close rate" value={`${b.closeRate}%`} />
                  <Stat label="Avg deal" value={`$${b.avgDeal.toLocaleString()}`} />
                  <Stat label="Total revenue" value={`$${b.revenue.toLocaleString()}`} />
                  <Stat label="Client LTV" value={`$${b.ltv.toLocaleString()}`} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Ranked table — plain-English headers */}
        <section className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="border-b border-border bg-muted/30 px-4 py-2.5">
            <div className="text-[11px] font-semibold uppercase tracking-wider">Every channel, best to worst</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">Sorted by revenue per lead — the honest measure of a channel.</div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="p-3 text-left">#</th>
                  <th className="p-3 text-left">Channel</th>
                  <th className="p-3 text-left">Type</th>
                  <th className="p-3 text-right font-mono">Leads</th>
                  <th className="p-3 text-right font-mono">Clients</th>
                  <th className="p-3 text-right font-mono">Close rate</th>
                  <th className="p-3 text-right font-mono">Avg deal</th>
                  <th className="p-3 text-right font-mono">Revenue / lead</th>
                  <th className="p-3 text-left">Verdict</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((b, i) => {
                  const v = verdict(b);
                  return (
                    <tr key={b.id} className="border-t border-border hover:bg-muted/20">
                      <td className="p-3 font-mono text-xs text-muted-foreground">{i + 1}</td>
                      <td className="p-3 font-medium">{b.name}</td>
                      <td className="p-3 text-xs uppercase text-muted-foreground">{b.category}</td>
                      <td className="p-3 text-right font-mono">{b.leads}</td>
                      <td className="p-3 text-right font-mono text-[color:var(--color-success)]">{b.clients}</td>
                      <td className="p-3 text-right font-mono">{b.closeRate}%</td>
                      <td className="p-3 text-right font-mono">${b.avgDeal.toLocaleString()}</td>
                      <td className="p-3 text-right font-mono font-semibold">${b.revenuePerLead.toLocaleString()}</td>
                      <td className="p-3"><span className={`rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${v.tone}`}>{v.label}</span></td>
                    </tr>
                  );
                })}
                {ranked.length === 0 && <tr><td colSpan={9} className="p-10 text-center text-sm text-muted-foreground">No channels yet. Add one, then tag leads to it.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-mono text-sm">{value}</div>
    </div>
  );
}
