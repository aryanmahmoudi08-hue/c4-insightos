import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-auth";
import { TopBar } from "@/components/app-sidebar";
import { KpiTile, DashboardBar } from "@/components/kpi-tile";
import { DateRangePicker, RANGES, type DateRange } from "@/components/date-range-picker";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { TeamMemberPicker } from "@/components/team-member-picker";
import { TeamMemberFilter, ALL_MEMBERS } from "@/components/team-member-filter";

export type ActivityRole = "dm_setter" | "inbound_dialer";

interface Props { role: ActivityRole; title: string; subtitle: string; }

const NUM = (v: FormDataEntryValue | null) => Number(v ?? 0) || 0;
const fmtMoney = (cents: number) => `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (n: number, d: number) => d > 0 ? `${((n / d) * 100).toFixed(1)}%` : "0.0%";

export function ActivityModule({ role, title, subtitle }: Props) {
  const { data: org } = useCurrentOrg();
  const orgId = org?.org_id;
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<DateRange>(RANGES.last30());
  const [member, setMember] = useState<string>(ALL_MEMBERS);
  const isDialer = role === "inbound_dialer";

  const { data: allRows } = useQuery({
    queryKey: ["activity", role, orgId, range.from, range.to],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from("setter_activity")
        .select("*").eq("org_id", orgId!).eq("role", role)
        .gte("activity_date", range.from).lte("activity_date", range.to)
        .order("activity_date", { ascending: false }).limit(500);
      if (error) throw error;
      return data;
    },
  });
  const rows = member === ALL_MEMBERS ? allRows : (allRows ?? []).filter(r => r.team_member_name === member);

  const sum = (k: string) => (rows ?? []).reduce((s, r) => s + (Number((r as Record<string, unknown>)[k] ?? 0) || 0), 0);
  const dials = sum("dials");
  const conns = sum("connections");
  const contacted = sum("leads_contacted");
  const linksSent = sum("links_sent");
  const qualified = sum("qualified_convos");
  const sets = sum("sets");
  const onCalendar = sum("calls_on_calendar");
  const showed = sum("live_calls");
  const closes = sum("closes");
  const downsells = sum("downsells");
  const cashCents = sum("cash_collected_cents");
  const revCents = sum("total_revenue_cents");

  const create = useMutation({
    mutationFn: async (f: FormData) => {
      const payload = {
        org_id: orgId!, role,
        team_member_name: String(f.get("team_member_name") || ""),
        activity_date: String(f.get("activity_date") || new Date().toISOString().slice(0, 10)),
        rate_today: f.get("rate_today") ? Number(f.get("rate_today")) : null,
        objections: String(f.get("objections") || "") || null,
        notes: String(f.get("notes") || "") || null,
        leads_contacted: NUM(f.get("leads_contacted")),
        links_sent: NUM(f.get("links_sent")),
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
        <DashboardBar title={isDialer ? "SETTER DASHBOARD (INBOUND DIALER)" : "DM SETTER DASHBOARD"} accent={isDialer ? "accent" : "primary"} />

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <DateRangePicker value={range} onChange={setRange} />
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4" />Log day</Button></DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{isDialer ? "Inbound Dialer" : "DM Setter"} — daily log</DialogTitle></DialogHeader>
              <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); create.mutate(new FormData(e.currentTarget)); }}>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5 col-span-2"><Label>Name</Label><TeamMemberPicker role={role} name="team_member_name" required /></div>
                  <div className="space-y-1.5"><Label>Date</Label><Input name="activity_date" type="date" defaultValue={new Date().toISOString().slice(0,10)} /></div>
                </div>
                {isDialer ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5"><Label>Dials</Label><Input name="dials" type="number" min={0} defaultValue={0} /></div>
                    <div className="space-y-1.5"><Label>Connections</Label><Input name="connections" type="number" min={0} defaultValue={0} /></div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5"><Label>Leads contacted</Label><Input name="leads_contacted" type="number" min={0} defaultValue={0} /></div>
                    <div className="space-y-1.5"><Label>Links sent</Label><Input name="links_sent" type="number" min={0} defaultValue={0} /></div>
                  </div>
                )}
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5"><Label>Qualified convos</Label><Input name="qualified_convos" type="number" min={0} defaultValue={0} /></div>
                  <div className="space-y-1.5"><Label>Sets</Label><Input name="sets" type="number" min={0} defaultValue={0} /></div>
                  <div className="space-y-1.5"><Label>Calls on calendar</Label><Input name="calls_on_calendar" type="number" min={0} defaultValue={0} /></div>
                  <div className="space-y-1.5"><Label>Live calls (showed)</Label><Input name="live_calls" type="number" min={0} defaultValue={0} /></div>
                  <div className="space-y-1.5"><Label>Closes</Label><Input name="closes" type="number" min={0} defaultValue={0} /></div>
                  <div className="space-y-1.5"><Label>Downsells</Label><Input name="downsells" type="number" min={0} defaultValue={0} /></div>
                  <div className="space-y-1.5"><Label>Cash collected $</Label><Input name="cash_collected" type="number" step="0.01" min={0} defaultValue={0} /></div>
                  <div className="space-y-1.5"><Label>Total revenue $</Label><Input name="total_revenue" type="number" step="0.01" min={0} defaultValue={0} /></div>
                  <div className="space-y-1.5"><Label>Rate today (1–10)</Label><Input name="rate_today" type="number" min={1} max={10} /></div>
                </div>
                <div className="space-y-1.5"><Label>Objections</Label><Textarea name="objections" rows={2} placeholder="price, timing, spouse…" /></div>
                <div className="space-y-1.5"><Label>Notes</Label><Textarea name="notes" rows={3} /></div>
                <Button type="submit" className="w-full" disabled={create.isPending}>{create.isPending ? "…" : "Save day"}</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* KPI Grid */}
        {isDialer ? (
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
            <KpiTile label="TOTAL DIALS" value={dials} />
            <KpiTile label="TOTAL CONNECTIONS" value={conns} />
            <KpiTile label="TOTAL QUALIFIED CONVOS" value={qualified} />
            <KpiTile label="TOTAL APPOINTMENTS SET" value={sets} />
            <KpiTile label="TOTAL CASH COLLECTED" value={fmtMoney(cashCents)} tone="money" />
            <KpiTile label="TOTAL CALLS ON CALENDAR" value={onCalendar} />
            <KpiTile label="TOTAL CALLS THAT SHOWED" value={showed} />
            <KpiTile label="TOTAL CLOSES" value={closes} />
            <KpiTile label="TOTAL DOWNSELLS" value={downsells} />
            <KpiTile label="TOTAL REVENUE GENERATED" value={fmtMoney(revCents)} tone="money" />
            <KpiTile label="AVERAGE SHOW RATE" value={pct(showed, onCalendar)} tone="rate" />
            <KpiTile label="AVERAGE CLOSE RATE" value={pct(closes, showed)} tone="rate" />
            <KpiTile label="PICKUP RATE" value={pct(conns, dials)} tone="rate" />
            <KpiTile label="QUALIFIED CONVO RATE" value={pct(qualified, conns)} tone="rate" />
            <KpiTile label="SET RATE" value={pct(sets, qualified)} tone="rate" />
          </div>
        ) : (
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
            <KpiTile label="TOTAL LEADS CONTACTED" value={contacted} />
            <KpiTile label="TOTAL QUALIFIED CONVOS" value={qualified} />
            <KpiTile label="TOTAL LINKS SENT" value={linksSent} />
            <KpiTile label="TOTAL APPOINTMENTS SET" value={sets} />
            <KpiTile label="TOTAL CALLS ON CALENDAR" value={onCalendar} />
            <KpiTile label="TOTAL CALLS THAT SHOWED" value={showed} />
            <KpiTile label="TOTAL CLOSES" value={closes} />
            <KpiTile label="TOTAL DOWNSELLS" value={downsells} />
            <KpiTile label="AVERAGE SHOW RATE" value={pct(showed, onCalendar)} tone="rate" />
            <KpiTile label="AVERAGE CLOSE RATE" value={pct(closes, showed)} tone="rate" />
            <KpiTile label="TOTAL CASH COLLECTED" value={fmtMoney(cashCents)} tone="money" />
            <KpiTile label="TOTAL REVENUE GENERATED" value={fmtMoney(revCents)} tone="money" />
          </div>
        )}

        {/* Activity Log */}
        <div className="rounded-lg border border-border bg-card overflow-x-auto">
          <div className="px-4 py-2 border-b border-border bg-muted/30 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {isDialer ? "Setter Input" : "DM Setter Input"} · {rows?.length ?? 0} rows
          </div>
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left p-2.5">Name</th>
                <th className="text-left p-2.5">Date</th>
                {isDialer ? (<><th className="text-right p-2.5 font-mono">Dials</th><th className="text-right p-2.5 font-mono">Conn</th></>)
                          : (<><th className="text-right p-2.5 font-mono">Contacted</th><th className="text-right p-2.5 font-mono">Links</th></>)}
                <th className="text-right p-2.5 font-mono">Qual Convos</th>
                <th className="text-right p-2.5 font-mono">Sets</th>
                <th className="text-right p-2.5 font-mono">On Cal</th>
                <th className="text-right p-2.5 font-mono">Live</th>
                <th className="text-right p-2.5 font-mono">Closes</th>
                <th className="text-right p-2.5 font-mono">Downsells</th>
                <th className="text-right p-2.5 font-mono">Cash</th>
                <th className="text-right p-2.5 font-mono">Revenue</th>
                <th className="text-center p-2.5">Rate</th>
                <th className="text-left p-2.5">Objections</th>
                <th className="text-left p-2.5">Notes</th>
              </tr>
            </thead>
            <tbody>
              {(rows ?? []).map((r) => (
                <tr key={r.id} className="border-t border-border hover:bg-muted/20">
                  <td className="p-2.5 font-medium">{r.team_member_name}</td>
                  <td className="p-2.5 text-xs text-muted-foreground">{r.activity_date}</td>
                  {isDialer
                    ? (<><td className="p-2.5 text-right font-mono">{r.dials ?? 0}</td><td className="p-2.5 text-right font-mono">{r.connections ?? 0}</td></>)
                    : (<><td className="p-2.5 text-right font-mono">{r.leads_contacted ?? 0}</td><td className="p-2.5 text-right font-mono">{r.links_sent ?? 0}</td></>)}
                  <td className="p-2.5 text-right font-mono">{r.qualified_convos ?? 0}</td>
                  <td className="p-2.5 text-right font-mono">{r.sets ?? 0}</td>
                  <td className="p-2.5 text-right font-mono">{r.calls_on_calendar ?? 0}</td>
                  <td className="p-2.5 text-right font-mono">{r.live_calls ?? 0}</td>
                  <td className="p-2.5 text-right font-mono">{r.closes ?? 0}</td>
                  <td className="p-2.5 text-right font-mono">{r.downsells ?? 0}</td>
                  <td className="p-2.5 text-right font-mono text-[color:var(--color-success)]">${((r.cash_collected_cents ?? 0)/100).toLocaleString()}</td>
                  <td className="p-2.5 text-right font-mono">${((r.total_revenue_cents ?? 0)/100).toLocaleString()}</td>
                  <td className="p-2.5 text-center">{r.rate_today ?? "—"}</td>
                  <td className="p-2.5 text-xs text-muted-foreground max-w-[180px] truncate">{r.objections ?? "—"}</td>
                  <td className="p-2.5 text-xs text-muted-foreground max-w-[200px] truncate">{r.notes ?? "—"}</td>
                </tr>
              ))}
              {(!rows || rows.length === 0) && (
                <tr><td colSpan={15} className="p-10 text-center text-sm text-muted-foreground">No entries in this date range. Log your first day to start tracking.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
