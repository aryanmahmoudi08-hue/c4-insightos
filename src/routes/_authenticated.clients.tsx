import { createFileRoute, Link } from "@tanstack/react-router";
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
import { Plus, BadgeCheck, HeartPulse, Repeat } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/clients")({ component: Clients });

function Clients() {
  const { data: org } = useCurrentOrg();
  const orgId = org?.org_id;
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: clients } = useQuery({
    queryKey: ["clients", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, full_name, email, offer_name, start_date, contract_value_cents, payment_plan, installments_remaining, status, health_score, renewal_date, renewal_conv_started")
        .eq("org_id", orgId!)
        .order("start_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const create = useMutation({
    mutationFn: async (f: FormData) => {
      const { error } = await supabase.from("clients").insert({
        org_id: orgId!,
        full_name: String(f.get("full_name") || ""),
        email: String(f.get("email") || "") || null,
        offer_name: String(f.get("offer_name") || "") || null,
        contract_value_cents: Math.round(Number(f.get("contract_value") || 0) * 100),
        start_date: String(f.get("start_date") || new Date().toISOString().slice(0,10)),
        renewal_date: String(f.get("renewal_date") || "") || null,
        payment_plan: f.get("payment_plan") === "on",
        installments_remaining: Number(f.get("installments_remaining") || 0),
        status: "active",
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Client added"); qc.invalidateQueries({ queryKey: ["clients"] }); setOpen(false); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const active = clients?.filter(c => c.status === "active").length ?? 0;
  const mrr = (clients?.reduce((s, c) => s + (c.contract_value_cents ?? 0), 0) ?? 0) / 100;
  const avgHealth = clients?.length ? Math.round(clients.reduce((s, c) => s + Number(c.health_score ?? 0), 0) / clients.length) : 0;
  const renewalsDue = clients?.filter(c => c.renewal_date && new Date(c.renewal_date) < new Date(Date.now()+30*86400000)).length ?? 0;

  return (
    <>
      <TopBar title="Clients & Renewals" subtitle="Lifetime value, health, and renewal pipeline" />
      <div className="p-6 space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Active clients" value={active} accent="success" icon={<BadgeCheck className="h-4 w-4" />} />
          <StatCard label="Total contract value" value={`$${mrr.toLocaleString()}`} accent="primary" />
          <StatCard label="Avg health" value={`${avgHealth}`} accent={avgHealth > 70 ? "success" : avgHealth > 40 ? "warning" : "destructive"} icon={<HeartPulse className="h-4 w-4" />} />
          <StatCard label="Renewals <30d" value={renewalsDue} accent={renewalsDue ? "warning" : "primary"} icon={<Repeat className="h-4 w-4" />} />
        </div>

        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">{clients?.length ?? 0} clients</div>
          <div className="flex gap-2">
            <Link to="/onboarding"><Button size="sm" variant="outline">Onboarding intake</Button></Link>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4" />Add client</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>New client</DialogTitle></DialogHeader>
                <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); create.mutate(new FormData(e.currentTarget)); }}>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5"><Label>Name</Label><Input name="full_name" required /></div>
                    <div className="space-y-1.5"><Label>Email</Label><Input name="email" type="email" /></div>
                  </div>
                  <div className="space-y-1.5"><Label>Offer</Label><Input name="offer_name" placeholder="Mastermind / 1:1 / Course" /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5"><Label>Contract $</Label><Input name="contract_value" type="number" step="0.01" /></div>
                    <div className="space-y-1.5"><Label>Installments left</Label><Input name="installments_remaining" type="number" defaultValue={0} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5"><Label>Start date</Label><Input name="start_date" type="date" defaultValue={new Date().toISOString().slice(0,10)} /></div>
                    <div className="space-y-1.5"><Label>Renewal date</Label><Input name="renewal_date" type="date" /></div>
                  </div>
                  <label className="flex items-center gap-2 text-xs"><input type="checkbox" name="payment_plan" /> Payment plan</label>
                  <Button type="submit" className="w-full" disabled={create.isPending}>{create.isPending ? "…" : "Save client"}</Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr><th className="text-left p-3">Client</th><th className="text-left p-3">Offer</th><th className="text-left p-3">Start</th>
                <th className="text-right p-3 font-mono">Contract</th><th className="text-center p-3">Plan</th>
                <th className="text-right p-3 font-mono">Health</th><th className="text-left p-3">Renewal</th><th className="text-left p-3">Status</th></tr>
            </thead>
            <tbody>
              {(clients ?? []).map(c => (
                <tr key={c.id} className="border-t border-border hover:bg-muted/20">
                  <td className="p-3"><div className="font-medium">{c.full_name}</div><div className="text-[11px] text-muted-foreground">{c.email}</div></td>
                  <td className="p-3 text-xs">{c.offer_name ?? "—"}</td>
                  <td className="p-3 text-xs text-muted-foreground">{c.start_date}</td>
                  <td className="p-3 text-right font-mono">${Math.round((c.contract_value_cents ?? 0)/100).toLocaleString()}</td>
                  <td className="p-3 text-center text-xs">{c.payment_plan ? `${c.installments_remaining} left` : "PIF"}</td>
                  <td className="p-3 text-right font-mono">{Number(c.health_score ?? 0)}</td>
                  <td className="p-3 text-xs">{c.renewal_date ?? "—"}</td>
                  <td className="p-3"><span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase">{c.status}</span></td>
                </tr>
              ))}
              {(!clients || clients.length === 0) && <tr><td colSpan={8} className="p-10 text-center text-sm text-muted-foreground">No clients yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
