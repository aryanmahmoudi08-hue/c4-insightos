import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-auth";
import { TopBar } from "@/components/app-sidebar";
import { KpiTile, DashboardBar } from "@/components/kpi-tile";
import { DateRangePicker, RANGES, type DateRange } from "@/components/date-range-picker";
import { useMemo, useState, useEffect } from "react";
import { useSearch, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, TrendingUp, TrendingDown, Minus, Trophy, Activity as ActivityIcon } from "lucide-react";
import { toast } from "sonner";
import { TeamMemberPicker } from "@/components/team-member-picker";
import { TeamMemberFilter, ALL_MEMBERS } from "@/components/team-member-filter";
import { GlassTableShell, Pagination, usePagination } from "@/components/glass-table";
import { EmptyState } from "@/components/empty-state";
import { ClipboardList } from "lucide-react";
import { HeatmapGrid } from "@/components/heatmap-grid";
import { RepLeaderboard, type RepMetricOption } from "@/components/rep-leaderboard";
import { MetricCard } from "@/components/metric-card";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Legend,
} from "recharts";

export type ActivityRole = "dm_setter" | "inbound_dialer";

interface Props { role: ActivityRole; title: string; subtitle: string; }

const NUM = (v: FormDataEntryValue | null) => Number(v ?? 0) || 0;
const fmtMoney = (cents: number) => `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (n: number, d: number) => d > 0 ? `${((n / d) * 100).toFixed(1)}%` : "0.0%";

const LEAD_SOURCES = ["Instagram Spiderweb", "Keyword", "Inbound", "Referral", "Ads", "Other"];

interface ActivityLbPerson {
  name: string; cash: number; sets: number; qualified: number; closes: number;
  showRate: number; closeRate: number; linksSent: number; contacted: number;
  connections: number; dials: number; pickupRate: number;
}

// Part C3 — exact per-role metric option lists for the setter/dialer leaderboard selector.
const SETTER_METRICS: RepMetricOption<ActivityLbPerson>[] = [
  { key: "cash", label: "Cash Collected", spectrum: "hot", primary: (p) => fmtMoney(p.cash), secondary: (p) => `${p.sets} sets`, rankBy: (p) => p.cash },
  { key: "sets", label: "Sets", spectrum: "mid", primary: (p) => `${p.sets} sets`, secondary: (p) => `${p.qualified} qualified`, rankBy: (p) => p.sets },
  { key: "qualified", label: "Qualified Convos", spectrum: "mid", primary: (p) => `${p.qualified}`, secondary: (p) => `${p.contacted} contacted`, rankBy: (p) => p.qualified },
  { key: "closes", label: "Closes", spectrum: "hot", primary: (p) => `${p.closes}`, secondary: (p) => fmtMoney(p.cash), rankBy: (p) => p.closes },
  { key: "showRate", label: "Show Rate", spectrum: "mid", primary: (p) => `${p.showRate.toFixed(0)}%`, secondary: (p) => `${p.sets} sets`, rankBy: (p) => p.showRate },
  { key: "closeRate", label: "Close Rate", spectrum: "hot", primary: (p) => `${p.closeRate.toFixed(0)}%`, secondary: (p) => `${p.closes} closes`, rankBy: (p) => p.closeRate },
  { key: "linksSent", label: "Links Sent", spectrum: "cold", primary: (p) => `${p.linksSent}`, secondary: (p) => `${p.contacted} contacted`, rankBy: (p) => p.linksSent },
  { key: "contacted", label: "Leads Contacted", spectrum: "cold", primary: (p) => `${p.contacted}`, secondary: (p) => `${p.qualified} qualified`, rankBy: (p) => p.contacted },
];

const DIALER_METRICS: RepMetricOption<ActivityLbPerson>[] = [
  { key: "cash", label: "Cash Collected", spectrum: "hot", primary: (p) => fmtMoney(p.cash), secondary: (p) => `${p.sets} sets`, rankBy: (p) => p.cash },
  { key: "sets", label: "Sets", spectrum: "mid", primary: (p) => `${p.sets} sets`, secondary: (p) => `${p.connections} connects`, rankBy: (p) => p.sets },
  { key: "connections", label: "Connects", spectrum: "cold", primary: (p) => `${p.connections}`, secondary: (p) => `${p.dials} dials`, rankBy: (p) => p.connections },
  { key: "qualified", label: "Qualified Convos", spectrum: "mid", primary: (p) => `${p.qualified}`, secondary: (p) => `${p.connections} connects`, rankBy: (p) => p.qualified },
  { key: "dials", label: "Dials", spectrum: "cold", primary: (p) => `${p.dials}`, secondary: (p) => `${p.connections} connects`, rankBy: (p) => p.dials },
  { key: "pickupRate", label: "Pick-up Rate", spectrum: "cold", primary: (p) => `${p.pickupRate.toFixed(0)}%`, secondary: (p) => `${p.connections} connects`, rankBy: (p) => p.pickupRate },
  { key: "closes", label: "Closes", spectrum: "hot", primary: (p) => `${p.closes}`, secondary: (p) => fmtMoney(p.cash), rankBy: (p) => p.closes },
];

export function ActivityModule({ role, title, subtitle }: Props) {
  const { data: org } = useCurrentOrg();
  const orgId = org?.org_id;
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  // Command palette's "Log Day" quick action lands here with ?action=log-day.
  const actionSearch = useSearch({ strict: false }) as { action?: string };
  const paletteNav = useNavigate();
  useEffect(() => {
    if (actionSearch.action === "log-day") {
      setOpen(true);
      paletteNav({ search: {} as never, replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionSearch.action]);
  const [range, setRange] = useState<DateRange>(RANGES.last30());
  const [member, setMember] = useState<string>(ALL_MEMBERS);
  const isDialer = role === "inbound_dialer";
  // Part C3 — leaderboard's own metric selector + independent date range,
  // defaulting to inherit the page range until explicitly overridden.
  const [lbMetric, setLbMetric] = useState<string>("cash");
  const [lbOverride, setLbOverride] = useState<DateRange | null>(null);
  const lbRange = lbOverride ?? range;
  const lbMetrics = isDialer ? DIALER_METRICS : SETTER_METRICS;

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
  const { page, setPage, pageCount, paged: pagedRows, total: totalRows, pageSize } = usePagination(rows ?? [], 25);

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

  // Objection frequency aggregation across all rows in range (uses unfiltered allRows so the chart reflects org-wide patterns)
  const objectionStats = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of allRows ?? []) {
      if (!r.objections) continue;
      const parts = String(r.objections).split(/[,;\n|]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
      for (const p of parts) counts.set(p, (counts.get(p) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([objection, count]) => ({ objection: objection.length > 24 ? objection.slice(0, 24) + "…" : objection, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [allRows]);

  // Per-setter momentum: avg sets in last 7 days vs personal best 7-day window in the visible range
  const momentum = useMemo(() => {
    const byName = new Map<string, { date: string; sets: number }[]>();
    for (const r of allRows ?? []) {
      const arr = byName.get(r.team_member_name) ?? [];
      arr.push({ date: r.activity_date, sets: r.sets ?? 0 });
      byName.set(r.team_member_name, arr);
    }
    const today = new Date(range.to);
    const cutoff = new Date(today.getTime() - 6 * 86400e3).toISOString().slice(0, 10);
    return Array.from(byName.entries()).map(([name, entries]) => {
      const recent = entries.filter(e => e.date >= cutoff);
      const recentAvg = recent.length ? recent.reduce((s, e) => s + e.sets, 0) / recent.length : 0;
      // personal best: max single-day in the range (proxy for "best")
      const best = entries.reduce((m, e) => Math.max(m, e.sets), 0);
      const score = best > 0 ? Math.round((recentAvg / best) * 100) : 0;
      return { name, recentAvg: +recentAvg.toFixed(1), best, score };
    }).sort((a, b) => b.score - a.score);
  }, [allRows, range.to]);

  // Setter scorecard radar — normalized 0-100 across key metrics
  const scorecard = useMemo(() => {
    const byName = new Map<string, { sets: number; live: number; oncal: number; closes: number; qual: number; reach: number }>();
    for (const r of allRows ?? []) {
      const x = byName.get(r.team_member_name) ?? { sets: 0, live: 0, oncal: 0, closes: 0, qual: 0, reach: 0 };
      x.sets += r.sets ?? 0;
      x.live += r.live_calls ?? 0;
      x.oncal += r.calls_on_calendar ?? 0;
      x.closes += r.closes ?? 0;
      x.qual += r.qualified_convos ?? 0;
      x.reach += (r.leads_contacted ?? 0) + (r.connections ?? 0);
      byName.set(r.team_member_name, x);
    }
    const people = Array.from(byName.entries()).map(([name, x]) => ({
      name,
      Sets: x.sets,
      ShowRate: x.oncal ? (x.live / x.oncal) * 100 : 0,
      CloseRate: x.live ? (x.closes / x.live) * 100 : 0,
      QualRate: x.reach ? (x.qual / x.reach) * 100 : 0,
    }));
    const maxSets = Math.max(1, ...people.map(p => p.Sets));
    // Build per-axis dataset for recharts radar
    const axes = ["Sets", "ShowRate", "CloseRate", "QualRate"] as const;
    return axes.map(axis => {
      const row: Record<string, number | string> = { axis };
      for (const p of people) {
        row[p.name] = axis === "Sets" ? Math.round((p.Sets / maxSets) * 100) : Math.round(p[axis]);
      }
      return row;
    });
  }, [allRows]);
  const scorecardNames = useMemo(() => {
    const names = new Set<string>();
    for (const r of allRows ?? []) names.add(r.team_member_name);
    return Array.from(names);
  }, [allRows]);
  const radarColors = ["oklch(0.7 0.2 258)", "oklch(0.72 0.18 25)", "oklch(0.7 0.18 145)", "oklch(0.72 0.18 60)", "oklch(0.7 0.18 320)"];

  // Leaderboard — ranked by what this role is actually paid on, not cash (setters/
  // dialers earn a flat % of collected cash regardless of who closes it). Dialer
  // ranks by connects + sets (pickup rate is its unique differentiator); Setter
  // ranks by qualified convos + sets (qual rate + share of total sets differentiate).
  // Org-wide (ignores the member filter), matching this file's own objections/
  // momentum/scorecard convention of deriving cross-rep comparisons from allRows.
  const leaderboard = useMemo(() => {
    const byName = new Map<string, { sets: number; qualified: number; contacted: number; connections: number; dials: number }>();
    for (const r of allRows ?? []) {
      const x = byName.get(r.team_member_name) ?? { sets: 0, qualified: 0, contacted: 0, connections: 0, dials: 0 };
      x.sets += r.sets ?? 0;
      x.qualified += r.qualified_convos ?? 0;
      x.contacted += r.leads_contacted ?? 0;
      x.connections += r.connections ?? 0;
      x.dials += r.dials ?? 0;
      byName.set(r.team_member_name, x);
    }
    const totalSets = Array.from(byName.values()).reduce((s, x) => s + x.sets, 0);
    return Array.from(byName.entries()).map(([name, x]) => ({
      name,
      sets: x.sets,
      qualRate: x.contacted ? (x.qualified / x.contacted) * 100 : 0,
      pickupRate: x.dials ? (x.connections / x.dials) * 100 : 0,
      connections: x.connections,
      shareOfSets: totalSets ? (x.sets / totalSets) * 100 : 0,
      rankScore: isDialer ? x.connections + x.sets : x.qualified + x.sets,
    })).sort((a, b) => b.rankScore - a.rankScore);
  }, [allRows, isDialer]);

  // Leaderboard's own independently-ranged query (Part C3) — separate from the
  // page-range `allRows` query above so overriding the leaderboard's date
  // range never touches the rest of the page.
  const { data: lbRows } = useQuery({
    queryKey: ["activity-lb", role, orgId, lbRange.from, lbRange.to],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from("setter_activity")
        .select("team_member_name, sets, qualified_convos, leads_contacted, connections, dials, closes, live_calls, calls_on_calendar, links_sent, cash_collected_cents")
        .eq("org_id", orgId!).eq("role", role)
        .gte("activity_date", lbRange.from).lte("activity_date", lbRange.to)
        .limit(1000);
      if (error) throw error;
      return data;
    },
  });

  const lbPeople = useMemo<ActivityLbPerson[]>(() => {
    const byName = new Map<string, { sets: number; qualified: number; contacted: number; connections: number; dials: number; closes: number; live: number; oncal: number; linksSent: number; cash: number }>();
    for (const r of lbRows ?? []) {
      const x = byName.get(r.team_member_name) ?? { sets: 0, qualified: 0, contacted: 0, connections: 0, dials: 0, closes: 0, live: 0, oncal: 0, linksSent: 0, cash: 0 };
      x.sets += r.sets ?? 0;
      x.qualified += r.qualified_convos ?? 0;
      x.contacted += r.leads_contacted ?? 0;
      x.connections += r.connections ?? 0;
      x.dials += r.dials ?? 0;
      x.closes += r.closes ?? 0;
      x.live += r.live_calls ?? 0;
      x.oncal += r.calls_on_calendar ?? 0;
      x.linksSent += r.links_sent ?? 0;
      x.cash += r.cash_collected_cents ?? 0;
      byName.set(r.team_member_name, x);
    }
    return Array.from(byName.entries()).map(([name, x]) => ({
      name,
      cash: x.cash,
      sets: x.sets,
      qualified: x.qualified,
      closes: x.closes,
      showRate: x.oncal ? (x.live / x.oncal) * 100 : 0,
      closeRate: x.live ? (x.closes / x.live) * 100 : 0,
      linksSent: x.linksSent,
      contacted: x.contacted,
      connections: x.connections,
      dials: x.dials,
      pickupRate: x.dials ? (x.connections / x.dials) * 100 : 0,
    }));
  }, [lbRows]);

  // Activity heatmap — DM Setter tracks leads_contacted (the per-day "DMs sent"
  // volume field); Inbound Dialer tracks dials. Same weekday-grid pattern as Closer.
  const activityHeatmap = useMemo(() => {
    const names = leaderboard.map(p => p.name).slice(0, 6);
    const cols = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const field = isDialer ? "dials" : "leads_contacted";
    const data = names.map(name => {
      const row = new Array(7).fill(0);
      for (const r of allRows ?? []) {
        if (r.team_member_name !== name || !r.activity_date) continue;
        const day = (new Date(`${r.activity_date}T12:00:00`).getDay() + 6) % 7; // Mon=0..Sun=6
        row[day] += Number((r as Record<string, unknown>)[field] ?? 0);
      }
      return row;
    });
    return { rows: names, cols, data };
  }, [allRows, leaderboard, isDialer]);

  const create = useMutation({
    mutationFn: async (f: FormData) => {
      const payload = {
        org_id: orgId!, role,
        team_member_name: String(f.get("team_member_name") || ""),
        activity_date: String(f.get("activity_date") || new Date().toISOString().slice(0, 10)),
        rate_today: f.get("rate_today") ? Number(f.get("rate_today")) : null,
        objections: String(f.get("objections") || "") || null,
        notes: String(f.get("notes") || "") || null,
        lead_source: String(f.get("lead_source") || "") || null,
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

        {/* Featured rate cards (Part C2) — spectrum-tinted funnel-position rates, distinct from and above the flat KPI tile grid below, which keeps every existing metric. */}
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 stagger-fade">
          {isDialer ? (
            <>
              <MetricCard label="Pick-up rate" value={pct(conns, dials)} spectrum="cold" numericValue={dials ? (conns / dials) * 100 : 0} format={(n) => `${n.toFixed(1)}%`} subLabel={`${conns} of ${dials} dials`} />
              <MetricCard label="Qualified convo rate" value={pct(qualified, conns)} spectrum="mid" numericValue={conns ? (qualified / conns) * 100 : 0} format={(n) => `${n.toFixed(1)}%`} subLabel={`${qualified} qualified`} />
              <MetricCard label="Set rate" value={pct(sets, qualified)} spectrum="mid" numericValue={qualified ? (sets / qualified) * 100 : 0} format={(n) => `${n.toFixed(1)}%`} subLabel={`${sets} sets`} />
              <MetricCard label="Show rate" value={pct(showed, onCalendar)} spectrum="mid" numericValue={onCalendar ? (showed / onCalendar) * 100 : 0} format={(n) => `${n.toFixed(1)}%`} subLabel={`${showed} showed`} />
            </>
          ) : (
            <>
              <MetricCard label="Qualified convo rate" value={pct(qualified, contacted)} spectrum="mid" numericValue={contacted ? (qualified / contacted) * 100 : 0} format={(n) => `${n.toFixed(1)}%`} subLabel={`${qualified} qualified`} />
              <MetricCard label="Set rate" value={pct(sets, qualified)} spectrum="mid" numericValue={qualified ? (sets / qualified) * 100 : 0} format={(n) => `${n.toFixed(1)}%`} subLabel={`${sets} sets`} />
              <MetricCard label="Show rate" value={pct(showed, onCalendar)} spectrum="mid" numericValue={onCalendar ? (showed / onCalendar) * 100 : 0} format={(n) => `${n.toFixed(1)}%`} subLabel={`${showed} showed`} />
              <MetricCard label="Cash per set" value={fmtMoney(sets ? cashCents / sets : 0)} spectrum="hot" numericValue={sets ? cashCents / sets : 0} format={(n) => fmtMoney(n)} subLabel={`${sets} sets`} />
            </>
          )}
        </div>

        {/* Leaderboard with metric selector + independent date range (Part C3) + spectrum activity heatmap (Part C4) */}
        <div className="grid gap-4 lg:grid-cols-2">
          <RepLeaderboard
            titlePrefix={isDialer ? "Dialer leaderboard" : "Setter leaderboard"}
            metrics={lbMetrics}
            metricKey={lbMetric}
            onMetricChange={setLbMetric}
            people={lbPeople}
            emptyLabel={`No ${isDialer ? "dialers" : "setters"} in range.`}
            dateRange={lbRange}
            onDateRangeChange={setLbOverride}
            overridden={!!lbOverride}
            onResetRange={() => setLbOverride(null)}
          />

          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider mb-3">
              <ActivityIcon className="h-3.5 w-3.5 text-accent" />
              {isDialer ? "Dialer activity heatmap · dials by weekday" : "Setter activity heatmap · DMs sent by weekday"}
            </div>
            <HeatmapGrid rowLabels={activityHeatmap.rows} colLabels={activityHeatmap.cols} data={activityHeatmap.data} valueFmt={(v) => isDialer ? `${v} dials` : `${v} DMs`} variant="spectrum" />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <DateRangePicker value={range} onChange={setRange} />
            <TeamMemberFilter role={role} value={member} onChange={setMember} />
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4" />Log day</Button></DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{isDialer ? "Inbound Dialer" : "DM Setter"} — daily log</DialogTitle></DialogHeader>
              <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); create.mutate(new FormData(e.currentTarget)); }}>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5 col-span-2"><Label>Name</Label><TeamMemberPicker role={role} name="team_member_name" required /></div>
                  <div className="space-y-1.5"><Label>Date</Label><Input name="activity_date" type="date" defaultValue={new Date().toISOString().slice(0,10)} /></div>
                </div>
                <div className="space-y-1.5">
                  <Label>Lead source</Label>
                  <Select name="lead_source">
                    <SelectTrigger><SelectValue placeholder="Where did most leads come from?" /></SelectTrigger>
                    <SelectContent>{LEAD_SOURCES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
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
                <div className="space-y-1.5"><Label>Objections (comma-separated)</Label><Textarea name="objections" rows={2} placeholder="price, timing, spouse…" /></div>
                <div className="space-y-1.5"><Label>Notes</Label><Textarea name="notes" rows={3} /></div>
                <Button type="submit" className="w-full" disabled={create.isPending}>{create.isPending ? "…" : "Save day"}</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* KPI Grid */}
        {(() => {
          const payoutLabel = member === ALL_MEMBERS
            ? `PAYOUT OWED (5% · ALL ${isDialer ? "DIALERS" : "SETTERS"})`
            : `PAYOUT OWED · ${member.toUpperCase()} (5%)`;
          const payoutTile = (
            <KpiTile label={payoutLabel} value={fmtMoney(cashCents * 0.05)} tone="money" hint="5% of cash collected in range" />
          );
          return isDialer ? (
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
            {payoutTile}
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
            {payoutTile}
          </div>
        );
        })()}

        {/* Insights row: Objection frequency + Momentum + Scorecard */}
        <Tabs defaultValue="objections">
          <TabsList>
            <TabsTrigger value="objections">Objection frequency</TabsTrigger>
            <TabsTrigger value="momentum">Momentum (7d)</TabsTrigger>
            <TabsTrigger value="scorecard">Setter scorecard</TabsTrigger>
          </TabsList>

          <TabsContent value="objections">
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="mb-3">
                <div className="text-sm font-semibold">Most-logged objections · feeds content strategy</div>
                <div className="text-xs text-muted-foreground">Parsed from objections field across {allRows?.length ?? 0} entries in range</div>
              </div>
              {objectionStats.length === 0 ? (
                <div className="p-10 text-center text-sm text-muted-foreground">No objections logged yet. Add them to daily entries (comma-separated) to see patterns.</div>
              ) : (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={objectionStats} layout="vertical" margin={{ left: 8, right: 24 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                      <XAxis type="number" stroke="var(--muted-foreground)" fontSize={11} allowDecimals={false} />
                      <YAxis type="category" dataKey="objection" stroke="var(--muted-foreground)" fontSize={11} width={140} />
                      <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, boxShadow: "var(--shadow-md)" }} />
                      <Bar dataKey="count" fill="var(--destructive)" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="momentum">
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border bg-muted/30 text-xs font-semibold uppercase tracking-wider">7-day rolling momentum vs personal best</div>
              <div className="divide-y divide-border">
                {momentum.length === 0 && <div className="p-10 text-center text-sm text-muted-foreground">Log activity over multiple days to see momentum.</div>}
                {momentum.map(m => {
                  const Icon = m.score >= 80 ? TrendingUp : m.score >= 50 ? Minus : TrendingDown;
                  const tone = m.score >= 80 ? "text-[color:var(--color-success)]" : m.score >= 50 ? "text-muted-foreground" : "text-destructive";
                  return (
                    <div key={m.name} className="flex items-center gap-3 px-4 py-2.5">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{m.name}</div>
                        <div className="text-2xs text-muted-foreground">avg {m.recentAvg} sets/day last 7d · best day {m.best}</div>
                      </div>
                      <div className={`flex items-center gap-1.5 font-mono text-sm font-semibold ${tone}`}>
                        <Icon className="h-4 w-4" />{m.score}%
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="scorecard">
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="mb-3">
                <div className="text-sm font-semibold">Setter scorecard · Sets / Show / Close / Qual</div>
                <div className="text-xs text-muted-foreground">Normalized 0–100. Sets is relative to top performer.</div>
              </div>
              {scorecardNames.length === 0 ? (
                <div className="p-10 text-center text-sm text-muted-foreground">No data yet.</div>
              ) : (
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={scorecard}>
                      <PolarGrid stroke="var(--border)" />
                      <PolarAngleAxis dataKey="axis" stroke="var(--muted-foreground)" fontSize={11} />
                      <PolarRadiusAxis stroke="var(--muted-foreground)" fontSize={9} angle={30} domain={[0, 100]} />
                      {scorecardNames.slice(0, 5).map((name, i) => (
                        <Radar key={name} name={name} dataKey={name} stroke={radarColors[i]} fill={radarColors[i]} fillOpacity={0.25} />
                      ))}
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, boxShadow: "var(--shadow-md)" }} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        {/* Activity Log */}
        <GlassTableShell
          toolbar={
            <div className="text-2xs uppercase tracking-wider text-muted-foreground font-semibold">
              {isDialer ? "Setter Input" : "DM Setter Input"} · {totalRows} rows
            </div>
          }
          footer={totalRows > 0 ? <Pagination page={page} pageCount={pageCount} onPage={setPage} total={totalRows} pageSize={pageSize} /> : undefined}
        >
          <table className="w-full text-sm">
            <thead className="sticky-thead bg-muted/40 text-2xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left p-2.5">Name</th>
                <th className="text-left p-2.5">Date</th>
                <th className="text-left p-2.5">Source</th>
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
              {pagedRows.map((r) => (
                <tr key={r.id} className="border-t border-border/70 hover:bg-muted/20">
                  <td className="p-2.5 font-medium">{r.team_member_name}</td>
                  <td className="p-2.5 text-xs text-muted-foreground">{r.activity_date}</td>
                  <td className="p-2.5 text-xs">{r.lead_source ? <span className="rounded bg-muted px-1.5 py-0.5 text-3xs uppercase">{r.lead_source}</span> : <span className="text-muted-foreground">—</span>}</td>
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
                  <td className="p-2.5 text-center">{r.rate_today ?? <span className="text-muted-foreground">—</span>}</td>
                  <td className="p-2.5 text-xs text-muted-foreground max-w-[180px] truncate">{r.objections ?? "—"}</td>
                  <td className="p-2.5 text-xs text-muted-foreground max-w-[200px] truncate">{r.notes ?? "—"}</td>
                </tr>
              ))}
              {totalRows === 0 && (
                <tr>
                  <td colSpan={16}>
                    <EmptyState
                      icon={<ClipboardList className="h-4 w-4" />}
                      title="No entries in this date range"
                      description="Log your first day to start tracking."
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </GlassTableShell>
      </div>
    </>
  );
}
