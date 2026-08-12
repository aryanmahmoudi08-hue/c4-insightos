import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { motion } from "motion/react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg, useAuth } from "@/hooks/use-auth";
import { TopBar } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useMemo, useState } from "react";
import { Users, MessageSquare, PhoneCall, Film, StickyNote, Gem, Sparkles, AlertTriangle, TrendingUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { analyzeLeads } from "@/lib/lead-insights.functions";
import { PageHero } from "@/components/page-hero";
import { MetricCard } from "@/components/metric-card";
import { GlassTableShell, TableSearch, FilterPills, Pagination, usePagination, ColumnGroupToggle } from "@/components/glass-table";
import { mockLeads, mockLeadInsights, withMockDelay } from "@/lib/dev-mock-data";
import { CHIP_TONE_CLASSES, type ChipTone } from "@/components/ui/badge";
import { BentoGrid, BentoCell } from "@/components/bento-grid";
import { SPECTRUM_VAR, SPECTRUM_TEXT_CLASS, SPECTRUM_SEQUENCE } from "@/lib/spectrum";
import { EASE } from "@/lib/motion-tokens";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/leads")({ component: Leads });

type LeadRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  handle: string | null;
  phone: string | null;
  status: string;
  pipeline_stage: string | null;
  priority: string;
  precall_video_watched: boolean;
  intent_score: number | null;
  engagement_score: number | null;
  estimated_close_probability: number | null;
  source_connector: string | null;
  first_touch_content_id: string | null;
  qualification_notes: string | null;
  application_data: Record<string, string> | null;
  notes: string | null;
  created_at: string;
};

// Row tint (subtle, 5%) for the same tone family used by chips (15%) — one 4-accent
// system for everything: success/warning/destructive/info + neutral default.
const ROW_TINT: Record<ChipTone, string> = {
  default: "",
  success: "bg-[color:var(--color-success)]/5",
  warning: "bg-[color:var(--color-warning)]/5",
  destructive: "bg-destructive/5",
  info: "bg-accent/5",
};

const PIPELINE_STAGES = [
  { v: "", label: "—", tone: "default" as ChipTone },
  { v: "cold", label: "Cold", tone: "default" as ChipTone },
  { v: "warm", label: "Warm", tone: "warning" as ChipTone },
  { v: "hot", label: "Hot", tone: "success" as ChipTone },
  { v: "diamond", label: "💎 Diamond", tone: "info" as ChipTone },
];
const stageChip = (v: string | null) => CHIP_TONE_CLASSES[PIPELINE_STAGES.find(s => s.v === (v ?? ""))?.tone ?? "default"];

const PRIORITY_OPTIONS = [
  { v: "low", label: "Low" },
  { v: "normal", label: "Normal" },
  { v: "high", label: "High" },
  { v: "diamond", label: "💎 Diamond" },
];

// Status dropdown options (Opt-In is the first/default)
const STATUS_OPTIONS = [
  { v: "opt_in", label: "Opt-In" },
  { v: "call_booked", label: "Call Booked" },
  { v: "applied_qualified_no_book", label: "Applied [Qualified] Did Not Book" },
  { v: "applied_unqualified_no_book", label: "Applied [Unqualified] Did Not Book" },
  { v: "rescheduling", label: "Rescheduling" },
  { v: "no_show", label: "Didn't Show Up" },
  { v: "follow_up_short", label: "Follow Up (short term)" },
  { v: "follow_up_long", label: "Follow Up (long term)" },
  { v: "deposit", label: "Deposit" },
  { v: "closed", label: "Closed" },
  { v: "lt_closed", label: "LT Closed" },
  { v: "no_close", label: "No Close" },
  { v: "bad_fit", label: "Bad Fit" },
  { v: "disqualified", label: "Disqualified" },
  { v: "cancelled", label: "Cancelled" },
  { v: "ignore", label: "IGNORE" },
];

