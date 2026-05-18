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
import { Textarea } from "@/components/ui/textarea";
import { Plus } from "lucide-react";
import { toast } from "sonner";

export type ActivityRole = "dm_setter" | "inbound_dialer";

interface Props {
  role: ActivityRole;
  title: string;
  subtitle: string;
}

const NUM = (v: FormDataEntryValue | null) => Number(v ?? 0) || 0;

export function ActivityModule({ role, title, subtitle }: Props) {
  const { data: org } = useCurrentOrg();
  const orgId = org?.org_id;
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const isDialer = role === "inbound_dialer";

  const { data: rows } = useQuery({
    queryKey: ["activity", role, orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from("setter_activity")
        .select("*").eq("org_id", orgId!).eq("role", role)
        .order("activity_date", { ascending: false }).limit(200);
      if (error) throw error;
      return data;
    },
  });

  const sum = (k: keyof NonNullable<typeof rows>[number]) =>
    (rows ?? []).reduce((s, r) => s + (Number(r[k] ?? 0) || 0), 0);

  const dials = sum("dials");
  const conns = sum("connections");
  const contacted = sum("leads_contacted");
  const qualified = sum("qualified_convos");
  const sets = sum("sets");
  const closes = sum("closes");
  const cash = sum("cash_collected_cents") / 100;
  const revenue = sum("total_revenue_cents") / 100;
  const pickup = dials ? Math.round((conns / dials) * 100) : 0;
  const qRate = isDialer
    ? (conns ? Math.round((qualified / conns) * 100) : 0)
    : (contacted ? Math.round((qualified / contacted) * 100) : 0);
  const setRate = qualified ? Math.round((sets / qualified) * 100) : 0;

  const create = useMutation({
    mutationFn: async (f: FormData) => {
      const payload = {
        org_id: orgId!,
        role,
        team_member_name: String(f.get("team_member_name") || ""),
        activity_date: String(f.get("activity_date") || new Date().toISOString().slice(0, 10)),
        rate_today: f.get("rate_today") ? Number(f.get("rate_today")) : null,
        objections: String(f.get("objections") || "") || null,
        notes: String(f.get("notes") || "") || null,
        leads_contacted: NUM(f.get("leads_contacted")),
        qualified_convos: NUM(f.get("qualified_convos")),
        sets: NUM(f.get("sets")),
        calls_on_calendar: NUM(f.get("calls_on_calendar")),
        live_calls: NUM(f.get("live_calls")),
        closes: NUM(f.get("closes")),
        downsells: NUM(f.get("downsells")),
        cash_collected_cents: Math.round(NUM(f.get("cash_collected")) * 100),
        total_revenue_cents: Math.round(NUM(f.get("total_revenue")) * 100),
        dials: NUM(f.get("dials")),
        connections: NUM(f.get("connections")),
      };
      if (!payload.team_member_name) throw new Error("Team member name required");
      const { error } = await supabase.from("setter_activity").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Activity logged"); qc.invalidateQueries({ queryKey: ["activity", role] }); setOpen(false); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <>
      <TopBar title={title} subtitle={subtitle} />
      <div className="p-6 space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          {isDialer ? (
            <>
              <StatCard label="Dials" value={dials} accent="accent" />
              <StatCard label="Connections" value={conns} accent="accent" />
              <StatCard label="Pickup %" value={`${pickup}%`} accent="primary" />
              <StatCard label="Qualified %" value={`${qRate}%`} accent="primary" />
              <StatCard label="Set rate %" value={`${setRate}%`} accent="success" />
              <StatCard label="Cash" value={`$${cash.toLocaleString()}`} accent="success" />
            </>
          ) : (
            <>
              <StatCard label="Leads contacted" value={contacted} accent="accent" />
              <StatCard label="Qualified" value={qualified} accent="accent" />
              <StatCard label="Sets" value={sets} accent="primary" />
              <StatCard label="Closes" value={closes} accent="success" />
              <StatCard label="Cash" value={`$${cash.toLocaleString()}`} accent="success" />
              <StatCard label="Revenue" value={`$${revenue.toLocaleString()}`} accent="success" />
            </>
          )}
        </div>

        <div className="flex justify-between items-center">
          <div className="text-xs text-muted-foreground">{rows?.length ?? 0} logged days</div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4" />Log day</Button></DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{isDialer ? "Inbound dialer" : "DM setter"} — daily log</DialogTitle></DialogHeader>
              <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); create.mutate(new FormData(e.currentTarget)); }}>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5 col-span-2"><Label>Name</Label><Input name="team_member_name" required /></div>
                  <div className="space-y-1.5"><Label>Date</Label><Input name="activity_date" type="date" defaultValue={new Date().toISOString().slice(0,10)} /></div>
                </div>
                {isDialer && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5"><Label>Dials</Label><Input name="dials" type="number" min={0} defaultValue={0} /></div>
                    <div className="space-y-1.5"><Label>Connections</Label><Input name="connections" type="number" min={0} defaultValue={0} /></div>
                  </div>
                )}
                <div className="grid grid-cols-3 gap-3">
                  {!isDialer && <div className="space-y-1.5"><Label>Leads contacted</Label><Input name="leads_contacted" type="number" min={0} defaultValue={0} /></div>}
                  <div className="space-y-1.5"><Label>Qualified convos</Label><Input name="qualified_convos" type="number" min={0} defaultValue={0} /></div>
                  <div className="space-y-1.5"><Label>Sets</Label><Input name="sets" type="number" min={0} defaultValue={0} /></div>
                  <div className="space-y-1.5"><Label>Calls on calendar</Label><Input name="calls_on_calendar" type="number" min={0} defaultValue={0} /></div>
                  <div className="space-y-1.5"><Label>Live calls</Label><Input name="live_calls" type="number" min={0} defaultValue={0} /></div>
                  <div className="space-y-1.5"><Label>Closes</Label><Input name="closes" type="number" min={0} defaultValue={0} /></div>
                  <div className="space-y-1.5"><Label>Downsells</Label><Input name="downsells" type="number" min={0} defaultValue={0} /></div>
                  <div className="space-y-1.5"><Label>Cash collected $</Label><Input name="cash_collected" type="number" step="0.01" min={0} defaultValue={0} /></div>
                  <div className="space-y-1.5"><Label>Total revenue $</Label><Input name="total_revenue" type="number" step="0.01" min={0} defaultValue={0} /></div>
                </div>
                <div className="space-y-1.5"><Label>Rate today (1–10)</Label><Input name="rate_today" type="number" min={1} max={10} /></div>
                <div className="space-y-1.5"><Label>Objections</Label><Textarea name="objections" rows={2} placeholder="price, timing, spouse…" /></div>
                <div className="space-y-1.5"><Label>Notes</Label><Textarea name="notes" rows={3} /></div>
                <Button type="submit" className="w-full" disabled={create.isPending}>{create.isPending ? "…" : "Save day"}</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="rounded-lg border border-border bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left p-3">Name</th>
                <th className="text-left p-3">Date</th>
                {isDialer && <><th className="text-right p-3 font-mono">Dials</th><th className="text-right p-3 font-mono">Conn</th><th className="text-right p-3 font-mono">Pickup%</th></>}
                {!isDialer && <th className="text-right p-3 font-mono">Contacted</th>}
                <th className="text-right p-3 font-mono">Qual</th>
                <th className="text-right p-3 font-mono">Sets</th>
                <th className="text-right p-3 font-mono">Live</th>
                <th className="text-right p-3 font-mono">Closes</th>
                <th className="text-right p-3 font-mono">Cash</th>
                <th className="text-right p-3 font-mono">Rev</th>
                <th className="text-center p-3">Rate</th>
                <th className="text-left p-3">Objections</th>
              </tr>
            </thead>
            <tbody>
              {(rows ?? []).map((r) => {
                const p = r.dials ? Math.round((r.connections! / r.dials!) * 100) : 0;
                return (
                  <tr key={r.id} className="border-t border-border hover:bg-muted/20">
                    <td className="p-3 font-medium">{r.team_member_name}</td>
                    <td className="p-3 text-xs text-muted-foreground">{r.activity_date}</td>
                    {isDialer && <><td className="p-3 text-right font-mono">{r.dials}</td><td className="p-3 text-right font-mono">{r.connections}</td><td className="p-3 text-right font-mono">{p}%</td></>}
                    {!isDialer && <td className="p-3 text-right font-mono">{r.leads_contacted}</td>}
                    <td className="p-3 text-right font-mono">{r.qualified_convos}</td>
                    <td className="p-3 text-right font-mono">{r.sets}</td>
                    <td className="p-3 text-right font-mono">{r.live_calls}</td>
                    <td className="p-3 text-right font-mono">{r.closes}</td>
                    <td className="p-3 text-right font-mono text-[color:var(--color-success)]">${((r.cash_collected_cents ?? 0)/100).toLocaleString()}</td>
                    <td className="p-3 text-right font-mono">${((r.total_revenue_cents ?? 0)/100).toLocaleString()}</td>
                    <td className="p-3 text-center">{r.rate_today ?? "—"}</td>
                    <td className="p-3 text-xs text-muted-foreground max-w-[220px] truncate">{r.objections ?? "—"}</td>
                  </tr>
                );
              })}
              {(!rows || rows.length === 0) && (
                <tr><td colSpan={isDialer ? 12 : 11} className="p-10 text-center text-sm text-muted-foreground">No entries yet. Log your first day.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
