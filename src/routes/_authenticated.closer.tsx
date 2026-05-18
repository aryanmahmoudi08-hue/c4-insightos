import { createFileRoute } from "@tanstack/react-router";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Plus } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/closer")({ component: Closer });

const fmtMoney = (cents: number) => `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (n: number, d: number) => d > 0 ? `${((n / d) * 100).toFixed(1)}%` : "0.0%";

const STATUS_OPTIONS = [
  { value: "closed", label: "Closed Won" },
  { value: "follow_up", label: "Follow Up" },
  { value: "booked", label: "Pipeline" },
  { value: "disqualified", label: "DQ" },
] as const;

function Closer() {
  const { data: org } = useCurrentOrg();
  const orgId = org?.org_id;
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<DateRange>(RANGES.last30());

  const { data: calls } = useQuery({
    queryKey: ["calls", orgId, range.from, range.to],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("calls")
        .select("id, scheduled_for, status, showed, offer_made, closed, contract_value_cents, cash_collected_cents, deposit_cents, call_summary, recording_url, closer_name, lead_email, leads(full_name, handle, email)")
        .eq("org_id", orgId!)
        .gte("scheduled_for", `${range.from}T00:00:00`)
        .lte("scheduled_for", `${range.to}T23:59:59`)
        .order("scheduled_for", { ascending: false, nullsFirst: false })
        .limit(500);
      if (error) throw error;
      return data;
    },
  });

  const { data: leadList } = useQuery({
    queryKey: ["leads-min", orgId],
    enabled: !!orgId && open,
    queryFn: async () => {
      const { data } = await supabase.from("leads").select("id, full_name, handle, email").eq("org_id", orgId!).limit(200);
      return data ?? [];
    },
  });

  const list = calls ?? [];
  const onCalendar = list.length;
  const showed = list.filter(c => c.showed).length;
  const offers = list.filter(c => c.offer_made).length;
  const closes = list.filter(c => c.closed || c.status === "closed").length;
  const downsells = 0; // not tracked on calls yet
  const cashCents = list.reduce((s, c) => s + (c.cash_collected_cents ?? 0), 0);
  const revCents = list.reduce((s, c) => s + (c.contract_value_cents ?? 0), 0);
  const depositCount = list.filter(c => (c.deposit_cents ?? 0) > 0).length;
  const avgCashPerBooked = onCalendar ? cashCents / onCalendar : 0;
  const avgCashPerShowed = showed ? cashCents / showed : 0;
  const avgCashPerClosed = closes ? cashCents / closes : 0;

  const create = useMutation({
    mutationFn: async (f: FormData) => {
      const status = f.get("status") as "closed" | "follow_up" | "booked" | "disqualified";
      const closed = status === "closed";
      const payload = {
        org_id: orgId!,
        lead_id: (f.get("lead_id") as string) || null,
        closer_name: String(f.get("closer_name") || "") || null,
        lead_email: String(f.get("lead_email") || "") || null,
        status,
        scheduled_for: f.get("date_of_call") ? new Date(String(f.get("date_of_call"))).toISOString() : null,
        showed: f.get("showed") === "on",
        offer_made: f.get("offer_made") === "on",
        closed,
        contract_value_cents: Math.round(Number(f.get("total_revenue") || 0) * 100),
        cash_collected_cents: Math.round(Number(f.get("cash_collected") || 0) * 100),
        deposit_cents: Math.round(Number(f.get("deposit") || 0) * 100),
        call_summary: String(f.get("summary") || "") || null,
        recording_url: String(f.get("recording_url") || "") || null,
      };
      const { error } = await supabase.from("calls").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Call logged"); qc.invalidateQueries({ queryKey: ["calls"] }); setOpen(false); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <>
      <TopBar title="Closer Dashboard" subtitle="Calls, offers, deposits, cash collected — per-call tracking" />
      <div className="p-6 space-y-4">
        <DashboardBar title="CLOSER DASHBOARD" accent="destructive" />

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <DateRangePicker value={range} onChange={setRange} />
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4" />Log call</Button></DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Log a sales call</DialogTitle></DialogHeader>
              <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); create.mutate(new FormData(e.currentTarget)); }}>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label>Closer name</Label><Input name="closer_name" required /></div>
                  <div className="space-y-1.5"><Label>Date of call</Label><Input name="date_of_call" type="datetime-local" defaultValue={new Date().toISOString().slice(0,16)} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label>Lead (optional)</Label>
                    <Select name="lead_id" onValueChange={(v) => {
                      const l = (leadList ?? []).find(x => x.id === v);
                      const el = document.querySelector<HTMLInputElement>('input[name="lead_email"]');
                      if (el && l?.email) el.value = l.email;
                    }}>
                      <SelectTrigger><SelectValue placeholder="Pick lead" /></SelectTrigger>
                      <SelectContent>{(leadList ?? []).map(l => <SelectItem key={l.id} value={l.id}>{l.full_name || l.handle || l.id.slice(0,6)}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5"><Label>Lead email</Label><Input name="lead_email" type="email" /></div>
                </div>
                <div className="space-y-1.5"><Label>Lead status</Label>
                  <Select name="status" defaultValue="closed">
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{STATUS_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <label className="flex items-center gap-2"><input type="checkbox" name="showed" defaultChecked /> Showed</label>
                  <label className="flex items-center gap-2"><input type="checkbox" name="offer_made" defaultChecked /> Offer made (True)</label>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5"><Label>Cash collected $</Label><Input name="cash_collected" type="number" step="0.01" defaultValue={0} /></div>
                  <div className="space-y-1.5"><Label>Deposit $</Label><Input name="deposit" type="number" step="0.01" defaultValue={0} /></div>
                  <div className="space-y-1.5"><Label>Total revenue $</Label><Input name="total_revenue" type="number" step="0.01" defaultValue={0} /></div>
                </div>
                <div className="space-y-1.5"><Label>Call recording URL</Label><Input name="recording_url" type="url" placeholder="https://" /></div>
                <div className="space-y-1.5"><Label>Call summary</Label><Textarea name="summary" rows={3} /></div>
                <Button type="submit" className="w-full" disabled={create.isPending}>{create.isPending ? "…" : "Log call"}</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* KPI Grid — matches Closer Dashboard layout exactly */}
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
          <KpiTile label="TOTAL CALLS ON CALENDAR" value={onCalendar} />
          <KpiTile label="TOTAL CALLS THAT SHOWED" value={showed} />
          <KpiTile label="TOTAL OFFERS MADE" value={offers} />
          <KpiTile label="TOTAL CLOSES" value={closes} />
          <KpiTile label="AVG CASH PER CALL BOOKED" value={fmtMoney(avgCashPerBooked)} tone="money" />

          <KpiTile label="AVERAGE SHOW RATE" value={pct(showed, onCalendar)} tone="rate" />
          <KpiTile label="AVERAGE CLOSE RATE" value={pct(closes, showed)} tone="rate" />
          <KpiTile label="AVG OFFER TO CLOSE RATE" value={pct(closes, offers)} tone="rate" />
          <KpiTile label="TOTAL DEPOSITS" value={depositCount} />
          <KpiTile label="AVG CASH PER CALL SHOWED" value={fmtMoney(avgCashPerShowed)} tone="money" />

          <KpiTile label="TOTAL CASH COLLECTED" value={fmtMoney(cashCents)} tone="money" />
          <KpiTile label="TOTAL REVENUE GENERATED" value={fmtMoney(revCents)} tone="money" />
          <KpiTile label="OFFER RATE" value={pct(offers, showed)} tone="rate" />
          <KpiTile label="CASH COLLECTED RATE" value={pct(cashCents, revCents)} tone="rate" hint={`${downsells} downsells`} />
          <KpiTile label="AVG CASH PER CALL CLOSED" value={fmtMoney(avgCashPerClosed)} tone="money" />
        </div>

        {/* Closer Input Log */}
        <div className="rounded-lg border border-border bg-card overflow-x-auto">
          <div className="px-4 py-2 border-b border-border bg-muted/30 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Closer Input · {list.length} calls
          </div>
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left p-2.5">Closer Name</th>
                <th className="text-left p-2.5">Date Of Call</th>
                <th className="text-left p-2.5">Lead Email</th>
                <th className="text-left p-2.5">Call Summary</th>
                <th className="text-center p-2.5">Offer</th>
                <th className="text-left p-2.5">Lead Status</th>
                <th className="text-right p-2.5 font-mono">Cash Collected</th>
                <th className="text-right p-2.5 font-mono">Total Revenue</th>
                <th className="text-left p-2.5">Call Recording</th>
              </tr>
            </thead>
            <tbody>
              {list.map((c) => {
                const labelMap: Record<string, string> = { closed: "Closed Won", follow_up: "Follow Up", booked: "Pipeline", disqualified: "DQ" };
                const colorMap: Record<string, string> = {
                  closed: "bg-[color:var(--color-success)]/20 text-[color:var(--color-success)]",
                  follow_up: "bg-[color:var(--color-warning)]/15 text-[color:var(--color-warning)]",
                  booked: "bg-accent/15 text-accent",
                  disqualified: "bg-destructive/15 text-destructive",
                };
                return (
                  <tr key={c.id} className="border-t border-border hover:bg-muted/20">
                    <td className="p-2.5 font-medium">{c.closer_name || "—"}</td>
                    <td className="p-2.5 text-xs text-muted-foreground">{c.scheduled_for ? new Date(c.scheduled_for).toLocaleDateString() : "—"}</td>
                    <td className="p-2.5 text-xs">{c.lead_email || c.leads?.email || "—"}</td>
                    <td className="p-2.5 text-xs text-muted-foreground max-w-[280px] truncate">{c.call_summary || "—"}</td>
                    <td className="p-2.5 text-center font-mono">{c.offer_made ? "TRUE" : "FALSE"}</td>
                    <td className="p-2.5"><span className={`rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${colorMap[c.status] ?? "bg-muted"}`}>{labelMap[c.status] ?? c.status}</span></td>
                    <td className="p-2.5 text-right font-mono text-[color:var(--color-success)]">{c.cash_collected_cents ? "$" + (c.cash_collected_cents/100).toLocaleString() : "—"}</td>
                    <td className="p-2.5 text-right font-mono">{c.contract_value_cents ? "$" + (c.contract_value_cents/100).toLocaleString() : "—"}</td>
                    <td className="p-2.5 text-xs">{c.recording_url ? <a className="text-primary hover:underline" href={c.recording_url} target="_blank" rel="noreferrer">link</a> : "—"}</td>
                  </tr>
                );
              })}
              {list.length === 0 && <tr><td colSpan={9} className="p-10 text-center text-sm text-muted-foreground">No calls in this date range. Log your first call.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