// Every status collapses onto the same 4-accent + neutral system as everything
// else in the app (was 8 raw hues: amber/yellow/blue/indigo/emerald + destructive/muted).
const STATUS_TONE_KEY: Record<string, ChipTone> = {
  opt_in: "default",
  call_booked: "warning",
  applied_qualified_no_book: "warning",
  applied_unqualified_no_book: "default",
  rescheduling: "warning",
  no_show: "destructive",
  follow_up_short: "info",
  follow_up_long: "info",
  deposit: "success",
  closed: "success",
  lt_closed: "success",
  no_close: "destructive",
  bad_fit: "default",
  disqualified: "default",
  cancelled: "destructive",
  ignore: "default",
};
const STATUS_TONE: Record<string, { row: string; chip: string }> = Object.fromEntries(
  Object.entries(STATUS_TONE_KEY).map(([status, t]) => [
    status,
    {
      row: status === "ignore" ? "opacity-50" : ROW_TINT[t],
      chip: (status === "closed" || status === "lt_closed") ? `${CHIP_TONE_CLASSES[t]} font-semibold` : CHIP_TONE_CLASSES[t],
    },
  ]),
);
const tone = (s: string) => STATUS_TONE[s] ?? STATUS_TONE.opt_in;

const REACHED_CALL_STATUSES = ["call_booked", "rescheduling", "no_show", "deposit", "closed", "lt_closed", "no_close"];

// Application data keys (match typeform mapping)
const APP_COLS: { key: string; label: string; width?: string }[] = [
  { key: "experience", label: "Experience", width: "min-w-[140px]" },
  { key: "work_school", label: "Work/School", width: "min-w-[140px]" },
  { key: "focus", label: "Focus", width: "min-w-[140px]" },
  { key: "goal", label: "Goal", width: "min-w-[110px]" },
  { key: "candidate_fit", label: "Candidate Fit", width: "min-w-[200px]" },
  { key: "serious_status", label: "Serious", width: "min-w-[140px]" },
  { key: "time", label: "Time", width: "min-w-[90px]" },
  { key: "income", label: "Income", width: "min-w-[110px]" },
  { key: "capital", label: "Capital", width: "min-w-[110px]" },
  { key: "credit", label: "Credit", width: "min-w-[100px]" },
  { key: "commitment", label: "Commit", width: "min-w-[80px]" },
];

const BUCKET_STATUSES: Record<string, string[]> = {
  active: ["opt_in", "rescheduling", "follow_up_short", "follow_up_long", "deposit"],
  booked: ["call_booked"],
  closed: ["closed", "lt_closed"],
  lost: ["no_show", "no_close", "bad_fit", "disqualified", "cancelled", "ignore", "applied_qualified_no_book", "applied_unqualified_no_book"],
};

