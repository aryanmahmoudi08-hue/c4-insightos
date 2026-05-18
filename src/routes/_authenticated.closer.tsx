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
import { Textarea } from "@/components/ui/textarea";
import { Plus, PhoneCall, Target, DollarSign, Percent } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/closer")({ component: Closer });

function Closer() {
  const { data: org } = useCurrentOrg();
  const orgId = org?.org_id;
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: calls } = useQuery({
    queryKey: ["calls", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("calls")
        .select("id, scheduled_for, status, showed, offer_made, closed, payment_plan, contract_value_cents, cash_collected_cents, call_summary, leads(full_name, handle)")
        .eq("org_id", orgId!)
        .order("scheduled_for", { ascending: false, nullsFirst: false })
        .limit(80);
      if (error) throw error;
      return data;
    },
  });

  const { data: leadList } = useQuery({
    queryKey: ["leads-min", orgId],
    enabled: !!orgId && open,
    queryFn: async () => {
      const { data } = await supabase.from("leads").select("id, full_name, handle").eq("org_id", orgId!).limit(200);
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async (f: FormData) => {
      const showed = f.get("showed") === "on";
      const offer_made = f.get("offer_made") === "on";
      const closed = f.get("closed") === "on";
      const payload = {
        org_id: orgId!,
        lead_id: (f.get("lead_id") as string) || null,
        status: (f.get("status") as "booked"|"showed"|"no_show"|"rescheduled"|"closed_won"|"closed_lost"),
        scheduled_for: f.get("scheduled_for") ? new Date(String(f.get("scheduled_for"))).toISOString() : null,
        showed, offer_made, closed,
        contract_value_cents: Math.round(Number(f.get("contract_value") || 0) * 100),
        cash_collected_cents: Math.round(Number(f.get("cash_collected") || 0) * 100),
        payment_plan: f.get("payment_plan") === "on",
        call_summary: String(f.get("summary") || "") || null,
      };
      const { error } = await supabase.from("calls").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Call logged"); qc.invalidateQueries({ queryKey: ["calls"] }); setOpen(false); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const total = calls?.length ?? 0;
  const showed = calls?.filter(c => c.showed).length ?? 0;
  const offers = calls?.filter(c => c.offer_made).length ?? 0;
  const closes = calls?.filter(c => c.closed).length ?? 0;
  const cash = (calls?.reduce((s, c) => s + (c.cash_collected_cents ?? 0), 0) ?? 0) / 100;
  const showRate = total ? Math.round((showed / total) * 100) : 0;
  const closeRate = offers ? Math.round((closes / offers) * 100) : 0;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[oklch(0.18_0.05_300)] via-background to-background">
      <TopBar title="Closer Dashboard" subtitle="Offers, deposits, close rate by call" />
      <div className="p-6 space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <StatCard label="Calls" value={total} icon={<PhoneCall className="h-4 w-4" />} accent="accent" />
          <StatCard label="Show rate" value={`${showRate}%`} hint={`${showed}/${total}`} icon={<Percent className="h-4 w-4" />} accent="accent" />
          <StatCard label="Offers made" value={offers} icon={<Target className="h-4 w-4" />} accent="accent" />
          <StatCard label="Close rate" value={`${closeRate}%`} hint={`${closes} closes`} accent="success" />
          <StatCard label="Cash collected" value={`$${cash.toLocaleString()}`} icon={<DollarSign className="h-4 w-4" />} accent="success" />
        </div>

        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">Pipeline · {total} logged calls</div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button size="sm" className="bg-accent hover:bg-accent/90 text-accent-foreground"><Plus className="h-4 w-4" />Log call</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Log a sales call</DialogTitle></DialogHeader>
              <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); create.mutate(new FormData(e.currentTarget)); }}>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label>Lead</Label>
                    <Select name="lead_id"><SelectTrigger><SelectValue placeholder="Pick lead"/></SelectTrigger>
                      <SelectContent>{(leadList ?? []).map(l => <SelectItem key={l.id} value={l.id}>{l.full_name || l.handle || l.id.slice(0,6)}</SelectItem>)}</SelectContent>
                    </Select></div>
                  <div className="space-y-1.5"><Label>Status</Label>
                    <Select name="status" defaultValue="closed_won"><SelectTrigger><SelectValue/></SelectTrigger>
                      <SelectContent>{["booked","showed","no_show","rescheduled","closed_won","closed_lost"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                    </Select></div>
                </div>
                <div className="space-y-1.5"><Label>Scheduled for</Label><Input name="scheduled_for" type="datetime-local" /></div>
                <div className="grid grid-cols-3 gap-3 text-xs">
                  <label className="flex items-center gap-2"><input type="checkbox" name="showed" defaultChecked/> Showed</label>
                  <label className="flex items-center gap-2"><input type="checkbox" name="offer_made" defaultChecked/> Offer made</label>
                  <label className="flex items-center gap-2"><input type="checkbox" name="closed" /> Closed</label>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label>Contract $</Label><Input name="contract_value" type="number" step="0.01" defaultValue={0} /></div>
                  <div className="space-y-1.5"><Label>Cash collected $</Label><Input name="cash_collected" type="number" step="0.01" defaultValue={0} /></div>
                </div>
                <label className="flex items-center gap-2 text-xs"><input type="checkbox" name="payment_plan" /> Payment plan</label>
                <div className="space-y-1.5"><Label>Summary / key moment</Label><Textarea name="summary" rows={3} /></div>
                <Button type="submit" className="w-full" disabled={create.isPending}>{create.isPending ? "…" : "Log call"}</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr><th className="text-left p-3">Lead</th><th className="text-left p-3">Scheduled</th><th className="text-left p-3">Status</th>
                <th className="text-center p-3">Show</th><th className="text-center p-3">Offer</th><th className="text-center p-3">Close</th>
                <th className="text-right p-3 font-mono">Contract</th><th className="text-right p-3 font-mono">Cash</th></tr>
            </thead>
            <tbody>
              {(calls ?? []).map((c) => (
                <tr key={c.id} className="border-t border-border hover:bg-muted/20">
                  <td className="p-3">{c.leads?.full_name || c.leads?.handle || "—"}</td>
                  <td className="p-3 text-xs text-muted-foreground">{c.scheduled_for ? new Date(c.scheduled_for).toLocaleString() : "—"}</td>
                  <td className="p-3"><span className="rounded bg-accent/15 px-1.5 py-0.5 text-[10px] uppercase text-accent">{c.status}</span></td>
                  <td className="p-3 text-center">{c.showed ? "✓" : "·"}</td>
                  <td className="p-3 text-center">{c.offer_made ? "✓" : "·"}</td>
                  <td className="p-3 text-center">{c.closed ? "✓" : "·"}</td>
                  <td className="p-3 text-right font-mono">{c.contract_value_cents ? "$"+Math.round(c.contract_value_cents/100).toLocaleString() : "—"}</td>
                  <td className="p-3 text-right font-mono text-[color:var(--color-success)]">{c.cash_collected_cents ? "$"+Math.round(c.cash_collected_cents/100).toLocaleString() : "—"}</td>
                </tr>
              ))}
              {(!calls || calls.length === 0) && <tr><td colSpan={8} className="p-10 text-center text-sm text-muted-foreground">No calls logged. Add your first close.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
