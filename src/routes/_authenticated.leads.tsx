import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg, useAuth } from "@/hooks/use-auth";
import { TopBar } from "@/components/app-sidebar";
import { StatCard } from "@/components/stat-card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useMemo, useState } from "react";
import { Search, Users, MessageSquare, PhoneCall, Film, StickyNote, Gem, Sparkles, AlertTriangle, TrendingUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { analyzeLeads } from "@/lib/lead-insights.functions";

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

const PIPELINE_STAGES = [
  { v: "", label: "—" },
  { v: "cold", label: "Cold", chip: "bg-blue-500/15 text-blue-600 dark:text-blue-400" },
  { v: "warm", label: "Warm", chip: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  { v: "hot", label: "Hot", chip: "bg-orange-500/15 text-orange-600 dark:text-orange-400" },
  { v: "diamond", label: "💎 Diamond", chip: "bg-cyan-500/20 text-cyan-600 dark:text-cyan-300 font-semibold" },
];
const stageChip = (v: string | null) => PIPELINE_STAGES.find(s => s.v === (v ?? ""))?.chip ?? "bg-muted text-muted-foreground";

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

// Row tone + chip tone keyed off semantic tokens / utility colors
const STATUS_TONE: Record<string, { row: string; chip: string }> = {
  opt_in: { row: "", chip: "bg-muted text-muted-foreground" },
  call_booked: { row: "bg-amber-500/5 hover:bg-amber-500/10", chip: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  applied_qualified_no_book: { row: "bg-yellow-500/5", chip: "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400" },
  applied_unqualified_no_book: { row: "", chip: "bg-muted text-muted-foreground" },
  rescheduling: { row: "bg-amber-500/5", chip: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  no_show: { row: "bg-destructive/5", chip: "bg-destructive/15 text-destructive" },
  follow_up_short: { row: "bg-blue-500/5", chip: "bg-blue-500/15 text-blue-600 dark:text-blue-400" },
  follow_up_long: { row: "bg-indigo-500/5", chip: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400" },
  deposit: { row: "bg-emerald-500/5", chip: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  closed: { row: "bg-emerald-500/10 hover:bg-emerald-500/15", chip: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-semibold" },
  lt_closed: { row: "bg-emerald-500/10", chip: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-semibold" },
  no_close: { row: "bg-destructive/5", chip: "bg-destructive/15 text-destructive" },
  bad_fit: { row: "", chip: "bg-muted text-muted-foreground" },
  disqualified: { row: "", chip: "bg-muted text-muted-foreground" },
  cancelled: { row: "bg-destructive/5", chip: "bg-destructive/10 text-destructive" },
  ignore: { row: "opacity-50", chip: "bg-muted text-muted-foreground" },
};
const tone = (s: string) => STATUS_TONE[s] ?? STATUS_TONE.opt_in;

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

function Leads() {
  const { data: org } = useCurrentOrg();
  const orgId = org?.org_id;
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selected, setSelected] = useState<LeadRow | null>(null);

  const { data: leads } = useQuery({
    queryKey: ["leads", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("id, full_name, email, handle, phone, status, intent_score, engagement_score, estimated_close_probability, source_connector, first_touch_content_id, qualification_notes, application_data, notes, created_at")
        .eq("org_id", orgId!)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as LeadRow[];
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await (supabase as any).from("leads").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["leads", orgId] }); toast.success("Status updated"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const view = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (leads ?? []).filter(l => {
      if (statusFilter !== "all" && l.status !== statusFilter) return false;
      if (!q) return true;
      const hay = [l.full_name, l.email, l.handle, l.phone, l.notes, JSON.stringify(l.application_data ?? {})].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [leads, query, statusFilter]);

  const stats = useMemo(() => {
    const all = leads ?? [];
    return {
      total: all.length,
      booked: all.filter(l => l.status === "call_booked" || l.status === "rescheduling").length,
      closed: all.filter(l => l.status === "closed" || l.status === "lt_closed").length,
      followUp: all.filter(l => l.status === "follow_up_short" || l.status === "follow_up_long").length,
    };
  }, [leads]);

  return (
    <>
      <TopBar title="Leads CRM" subtitle="Full pipeline · application fields · notes" />
      <div className="p-6 space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Total leads" value={stats.total} icon={<Users className="h-4 w-4" />} />
          <StatCard label="Call booked" value={stats.booked} accent="warning" />
          <StatCard label="Closed" value={stats.closed} accent="success" />
          <StatCard label="Follow up" value={stats.followUp} accent="primary" />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search name, handle, application…" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-8 h-9" />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-xs">
            <option value="all">All statuses</option>
            {STATUS_OPTIONS.map(s => <option key={s.v} value={s.v}>{s.label}</option>)}
          </select>
          <div className="text-xs text-muted-foreground">{view.length} / {leads?.length ?? 0}</div>
        </div>

        <div className="rounded-lg border border-border bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground sticky top-0">
              <tr>
                <th className="text-left p-2.5 min-w-[110px]">Date / Time</th>
                <th className="text-left p-2.5 min-w-[160px]">Name</th>
                <th className="text-left p-2.5 min-w-[220px]">Lead Status</th>
                {APP_COLS.map(c => <th key={c.key} className={`text-left p-2.5 ${c.width ?? ""}`}>{c.label}</th>)}
                <th className="text-left p-2.5 min-w-[140px]">Contact</th>
                <th className="text-left p-2.5 min-w-[130px]">Handle</th>
              </tr>
            </thead>
            <tbody>
              {view.map(l => {
                const t = tone(l.status);
                const app = l.application_data ?? {};
                return (
                  <tr key={l.id} className={`border-t border-border cursor-pointer transition-colors ${t.row || "hover:bg-muted/30"}`} onClick={() => setSelected(l)}>
                    <td className="p-2.5 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(l.created_at).toLocaleDateString()}<br />
                      <span className="text-[10px]">{new Date(l.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                    </td>
                    <td className="p-2.5">
                      <div className="font-medium">{l.full_name || l.handle || l.email || "(no name)"}</div>
                    </td>
                    <td className="p-2.5" onClick={(e) => e.stopPropagation()}>
                      <select
                        value={l.status}
                        onChange={(e) => updateStatus.mutate({ id: l.id, status: e.target.value })}
                        className={`h-7 rounded px-2 text-[11px] font-medium border-0 cursor-pointer ${t.chip}`}
                      >
                        {STATUS_OPTIONS.map(s => <option key={s.v} value={s.v}>{s.label}</option>)}
                      </select>
                    </td>
                    {APP_COLS.map(c => (
                      <td key={c.key} className="p-2.5 text-xs">
                        <div className="truncate max-w-[200px]" title={app[c.key] ?? ""}>{app[c.key] ?? <span className="text-muted-foreground/50">—</span>}</div>
                      </td>
                    ))}
                    <td className="p-2.5 text-xs text-muted-foreground">
                      {l.email ?? l.phone ?? "—"}
                    </td>
                    <td className="p-2.5 text-xs">{l.handle ? <span className="text-accent">@{l.handle.replace(/^@/, "")}</span> : <span className="text-muted-foreground/50">—</span>}</td>
                  </tr>
                );
              })}
              {view.length === 0 && <tr><td colSpan={3 + APP_COLS.length + 2} className="p-10 text-center text-sm text-muted-foreground">No leads match.</td></tr>}
            </tbody>
          </table>
        </div>

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
      return { touches: touches.data ?? [], calls: calls.data ?? [], convs: convs.data ?? [] };
    },
  });

  const { data: notes } = useQuery({
    queryKey: ["lead-notes", lead.id],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await (supabase as any).from("lead_notes").select("id, body, kind, created_at, author_id").eq("lead_id", lead.id).order("created_at", { ascending: false }).limit(50);
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
              <div className="text-muted-foreground uppercase text-[10px] tracking-wider">{c.label}</div>
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
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{n.kind ?? "note"}</span>
                <span className="text-[10px] text-muted-foreground">{new Date(n.created_at).toLocaleString()}</span>
              </div>
              <div className="whitespace-pre-wrap">{n.body}</div>
            </div>
          ))}
          {(!notes || notes.length === 0) && <div className="text-xs text-muted-foreground italic">No notes yet — be the first to log context.</div>}
        </div>
      </TabsContent>

      <TabsContent value="timeline" className="space-y-3">
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="rounded border border-border p-2 text-center"><Film className="h-3 w-3 mx-auto text-accent mb-1" /><div className="font-mono font-bold">{timeline?.touches.length ?? 0}</div><div className="text-[10px] text-muted-foreground">content touches</div></div>
          <div className="rounded border border-border p-2 text-center"><MessageSquare className="h-3 w-3 mx-auto text-primary mb-1" /><div className="font-mono font-bold">{timeline?.convs.length ?? 0}</div><div className="text-[10px] text-muted-foreground">conversations</div></div>
          <div className="rounded border border-border p-2 text-center"><PhoneCall className="h-3 w-3 mx-auto text-emerald-500 mb-1" /><div className="font-mono font-bold">{timeline?.calls.length ?? 0}</div><div className="text-[10px] text-muted-foreground">calls · ${Math.round(totalCash / 100).toLocaleString()}</div></div>
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5"><Film className="h-3 w-3" /> Content path (first → last)</div>
          <div className="space-y-1.5">
            {(timeline?.touches ?? []).map((t: any) => {
              const cp = Array.isArray(t.content_pieces) ? t.content_pieces[0] : t.content_pieces;
              return (
                <div key={t.id} className="flex items-center gap-2 text-xs">
                  <div className="h-1.5 w-1.5 rounded-full bg-accent shrink-0" />
                  <div className="flex-1 truncate">{cp?.title || "(untitled)"} <span className="text-muted-foreground">· {cp?.platform}</span></div>
                  <div className="text-[10px] text-muted-foreground">{t.touch_type} · {new Date(t.touched_at).toLocaleDateString()}</div>
                </div>
              );
            })}
            {(timeline?.touches ?? []).length === 0 && <div className="text-xs text-muted-foreground italic">No content touches tracked.</div>}
          </div>
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5"><PhoneCall className="h-3 w-3" /> Calls</div>
          <div className="space-y-1.5">
            {(timeline?.calls ?? []).map((c: any) => (
              <div key={c.id} className="rounded border border-border p-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-medium uppercase text-[10px]">{c.status}</span>
                  <span className="font-mono text-emerald-500">${Math.round((c.cash_collected_cents ?? 0) / 100).toLocaleString()}</span>
                </div>
                {c.call_summary && <div className="mt-1 text-muted-foreground line-clamp-2">{c.call_summary}</div>}
                <div className="text-[10px] text-muted-foreground mt-1">{c.scheduled_for ? new Date(c.scheduled_for).toLocaleString() : "no date"}</div>
              </div>
            ))}
            {(timeline?.calls ?? []).length === 0 && <div className="text-xs text-muted-foreground italic">No calls yet.</div>}
          </div>
        </div>
      </TabsContent>
    </Tabs>
  );
}
