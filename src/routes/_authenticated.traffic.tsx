import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-auth";
import { TopBar } from "@/components/app-sidebar";
import { StatCard } from "@/components/stat-card";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

export const Route = createFileRoute("/_authenticated/traffic")({ component: Traffic });

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
      const { data, error } = await supabase.from("leads").select("traffic_source_id, status").eq("org_id", orgId!);
      if (error) throw error;
      return data;
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

  const breakdown = (sources ?? []).map(s => {
    const matched = (leads ?? []).filter(l => l.traffic_source_id === s.id);
    const won = matched.filter(l => l.status === "client_won").length;
    return { name: s.name, category: s.category, leads: matched.length, clients: won, conv: matched.length ? Math.round((won/matched.length)*100) : 0 };
  });
  const unattributed = (leads ?? []).filter(l => !l.traffic_source_id).length;

  const totalLeads = leads?.length ?? 0;
  const totalSources = sources?.length ?? 0;

  return (
    <>
      <TopBar title="Traffic & Attribution" subtitle="Channel breakdown: Instagram · YouTube · Ads · Referrals" />
      <div className="p-6 space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Sources tracked" value={totalSources} icon={<TrendingUp className="h-4 w-4" />} />
          <StatCard label="Total leads" value={totalLeads} accent="primary" />
          <StatCard label="Unattributed" value={unattributed} accent={unattributed > totalLeads/4 ? "warning" : "primary"} />
          <StatCard label="Active channels" value={(sources ?? []).filter(s => s.is_active).length} accent="success" />
        </div>

        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">Channel attribution</div>
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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">Leads by channel</div>
            <div className="h-64">
              <ResponsiveContainer>
                <BarChart data={breakdown}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                  <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
                  <Bar dataKey="leads" fill="oklch(0.65 0.18 250)" radius={[4,4,0,0]} />
                  <Bar dataKey="clients" fill="oklch(0.7 0.18 150)" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr><th className="text-left p-3">Channel</th><th className="text-left p-3">Category</th>
                  <th className="text-right p-3 font-mono">Leads</th><th className="text-right p-3 font-mono">Clients</th><th className="text-right p-3 font-mono">Conv</th></tr>
              </thead>
              <tbody>
                {breakdown.map(b => (
                  <tr key={b.name} className="border-t border-border">
                    <td className="p-3 font-medium">{b.name}</td>
                    <td className="p-3 text-xs uppercase text-muted-foreground">{b.category}</td>
                    <td className="p-3 text-right font-mono">{b.leads}</td>
                    <td className="p-3 text-right font-mono text-[color:var(--color-success)]">{b.clients}</td>
                    <td className="p-3 text-right font-mono">{b.conv}%</td>
                  </tr>
                ))}
                {breakdown.length === 0 && <tr><td colSpan={5} className="p-10 text-center text-sm text-muted-foreground">No traffic sources yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
