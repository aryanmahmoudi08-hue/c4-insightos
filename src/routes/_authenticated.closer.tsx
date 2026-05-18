import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-auth";
import { TopBar } from "@/components/app-sidebar";
import { KpiTile, DashboardBar } from "@/components/kpi-tile";
import { DateRangePicker, RANGES, type DateRange } from "@/components/date-range-picker";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { TeamMemberPicker } from "@/components/team-member-picker";
import { TeamMemberFilter, ALL_MEMBERS } from "@/components/team-member-filter";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line } from "recharts";

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
  const [member, setMember] = useState<string>(ALL_MEMBERS);

  const { data: calls } = useQuery({
    queryKey: ["calls", orgId, range.from, range.to],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("calls")
        .select("id, scheduled_for, status, showed, offer_made, closed, contract_value_cents, cash_collected_cents, deposit_cents, call_summary, recording_url, closer_name, lead_email, time_to_close_seconds, key_moment, leads(full_name, handle, email)")
        .eq("org_id", orgId!)
        .gte("scheduled_for", `${range.from}T00:00:00`)
        .lte("scheduled_for", `${range.to}T23:59:59`)
        .order("scheduled_for", { ascending: false, nullsFirst: false })
        .limit(500);
      if (error) throw error;
      return data;
    },
  });

  const { data: objections } = useQuery({
    queryKey: ["call-objections", orgId, range.from, range.to],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from("call_objections")
        .select("objection, resolved, created_at")
        .eq("org_id", orgId!)
        .gte("created_at", `${range.from}T00:00:00`)
        .lte("created_at", `${range.to}T23:59:59`);
      return data ?? [];
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

  const list = (calls ?? []).filter(c => member === ALL_MEMBERS || c.closer_name === member);
  const onCalendar = list.length;
  const showed = list.filter(c => c.showed).length;
  const offers = list.filter(c => c.offer_made).length;
  const closes = list.filter(c => c.closed || c.status === "closed").length;
  const downsells = 0;
  const cashCents = list.reduce((s, c) => s + (c.cash_collected_cents ?? 0), 0);
  const revCents = list.reduce((s, c) => s + (c.contract_value_cents ?? 0), 0);
  const depositCount = list.filter(c => (c.deposit_cents ?? 0) > 0).length;
  const avgCashPerBooked = onCalendar ? cashCents / onCalendar : 0;
  const avgCashPerShowed = showed ? cashCents / showed : 0;
  const avgCashPerClosed = closes ? cashCents / closes : 0;

  // Objection frequency (org-wide in range, ignores member filter)
  const objectionStats = useMemo(() => {
    const counts = new Map<string, { total: number; resolved: number }>();
    for (const o of objections ?? []) {
      const key = String(o.objection).trim().toLowerCase();
      if (!key) continue;
      const cur = counts.get(key) ?? { total: 0, resolved: 0 };
      cur.total += 1;
      if (o.resolved) cur.resolved += 1;
      counts.set(key, cur);
    }
    return Array.from(counts.entries())
      .map(([objection, v]) => ({
        objection: objection.length > 28 ? objection.slice(0, 28) + "…" : objection,
        count: v.total,
        resolved_pct: v.total ? Math.round((v.resolved / v.total) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [objections]);

  // Per-closer scorecard
  const scorecard = useMemo(() => {
    const byName = new Map<string, typeof list>();
    for (const c of calls ?? []) {
      if (!c.closer_name) continue;
      const arr = byName.get(c.closer_name) ?? [];
      arr.push(c);
      byName.set(c.closer_name, arr);
    }
    return Array.from(byName.entries()).map(([name, rows]) => {
      const _booked = rows.length;
      const _showed = rows.filter(r => r.showed).length;
      const _offers = rows.filter(r => r.offer_made).length;
      const _closes = rows.filter(r => r.closed || r.status === "closed").length;
      const _cash = rows.reduce((s, r) => s + (r.cash_collected_cents ?? 0), 0);
      return {
        name,
        booked: _booked,
        showed: _showed,
        closes: _closes,
        showRate: _booked ? (_showed / _booked) * 100 : 0,
        closeRate: _showed ? (_closes / _showed) * 100 : 0,
        offerToClose: _offers ? (_closes / _offers) * 100 : 0,
        cash: _cash,
        avgDeal: _closes ? _cash / _closes : 0,
      };
    }).sort((a, b) => b.cash - a.cash);
  }, [calls]);

  // Time-to-close trend
  const ttcTrend = useMemo(() => {
    const byDay = new Map<string, number[]>();
    for (const c of list) {
      if (!c.time_to_close_seconds || !c.scheduled_for) continue;
      const day = c.scheduled_for.slice(0, 10);
      const arr = byDay.get(day) ?? [];
      arr.push(c.time_to_close_seconds / 60); // minutes
      byDay.set(day, arr);
    }
    return Array.from(byDay.entries())
      .map(([date, mins]) => ({ date, avgMin: Math.round(mins.reduce((s, x) => s + x, 0) / mins.length) }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [list]);

  // Follow-up pipeline (calls flagged as follow_up across whole range)
  const followUps = useMemo(() => list.filter(c => c.status === "follow_up"), [list]);

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
        time_to_close_seconds: Number(f.get("ttc_min") || 0) > 0 ? Math.round(Number(f.get("ttc_min")) * 60) : null,
        key_moment: String(f.get("key_moment") || "") || null,
      };
      const { data: callRow, error } = await supabase.from("calls").insert(payload).select("id").single();
      if (error) throw error;

      // Objections — comma-separated, written to call_objections table
      const objRaw = String(f.get("objections") || "");
      const parts = objRaw.split(/[,;\n|]+/).map(s => s.trim()).filter(Boolean);
      if (parts.length && callRow) {
        await supabase.from("call_objections").insert(
          parts.map(p => ({ org_id: orgId!, call_id: callRow.id, objection: p, resolved: closed }))
        );
      }
    },
    onSuccess: () => {
      toast.success("Call logged");
      qc.invalidateQueries({ queryKey: ["calls"] });
      qc.invalidateQueries({ queryKey: ["call-objections"] });
      setOpen(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <>
      <TopBar title="Closer Dashboard" subtitle="Calls, offers, deposits, cash collected — per-call tracking" />
      <div className="p-6 space-y-4">
        <DashboardBar title="CLOSER DASHBOARD" accent="destructive" />

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <DateRangePicker value={range} onChange={setRange} />
            <TeamMemberFilter role="closer" value={member} onChange={setMember} />
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4" />Log call</Button></DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Log a sales call</DialogTitle></DialogHeader>
              <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); create.mutate(new FormData(e.currentTarget)); }}>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label>Closer name</Label><TeamMemberPicker role="closer" name="closer_name" required /></div>
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
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label>Time-to-close (min on call)</Label><Input name="ttc_min" type="number" step="1" placeholder="e.g. 45" /></div>
                  <div className="space-y-1.5"><Label>Key moment</Label><Input name="key_moment" placeholder="What unlocked the close?" /></div>
                </div>
                <div className="space-y-1.5"><Label>Objections (comma-separated)</Label><Textarea name="objections" rows={2} placeholder="price, timing, spouse, need to think…" /></div>
                <div className="space-y-1.5"><Label>Call recording URL</Label><Input name="recording_url" type="url" placeholder="https://" /></div>
                <div className="space-y-1.5"><Label>Call summary</Label><Textarea name="summary" rows={3} /></div>
                <Button type="submit" className="w-full" disabled={create.isPending}>{create.isPending ? "…" : "Log call"}</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* KPI Grid */}
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

        {/* Insight tabs */}
        <Tabs defaultValue="objections">
          <TabsList>
            <TabsTrigger value="objections">Objection frequency</TabsTrigger>
            <TabsTrigger value="scorecard">Closer scorecard</TabsTrigger>
            <TabsTrigger value="ttc">Time-to-close trend</TabsTrigger>
            <TabsTrigger value="followups">Follow-up pipeline · {followUps.length}</TabsTrigger>
          </TabsList>

          <TabsContent value="objections">
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="mb-2">
                <div className="text-sm font-semibold">Most-logged objections · what's stopping closes</div>
                <div className="text-xs text-muted-foreground">From {objections?.length ?? 0} objections logged in range. % shown = resolved on the call.</div>
              </div>
              {objectionStats.length === 0 ? (
                <div className="p-10 text-center text-sm text-muted-foreground">No objections logged yet. Add them when logging calls (comma-separated) to feed content + script strategy.</div>
              ) : (
                <div className="h-[340px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={objectionStats} layout="vertical" margin={{ left: 8, right: 24 }}>
                      <CartesianGrid stroke="oklch(0.3 0.02 260 / 0.2)" horizontal={false} />
                      <XAxis type="number" stroke="oklch(0.65 0.02 260)" fontSize={11} />
                      <YAxis type="category" dataKey="objection" stroke="oklch(0.65 0.02 260)" fontSize={11} width={160} />
                      <Tooltip contentStyle={{ background: "oklch(0.15 0.02 260)", border: "1px solid oklch(0.3 0.02 260)", fontSize: 12 }}
                        formatter={(_v, _n, p) => [`${p.payload.count} logged · ${p.payload.resolved_pct}% resolved`, "Frequency"]} />
                      <Bar dataKey="count" fill="oklch(0.7 0.18 25)" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="scorecard">
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left p-3">Closer</th>
                    <th className="text-right p-3 font-mono">Booked</th>
                    <th className="text-right p-3 font-mono">Showed</th>
                    <th className="text-right p-3 font-mono">Closes</th>
                    <th className="text-right p-3 font-mono">Show %</th>
                    <th className="text-right p-3 font-mono">Close %</th>
                    <th className="text-right p-3 font-mono">Offer→Close</th>
                    <th className="text-right p-3 font-mono">Avg deal</th>
                    <th className="text-right p-3 font-mono">Cash</th>
                  </tr>
                </thead>
                <tbody>
                  {scorecard.map(s => (
                    <tr key={s.name} className="border-t border-border hover:bg-muted/20">
                      <td className="p-3 font-medium">{s.name}</td>
                      <td className="p-3 text-right font-mono">{s.booked}</td>
                      <td className="p-3 text-right font-mono">{s.showed}</td>
                      <td className="p-3 text-right font-mono">{s.closes}</td>
                      <td className="p-3 text-right font-mono">{s.showRate.toFixed(1)}%</td>
                      <td className="p-3 text-right font-mono">{s.closeRate.toFixed(1)}%</td>
                      <td className="p-3 text-right font-mono">{s.offerToClose.toFixed(1)}%</td>
                      <td className="p-3 text-right font-mono">{s.avgDeal ? fmtMoney(s.avgDeal) : "—"}</td>
                      <td className="p-3 text-right font-mono text-[color:var(--color-success)]">{fmtMoney(s.cash)}</td>
                    </tr>
                  ))}
                  {scorecard.length === 0 && <tr><td colSpan={9} className="p-10 text-center text-sm text-muted-foreground">No closers in range.</td></tr>}
                </tbody>
              </table>
            </div>
          </TabsContent>

          <TabsContent value="ttc">
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="mb-2">
                <div className="text-sm font-semibold">Time-to-close trend (avg minutes per call)</div>
                <div className="text-xs text-muted-foreground">Shorter ≠ better. Watch for spikes when scripts/offers change.</div>
              </div>
              {ttcTrend.length === 0 ? (
                <div className="p-10 text-center text-sm text-muted-foreground">Log time-to-close on each call to see the trend.</div>
              ) : (
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={ttcTrend} margin={{ left: 8, right: 16, top: 8 }}>
                      <CartesianGrid stroke="oklch(0.3 0.02 260 / 0.2)" />
                      <XAxis dataKey="date" stroke="oklch(0.65 0.02 260)" fontSize={11} />
                      <YAxis stroke="oklch(0.65 0.02 260)" fontSize={11} />
                      <Tooltip contentStyle={{ background: "oklch(0.15 0.02 260)", border: "1px solid oklch(0.3 0.02 260)", fontSize: 12 }} />
                      <Line type="monotone" dataKey="avgMin" stroke="oklch(0.65 0.2 260)" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="followups">
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <div className="px-4 py-2 border-b border-border bg-muted/30 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Follow-up pipeline · {followUps.length} calls awaiting next touch
              </div>
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left p-3">Closer</th>
                    <th className="text-left p-3">Lead</th>
                    <th className="text-left p-3">Last call</th>
                    <th className="text-left p-3">Summary</th>
                    <th className="text-right p-3 font-mono">Pending $</th>
                  </tr>
                </thead>
                <tbody>
                  {followUps.map(c => {
                    const daysAgo = c.scheduled_for ? Math.floor((Date.now() - new Date(c.scheduled_for).getTime()) / 86400e3) : null;
                    return (
                      <tr key={c.id} className="border-t border-border hover:bg-muted/20">
                        <td className="p-3 font-medium">{c.closer_name || "—"}</td>
                        <td className="p-3 text-xs">{c.lead_email || c.leads?.full_name || "—"}</td>
                        <td className="p-3 text-xs">
                          {c.scheduled_for ? new Date(c.scheduled_for).toLocaleDateString() : "—"}
                          {daysAgo !== null && <span className={`ml-2 rounded px-1.5 py-0.5 text-[10px] ${daysAgo > 7 ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground"}`}>{daysAgo}d ago</span>}
                        </td>
                        <td className="p-3 text-xs text-muted-foreground max-w-[320px] truncate">{c.call_summary || "—"}</td>
                        <td className="p-3 text-right font-mono">{c.contract_value_cents ? "$" + (c.contract_value_cents/100).toLocaleString() : "—"}</td>
                      </tr>
                    );
                  })}
                  {followUps.length === 0 && <tr><td colSpan={5} className="p-10 text-center text-sm text-muted-foreground">No follow-ups pending. Tag calls as "Follow Up" to surface them here.</td></tr>}
                </tbody>
              </table>
            </div>
          </TabsContent>
        </Tabs>

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
