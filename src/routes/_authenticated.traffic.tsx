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

  const ranked = useMemo(() => [...breakdown].sort((a, b) => b.score - a.score), [breakdown]);

  return (
    <>
      <TopBar title="Traffic & Attribution" subtitle="Channel breakdown ranked by revenue efficiency" />
      <div className="p-6 space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Sources tracked" value={totalSources} icon={<TrendingUp className="h-4 w-4" />} />
          <StatCard label="Total leads" value={totalLeads} accent="primary" />
          <StatCard label="Unattributed" value={unattributed} accent={unattributed > totalLeads/4 ? "warning" : "primary"} hint={totalLeads ? `${Math.round(unattributed/totalLeads*100)}% of leads` : ""} />
          <StatCard label="Active channels" value={(sources ?? []).filter(s => s.is_active).length} accent="success" />
        </div>

        {/* Double-down recommendation */}
        {bestSource ? (
          <div className="rounded-lg border border-accent/40 bg-gradient-to-br from-accent/10 to-transparent p-4">
            <div className="flex items-start gap-3">
              <Target className="h-5 w-5 text-accent shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="text-[10px] uppercase tracking-wider text-accent font-semibold mb-0.5 flex items-center gap-1"><Sparkles className="h-3 w-3" /> Recommended: double down</div>
                <div className="text-base font-semibold">{bestSource.name}</div>
                <div className="text-sm text-muted-foreground mt-1">
                  {bestSource.closeRate}% close rate × ${bestSource.avgDeal.toLocaleString()} avg deal ={" "}
                  <span className="text-foreground font-mono">score {bestSource.score}</span>. Highest revenue efficiency across your channels (min 3 leads).
                </div>
                <div className="mt-2 flex items-center gap-3 text-[11px] font-mono text-muted-foreground">
                  <span>{bestSource.leads} leads</span>
                  <span>·</span>
                  <span>{bestSource.clients} clients</span>
                  <span>·</span>
                  <span className="text-[color:var(--color-success)]">${bestSource.ltv.toLocaleString()} LTV</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border bg-card/50 p-4 text-sm text-muted-foreground">
            Need at least one source with 3+ leads + closed deals to generate a "double down" recommendation.
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">Multi-metric channel comparison</div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4" />Add source</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New traffic source</DialogTitle></DialogHeader>
              <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); create.mutate(new FormData(e.currentTarget)); }}>
                <div className="space-y-1.5"><Label>Name</Label><Input name="name" placeholder="Instagram Reels / YouTube Long / Meta Ads" required /></div>
                <div className="space-y-1.5"><Label>Category</Label>
                  <Select name="category" defaultValue="organic"><SelectTrigger><SelectValue/></SelectTrigger>
                    <SelectContent>{["organic","paid","referral","email","affiliate","partnership","other"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select></div>
                <Button type="submit" className="w-full" disabled={create.isPending}>Save</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Multi-bar comparison */}
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">Side-by-side: leads · close % · avg deal ($k) · LTV ($k)</div>
          <div className="h-72">
            <ResponsiveContainer>
              <BarChart data={breakdown.map(b => ({ ...b, avgDealK: b.avgDeal / 1000, ltvK: b.ltv / 1000 }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0.02 260 / 0.2)" />
                <XAxis dataKey="name" stroke="oklch(0.65 0.02 260)" fontSize={11} />
                <YAxis stroke="oklch(0.65 0.02 260)" fontSize={11} />
                <Tooltip contentStyle={{ background: "oklch(0.15 0.02 260)", border: "1px solid oklch(0.3 0.02 260)", fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="leads" name="Leads" fill="oklch(0.65 0.18 250)" radius={[4,4,0,0]} />
                <Bar dataKey="closeRate" name="Close %" fill="oklch(0.7 0.2 25)" radius={[4,4,0,0]} />
                <Bar dataKey="avgDealK" name="Avg deal ($k)" fill="oklch(0.7 0.18 150)" radius={[4,4,0,0]} />
                <Bar dataKey="ltvK" name="LTV ($k)" fill="oklch(0.7 0.18 90)" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Ranked table */}
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="px-4 py-2 border-b border-border bg-muted/30 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Channels ranked by score (close % × avg deal)
          </div>
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left p-3">Rank</th>
                <th className="text-left p-3">Channel</th>
                <th className="text-left p-3">Category</th>
                <th className="text-right p-3 font-mono">Leads</th>
                <th className="text-right p-3 font-mono">Clients</th>
                <th className="text-right p-3 font-mono">Close %</th>
                <th className="text-right p-3 font-mono">Avg deal</th>
                <th className="text-right p-3 font-mono">LTV</th>
                <th className="text-right p-3 font-mono">Score</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((b, i) => (
                <tr key={b.id} className={`border-t border-border hover:bg-muted/20 ${i === 0 && b.score > 0 ? "bg-accent/5" : ""}`}>
                  <td className="p-3 font-mono text-xs">#{i+1}</td>
                  <td className="p-3 font-medium">{b.name}</td>
                  <td className="p-3 text-xs uppercase text-muted-foreground">{b.category}</td>
                  <td className="p-3 text-right font-mono">{b.leads}</td>
                  <td className="p-3 text-right font-mono text-[color:var(--color-success)]">{b.clients}</td>
                  <td className="p-3 text-right font-mono">{b.closeRate}%</td>
                  <td className="p-3 text-right font-mono">${b.avgDeal.toLocaleString()}</td>
                  <td className="p-3 text-right font-mono">${b.ltv.toLocaleString()}</td>
                  <td className="p-3 text-right font-mono font-semibold">{b.score}</td>
                </tr>
              ))}
              {ranked.length === 0 && <tr><td colSpan={9} className="p-10 text-center text-sm text-muted-foreground">No traffic sources yet. Tag leads with a source to see breakdowns.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