function Leads() {
  const { data: org } = useCurrentOrg();
  const orgId = org?.org_id;
  const { devBypass } = useAuth();
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [bucket, setBucket] = useState<"all" | "active" | "booked" | "closed" | "lost">("all");
  const [selected, setSelected] = useState<LeadRow | null>(null);
  const [qualExpanded, setQualExpanded] = useState(false);

  const { data: leads, isLoading: leadsLoading } = useQuery({
    queryKey: ["leads", orgId, devBypass],
    enabled: !!orgId,
    queryFn: async () => {
      if (devBypass) return mockLeads() as unknown as LeadRow[];
      const { data, error } = await supabase
        .from("leads")
        .select("id, full_name, email, handle, phone, status, pipeline_stage, priority, precall_video_watched, intent_score, engagement_score, estimated_close_probability, source_connector, first_touch_content_id, qualification_notes, application_data, notes, created_at")
        .eq("org_id", orgId!)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as LeadRow[];
    },
  });

  const updateLead = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      const { error } = await (supabase as any).from("leads").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["leads", orgId] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const view = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (leads ?? []).filter(l => {
      if (bucket !== "all" && !BUCKET_STATUSES[bucket].includes(l.status)) return false;
      if (statusFilter !== "all" && l.status !== statusFilter) return false;
      if (!q) return true;
      const hay = [l.full_name, l.email, l.handle, l.phone, l.notes, JSON.stringify(l.application_data ?? {})].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [leads, query, statusFilter, bucket]);

  const { page, setPage, pageCount, paged, total, pageSize } = usePagination(view, 25);

  const stats = useMemo(() => {
    const all = leads ?? [];
    return {
      total: all.length,
      booked: all.filter(l => l.status === "call_booked" || l.status === "rescheduling").length,
      closed: all.filter(l => l.status === "closed" || l.status === "lt_closed").length,
      diamond: all.filter(l => l.priority === "diamond" || l.pipeline_stage === "diamond").length,
    };
  }, [leads]);

  // Pipeline funnel (Part B1 hero) — net-new: no aggregate stage chart existed
  // before, only a per-row pipeline_stage dropdown. Approximated from current
  // `status` snapshot (this table has no "milestone reached" history), cold →
  // mid → hot in strict spectrum order: total leads → ever reached a call →
  // closed.
  const funnelStats = useMemo(() => {
    const all = leads ?? [];
    const total = all.length;
    const reachedCall = all.filter(l => REACHED_CALL_STATUSES.includes(l.status)).length;
    const closed = all.filter(l => l.status === "closed" || l.status === "lt_closed").length;
    return [
      { stage: "Total Leads", value: total, spectrum: SPECTRUM_SEQUENCE[0] },
      { stage: "Reached a Call", value: reachedCall, spectrum: SPECTRUM_SEQUENCE[1] },
      { stage: "Closed", value: closed, spectrum: SPECTRUM_SEQUENCE[2] },
    ] as const;
  }, [leads]);

  return (
    <>
      <TopBar title="Leads CRM" subtitle="Pipeline stage · priority · pre-call vid tracking · notes" />
      <div className="p-6 space-y-5">
        <PageHero
          icon={<Users className="h-5 w-5" />}
          eyebrow="Sales Tracking"
          title="Leads CRM"
          subtitle="Pipeline stage, priority, pre-call video tracking, and full activity notes."
          status={[
            { label: `${stats.total} total leads`, tone: "default" },
            { label: `${stats.diamond} diamond`, tone: "accent" },
            ...(stats.booked > 0 ? [{ label: `${stats.booked} awaiting show`, tone: "warning" as const }] : []),
          ]}
        />

        {/* Pipeline funnel — the page's one hero moment (B1), net-new (Part F: nothing
            relocated, PageHero above stays exactly as it was). Bars fill in stage-by-stage
            in strict spectrum order (cold→mid→hot) on mount — the funnel-fill signature
            moment (B5). */}
        {/* cols={2} — this grid's only cell is the funnel hero, so it should fully cover
            the grid rather than leaving 2 of 4 tracks empty; rowHeight trimmed to match
            what 3 funnel bars actually need instead of the taller default. */}
        <BentoGrid cols={2} rowHeight="8rem">
          <BentoCell span="hero">
            <LeadsFunnelHero funnel={funnelStats} />
          </BentoCell>
        </BentoGrid>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 stagger-fade">
          {/* Volume/conversion metrics take their funnel position (B4) — never a semantic
              tone. The delta badge's up/down green/red is untouched by this (trend
              direction is a different signal than funnel temperature — MetricCard keeps
              those separate by design). */}
          <MetricCard label="Total leads" value={stats.total} icon={<Users className="h-3 w-3" />} spectrum="cold" deltaPct={9} spark={[12, 15, 14, 18, 20, 19, 24]} />
          <MetricCard label="Call booked" value={stats.booked} icon={<PhoneCall className="h-3 w-3" />} spectrum="mid" deltaPct={4} spark={[2, 3, 2, 4, 3, 4, 5]} sparkVariant="bar" />
          <MetricCard label="Closed" value={stats.closed} icon={<Sparkles className="h-3 w-3" />} spectrum="hot" deltaPct={17} spark={[1, 1, 2, 1, 2, 3, 3]} sparkVariant="bar" />
          <MetricCard label="💎 Diamond leads" value={stats.diamond} icon={<Gem className="h-3 w-3" />} spectrum="hot" deltaPct={-2} spark={[3, 4, 3, 4, 4, 3, 4]} />
        </div>

        <LeadInsightsPanel orgId={orgId} />

        <GlassTableShell
          toolbar={
            <>
              <TableSearch value={query} onChange={setQuery} placeholder="Search name, handle, application…" />
              <FilterPills
                options={[
                  { key: "all", label: "All", count: leads?.length ?? 0 },
                  { key: "active", label: "Active" },
                  { key: "booked", label: "Booked" },
                  { key: "closed", label: "Closed" },
                  { key: "lost", label: "Lost" },
                ]}
                value={bucket}
                onChange={setBucket}
              />
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-8 rounded-md border border-input bg-background px-2 text-2xs">
                <option value="all">All statuses</option>
                {STATUS_OPTIONS.map(s => <option key={s.v} value={s.v}>{s.label}</option>)}
              </select>
              <div className="ml-auto text-2xs text-muted-foreground">{view.length} / {leads?.length ?? 0}</div>
            </>
          }
          footer={<Pagination page={page} pageCount={pageCount} onPage={setPage} total={total} pageSize={pageSize} />}
        >

          <table className="w-full text-sm">
            <thead className="sticky-thead bg-muted/40 text-3xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left p-2.5 min-w-[110px]">Date / Time</th>
                <th className="text-left p-2.5 min-w-[60px]">💎</th>
                <th className="text-left p-2.5 min-w-[160px]">Name</th>
                <th className="text-left p-2.5 min-w-[120px]">Stage</th>
                <th className="text-left p-2.5 min-w-[220px]">Lead Status</th>
                <th className="text-center p-2.5 min-w-[90px]">Pre-call vid</th>
                {qualExpanded ? (
                  APP_COLS.map((c, i) => (
                    <th key={c.key} className={`text-left p-2.5 normal-case ${c.width ?? ""}`}>
                      {i === 0 ? <ColumnGroupToggle label={c.label} expanded onToggle={() => setQualExpanded(false)} /> : c.label}
                    </th>
                  ))
                ) : (
                  <th className="text-left p-2.5 min-w-[140px] normal-case">
                    <ColumnGroupToggle label="Qualification" expanded={false} onToggle={() => setQualExpanded(true)} />
                  </th>
                )}
                <th className="text-left p-2.5 min-w-[140px]">Contact</th>
                <th className="text-left p-2.5 min-w-[130px]">Handle</th>
              </tr>
            </thead>
            <tbody>
              {paged.map(l => {
                const t = tone(l.status);
                const app = l.application_data ?? {};
                const isDiamond = l.priority === "diamond" || l.pipeline_stage === "diamond";
                return (
                  <tr key={l.id} className={`border-t border-border cursor-pointer transition-colors ${isDiamond ? "bg-accent/5 hover:bg-accent/10" : (t.row || "hover:bg-muted/30")}`} onClick={() => setSelected(l)}>
                    <td className="p-2.5 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(l.created_at).toLocaleDateString()}<br />
                      <span className="text-3xs">{new Date(l.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                    </td>
                    <td className="p-2.5" onClick={(e) => e.stopPropagation()}>
                      <select
                        value={l.priority ?? "normal"}
                        onChange={(e) => updateLead.mutate({ id: l.id, patch: { priority: e.target.value } })}
                        className="h-7 rounded px-1 text-2xs bg-transparent border border-border cursor-pointer"
                        title="Priority"
                      >
                        {PRIORITY_OPTIONS.map(p => <option key={p.v} value={p.v}>{p.label}</option>)}
                      </select>
                    </td>
                    <td className="p-2.5">
                      <div className="font-medium flex items-center gap-1.5">
                        {isDiamond && <Gem className="h-3.5 w-3.5 text-accent shrink-0" />}
                        {l.full_name || l.handle || l.email || "(no name)"}
                      </div>
                    </td>
                    <td className="p-2.5" onClick={(e) => e.stopPropagation()}>
                      <select
                        value={l.pipeline_stage ?? ""}
                        onChange={(e) => updateLead.mutate({ id: l.id, patch: { pipeline_stage: e.target.value || null } })}
                        className={`h-7 rounded px-2 text-2xs font-medium border-0 cursor-pointer ${stageChip(l.pipeline_stage)}`}
                      >
                        {PIPELINE_STAGES.map(s => <option key={s.v} value={s.v}>{s.label}</option>)}
                      </select>
                    </td>
                    <td className="p-2.5" onClick={(e) => e.stopPropagation()}>
                      <select
                        value={l.status}
                        onChange={(e) => updateLead.mutate({ id: l.id, patch: { status: e.target.value } })}
                        className={`h-7 rounded px-2 text-2xs font-medium border-0 cursor-pointer ${t.chip}`}
                      >
                        {STATUS_OPTIONS.map(s => <option key={s.v} value={s.v}>{s.label}</option>)}
                      </select>
                    </td>
                    <td className="p-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => updateLead.mutate({ id: l.id, patch: { precall_video_watched: !l.precall_video_watched } })}
                        className={`h-7 w-12 rounded text-3xs font-semibold uppercase tracking-wider transition-colors ${l.precall_video_watched ? CHIP_TONE_CLASSES.success : "bg-muted text-muted-foreground hover:bg-muted/70"}`}
                        title={l.precall_video_watched ? "Watched" : "Mark as watched"}
                      >
                        {l.precall_video_watched ? "✓ Yes" : "No"}
                      </button>
                    </td>
                    {qualExpanded ? (
                      APP_COLS.map(c => (
                        <td key={c.key} className="p-2.5 text-xs">
                          <div className="truncate max-w-[200px]" title={app[c.key] ?? ""}>{app[c.key] ?? <span className="text-muted-foreground/50">—</span>}</div>
                        </td>
                      ))
                    ) : (
                      <td className="p-2.5 text-xs text-muted-foreground font-mono">
                        {APP_COLS.filter(c => app[c.key]).length}/{APP_COLS.length} filled
                      </td>
                    )}
                    <td className="p-2.5 text-xs text-muted-foreground">
                      {l.email ?? l.phone ?? "—"}
                    </td>
                    <td className="p-2.5 text-xs">{l.handle ? <span className="text-accent">@{l.handle.replace(/^@/, "")}</span> : <span className="text-muted-foreground/50">—</span>}</td>
                  </tr>
                );
              })}
              {leadsLoading && <tr><td colSpan={6 + (qualExpanded ? APP_COLS.length : 1) + 2} className="p-10 text-center text-sm text-muted-foreground">Loading…</td></tr>}
              {!leadsLoading && view.length === 0 && <tr><td colSpan={6 + (qualExpanded ? APP_COLS.length : 1) + 2} className="p-10 text-center text-sm text-muted-foreground">No leads match.</td></tr>}
            </tbody>
          </table>
        </GlassTableShell>

        <Dialog open={!!selected} onOpenChange={(o) => { if (!o) setSelected(null); }}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{selected?.full_name || selected?.handle || selected?.email || "Lead"}</DialogTitle></DialogHeader>
            {selected && <LeadDetail lead={selected} />}
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}

function LeadsFunnelHero({ funnel }: { funnel: readonly { stage: string; value: number; spectrum: "cold" | "mid" | "hot" }[] }) {
  const max = funnel[0]?.value || 1;
  return (
    <div className="hover-lift relative flex h-full flex-col justify-between overflow-hidden rounded-2xl border border-border bg-card p-5">
      <div className="glass-highlight pointer-events-none absolute inset-0 rounded-2xl" />
      <div className="relative">
        <div className="text-3xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Pipeline Funnel</div>
        <div className="display-serif mt-0.5 text-2xl">Where leads convert</div>
      </div>
      <div className="relative flex flex-1 flex-col justify-center gap-3 py-3">
        {funnel.map((f, i) => {
          const width = Math.max(6, Math.round((f.value / max) * 100));
          const prev = funnel[i - 1];
          const conv = prev && prev.value > 0 ? `${((f.value / prev.value) * 100).toFixed(0)}%` : null;
          return (
            <div key={f.stage} className="space-y-1">
              <div className="flex items-center justify-between text-2xs">
                <span className="font-medium">{f.stage}</span>
                <span className="font-mono text-muted-foreground">
                  {f.value.toLocaleString()}
                  {conv && <span className={cn("ml-1.5", SPECTRUM_TEXT_CLASS[f.spectrum])}>· {conv}</span>}
                </span>
              </div>
              <div className="h-7 rounded-md bg-muted/30 overflow-hidden">
                <motion.div
                  className="h-full rounded-md"
                  style={{ background: SPECTRUM_VAR[f.spectrum] }}
                  initial={{ width: 0 }}
                  animate={{ width: `${width}%` }}
                  transition={{ duration: 0.6, delay: i * 0.15, ease: EASE.out }}
                />
              </div>
            </div>
          );
        })}
        {funnel.every(f => f.value === 0) && (
          <div className="py-4 text-center text-xs text-muted-foreground">No leads yet — the funnel fills in as leads come through.</div>
        )}
      </div>
    </div>
  );
}

function LeadDetail({ lead }: { lead: LeadRow }) {
  const { data: org } = useCurrentOrg();
  const { user } = useAuth();
  const orgId = org?.org_id;
  const qc = useQueryClient();
  const [noteDraft, setNoteDraft] = useState("");

  const { data: timeline } = useQuery({
    queryKey: ["lead-timeline", lead.id],
    enabled: !!orgId,
    queryFn: async () => {
      const [touches, calls, convs] = await Promise.all([
        supabase.from("lead_content_touches").select("id, touch_type, touched_at, content_id, content_pieces!inner(title, platform)").eq("lead_id", lead.id).eq("org_id", orgId!).order("touched_at", { ascending: false }).limit(50),
        supabase.from("calls").select("id, status, scheduled_for, showed, closed, cash_collected_cents, call_summary").eq("lead_id", lead.id).eq("org_id", orgId!).order("scheduled_for", { ascending: false }).limit(20),
        supabase.from("conversations").select("id, channel, status, last_message_at, first_response_seconds").eq("lead_id", lead.id).eq("org_id", orgId!).limit(10),
      ]);
      if (touches.error) throw touches.error;
      if (calls.error) throw calls.error;
      if (convs.error) throw convs.error;
      return { touches: touches.data ?? [], calls: calls.data ?? [], convs: convs.data ?? [] };
    },
  });

  const { data: notes } = useQuery({
    queryKey: ["lead-notes", lead.id],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("lead_notes").select("id, body, kind, created_at, author_id").eq("lead_id", lead.id).order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  const addNote = useMutation({
    mutationFn: async (body: string) => {
      const { error } = await (supabase as any).from("lead_notes").insert({ org_id: orgId!, lead_id: lead.id, body, author_id: user?.id ?? null });
      if (error) throw error;
    },
    onSuccess: () => { setNoteDraft(""); qc.invalidateQueries({ queryKey: ["lead-notes", lead.id] }); toast.success("Note added"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const totalCash = (timeline?.calls ?? []).reduce((s, c) => s + (c.cash_collected_cents ?? 0), 0);
  const app = lead.application_data ?? {};

  return (
    <Tabs defaultValue="application" className="space-y-3">
      <TabsList>
        <TabsTrigger value="application">Application</TabsTrigger>
        <TabsTrigger value="notes">Notes / Activity</TabsTrigger>
        <TabsTrigger value="timeline">Timeline</TabsTrigger>
      </TabsList>

      <TabsContent value="application" className="space-y-3">
        <div className="grid grid-cols-2 gap-3 rounded-md bg-muted/30 p-3 text-xs">
          <div><span className="text-muted-foreground">Email:</span> {lead.email ?? "—"}</div>
          <div><span className="text-muted-foreground">Phone:</span> {lead.phone ?? "—"}</div>
          <div><span className="text-muted-foreground">Handle:</span> {lead.handle ?? "—"}</div>
          <div><span className="text-muted-foreground">Source:</span> {lead.source_connector ?? "—"}</div>
        </div>
        <div className="rounded border border-border divide-y divide-border text-xs">
          {APP_COLS.map(c => (
            <div key={c.key} className="p-2.5 grid grid-cols-3 gap-2">
              <div className="text-muted-foreground uppercase text-3xs tracking-wider">{c.label}</div>
              <div className="col-span-2">{app[c.key] || <span className="text-muted-foreground/50">—</span>}</div>
            </div>
          ))}
        </div>
      </TabsContent>

      <TabsContent value="notes" className="space-y-3">
        <div className="space-y-2">
          <Textarea
            placeholder="Log what happened on the call, follow-up context, anything the next person needs to know…"
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            className="min-h-[80px]"
          />
          <Button size="sm" onClick={() => noteDraft.trim() && addNote.mutate(noteDraft.trim())} disabled={!noteDraft.trim() || addNote.isPending}>
            <StickyNote className="h-3.5 w-3.5 mr-1.5" /> Add note
          </Button>
        </div>
        <div className="space-y-2">
          {(notes ?? []).map((n: any) => (
            <div key={n.id} className="rounded border border-border bg-card p-3 text-xs">
              <div className="flex items-center justify-between mb-1">
                <span className="text-3xs uppercase tracking-wider text-muted-foreground">{n.kind ?? "note"}</span>
                <span className="text-3xs text-muted-foreground">{new Date(n.created_at).toLocaleString()}</span>
              </div>
              <div className="whitespace-pre-wrap">{n.body}</div>
            </div>
          ))}
          {(!notes || notes.length === 0) && <div className="text-xs text-muted-foreground italic">No notes yet — be the first to log context.</div>}
        </div>
      </TabsContent>

      <TabsContent value="timeline" className="space-y-3">
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="rounded border border-border p-2 text-center"><Film className="h-3 w-3 mx-auto text-accent mb-1" /><div className="font-mono font-bold">{timeline?.touches.length ?? 0}</div><div className="text-3xs text-muted-foreground">content touches</div></div>
          <div className="rounded border border-border p-2 text-center"><MessageSquare className="h-3 w-3 mx-auto text-primary mb-1" /><div className="font-mono font-bold">{timeline?.convs.length ?? 0}</div><div className="text-3xs text-muted-foreground">conversations</div></div>
          <div className="rounded border border-border p-2 text-center"><PhoneCall className="h-3 w-3 mx-auto text-emerald-500 mb-1" /><div className="font-mono font-bold">{timeline?.calls.length ?? 0}</div><div className="text-3xs text-muted-foreground">calls · ${Math.round(totalCash / 100).toLocaleString()}</div></div>
        </div>

        <div>
          <div className="text-3xs uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5"><Film className="h-3 w-3" /> Content path (first → last)</div>
          <div className="space-y-1.5">
            {(timeline?.touches ?? []).map((t: any) => {
              const cp = Array.isArray(t.content_pieces) ? t.content_pieces[0] : t.content_pieces;
              return (
                <div key={t.id} className="flex items-center gap-2 text-xs">
                  <div className="h-1.5 w-1.5 rounded-full bg-accent shrink-0" />
                  <div className="flex-1 truncate">{cp?.title || "(untitled)"} <span className="text-muted-foreground">· {cp?.platform}</span></div>
                  <div className="text-3xs text-muted-foreground">{t.touch_type} · {new Date(t.touched_at).toLocaleDateString()}</div>
                </div>
              );
            })}
            {(timeline?.touches ?? []).length === 0 && <div className="text-xs text-muted-foreground italic">No content touches tracked.</div>}
          </div>
        </div>

        <div>
          <div className="text-3xs uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5"><PhoneCall className="h-3 w-3" /> Calls</div>
          <div className="space-y-1.5">
            {(timeline?.calls ?? []).map((c: any) => (
              <div key={c.id} className="rounded border border-border p-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-medium uppercase text-3xs">{c.status}</span>
                  <span className="font-mono text-emerald-500">${Math.round((c.cash_collected_cents ?? 0) / 100).toLocaleString()}</span>
                </div>
                {c.call_summary && <div className="mt-1 text-muted-foreground line-clamp-2">{c.call_summary}</div>}
                <div className="text-3xs text-muted-foreground mt-1">{c.scheduled_for ? new Date(c.scheduled_for).toLocaleString() : "no date"}</div>
              </div>
            ))}
            {(timeline?.calls ?? []).length === 0 && <div className="text-xs text-muted-foreground italic">No calls yet.</div>}
          </div>
        </div>
      </TabsContent>
    </Tabs>
  );
}

function LeadInsightsPanel({ orgId }: { orgId?: string }) {
  const run = useServerFn(analyzeLeads);
  const { devBypass } = useAuth();
  const [data, setData] = useState<{ bottlenecks: any[]; double_down: any[]; priority_leads: any[]; sampleSize: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState<"1d" | "3d" | "7d" | "30d" | "all">("30d");

  const generate = async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      if (devBypass) { setData(await withMockDelay(mockLeadInsights())); return; }
      const now = new Date();
      const days: Record<string, number | null> = { "1d": 1, "3d": 3, "7d": 7, "30d": 30, "all": null };
      const d = days[range];
      const from = d ? new Date(now.getTime() - d * 86400000).toISOString() : undefined;
      const out = await run({ data: { orgId, from, to: now.toISOString() } });
      setData(out as any);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-lg border border-accent/30 bg-gradient-to-br from-accent/5 to-transparent p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-accent" />
          <div>
            <div className="text-sm font-semibold">Lead AI Insights</div>
            <div className="text-2xs text-muted-foreground">Bottlenecks, double-downs, and today's diamond leads</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select value={range} onChange={(e) => { setRange(e.target.value as any); setData(null); }} className="h-8 rounded border border-input bg-background px-2 text-xs">
            <option value="1d">Last 24h</option>
            <option value="3d">Last 3 days</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="all">All time</option>
          </select>
          <Button size="sm" onClick={generate} disabled={loading || !orgId}>
            {loading ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Analyzing…</> : <><Sparkles className="h-3.5 w-3.5 mr-1.5" /> Generate</>}
          </Button>
        </div>
      </div>
      {!data && !loading && (
        <div className="text-xs text-muted-foreground italic">Pick a window and hit Generate to surface bottlenecks, double-downs, and today's priority leads.</div>
      )}
      {data && (
        <div className="grid md:grid-cols-3 gap-3 animate-in fade-in-0 slide-in-from-top-1 duration-300">
          <div className="rounded border border-destructive/30 bg-destructive/5 p-3 space-y-2">
            <div className="text-3xs uppercase tracking-wider text-destructive font-semibold flex items-center gap-1.5"><AlertTriangle className="h-3 w-3" /> Bottlenecks</div>
            {data.bottlenecks.map((b, i) => (
              <div key={i} className="text-xs space-y-0.5">
                <div className="font-medium">{b.title}</div>
                <div className="text-muted-foreground">{b.body}</div>
                <div className="text-accent text-2xs">→ {b.recommendation}</div>
              </div>
            ))}
          </div>
          <div className="rounded border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-2">
            <div className="text-3xs uppercase tracking-wider text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1.5"><TrendingUp className="h-3 w-3" /> Double down</div>
            {data.double_down.map((b, i) => (
              <div key={i} className="text-xs space-y-0.5">
                <div className="font-medium">{b.title}</div>
                <div className="text-muted-foreground">{b.body}</div>
                <div className="text-accent text-2xs">→ {b.recommendation}</div>
              </div>
            ))}
          </div>
          <div className="rounded border border-accent/30 bg-accent/5 p-3 space-y-2">
            <div className="text-3xs uppercase tracking-wider text-accent font-semibold flex items-center gap-1.5"><Gem className="h-3 w-3" /> Priority leads</div>
            {data.priority_leads.map((p, i) => (
              <div key={i} className="text-xs space-y-0.5">
                <div className="font-medium">💎 {p.name}</div>
                <div className="text-muted-foreground">{p.reason}</div>
              </div>
            ))}
            {data.priority_leads.length === 0 && <div className="text-xs text-muted-foreground italic">No standout leads yet.</div>}
          </div>
        </div>
      )}
      {data && <div className="text-3xs text-muted-foreground">Based on {data.sampleSize} lead{data.sampleSize === 1 ? "" : "s"}.</div>}
    </div>
  );
}
