import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useCurrentOrg } from "@/hooks/use-auth";
import { mockLoomGrade, withMockDelay } from "@/lib/dev-mock-data";
import { TopBar } from "@/components/app-sidebar";
import { StatCard } from "@/components/stat-card";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, Search, Users, Star, Trash2, Pencil, CheckSquare, Square, Video, Sparkles, Loader2, DollarSign, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { gradeLoomFn } from "@/lib/hiring.functions";
import { KanbanBoard } from "@/components/kanban-board";
import { CHIP_TONE_CLASSES, type ChipTone } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/hiring")({ component: Hiring });

const STAGES = [
  { key: "applied", label: "Applied", tone: "default" },
  { key: "needs_grading", label: "Needs Grading", tone: "warning" },
  { key: "interview_worthy", label: "Interview Worthy", tone: "info" },
  { key: "trial_call", label: "Trial Call", tone: "info" },
  { key: "offer_sent", label: "Offer Sent", tone: "warning" },
  { key: "hired", label: "Hired", tone: "success" },
  { key: "rejected", label: "Rejected", tone: "destructive" },
] as const satisfies { key: string; label: string; tone: ChipTone }[];
type Stage = typeof STAGES[number]["key"];

const ROLES = ["setter", "closer", "dialer"] as const;
const ROLE_TABS: { key: typeof ROLES[number]; label: string }[] = [
  { key: "closer", label: "Closer" },
  { key: "setter", label: "Setter" },
  { key: "dialer", label: "Dialer" },
];
const fmtMoney = (cents: number) => `$${Math.round(cents / 100).toLocaleString()}`;

type Applicant = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  role_applied: string;
  stage: string;
  ai_score: number | null;
  ai_reasoning: string | null;
  source: string | null;
  years_experience: number | null;
  niche: string | null;
  notes: string | null;
  last_shown_at: string | null;
  applied_at: string;
  loom_url?: string | null;
  loom_transcript?: string | null;
  ai_recommended_stage?: string | null;
  ai_transcript_summary?: string | null;
  ai_stated_role?: string | null;
  historical_cash_collected_cents?: number | null;
  recent_monthly_cash_collected_cents?: number | null;
};

// Heuristic AI-style scorer. Replace with Lovable AI call later if desired.
function scoreApplicant(a: { years_experience?: number | null; niche?: string | null; role_applied?: string | null; notes?: string | null }): { score: number; reasoning: string } {
  let score = 5;
  const r: string[] = [];
  const yrs = Number(a.years_experience ?? 0);
  if (yrs >= 5) { score += 2.5; r.push(`${yrs}y experience (strong)`); }
  else if (yrs >= 2) { score += 1.5; r.push(`${yrs}y experience (solid)`); }
  else if (yrs >= 1) { score += 0.5; r.push(`${yrs}y experience (entry)`); }
  else r.push("limited experience");
  const niche = (a.niche || "").toLowerCase();
  if (/coach|info|course|consult|agency|saas/.test(niche)) { score += 1.5; r.push("niche fit"); }
  const notes = (a.notes || "").toLowerCase();
  if (/closed|quota|commission|hit|exceed/.test(notes)) { score += 1; r.push("perf signals in notes"); }
  if (/remote|full.?time|available/.test(notes)) { score += 0.5; r.push("availability"); }
  score = Math.max(0, Math.min(10, score));
  return { score: Math.round(score * 10) / 10, reasoning: r.join(" · ") };
}

function Hiring() {
  const { data: org } = useCurrentOrg();
  const orgId = org?.org_id;
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Applicant | null>(null);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<typeof ROLES[number]>("closer");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { data: applicants } = useQuery({
    queryKey: ["hiring", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from("hiring_applicants").select("*").eq("org_id", orgId!).order("applied_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Applicant[];
    },
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (applicants ?? []).filter(a => {
      if (!q) return true;
      return [a.full_name, a.email, a.niche, a.source, a.notes].some(v => (v ?? "").toLowerCase().includes(q));
    });
  }, [applicants, query]);

  const byStageFor = (role: string) => {
    const m = new Map<Stage, Applicant[]>();
    STAGES.forEach(s => m.set(s.key, []));
    for (const a of filtered) {
      if (a.role_applied !== role) continue;
      const s = (STAGES.find(x => x.key === a.stage)?.key) ?? "applied";
      m.get(s)!.push(a);
    }
    return m;
  };

  const create = useMutation({
    mutationFn: async (f: FormData) => {
      const draft = {
        full_name: String(f.get("full_name") || ""),
        email: String(f.get("email") || "") || null,
        phone: String(f.get("phone") || "") || null,
        role_applied: String(f.get("role_applied") || "setter"),
        source: String(f.get("source") || "") || null,
        niche: String(f.get("niche") || "") || null,
        years_experience: Number(f.get("years_experience") || 0) || null,
        notes: String(f.get("notes") || "") || null,
      };
      const { score, reasoning } = scoreApplicant(draft);
      const stage: Stage = score >= 7.5 ? "interview_worthy" : score >= 5 ? "needs_grading" : "applied";
      const { error } = await supabase.from("hiring_applicants").insert({ org_id: orgId!, ...draft, ai_score: score, ai_reasoning: reasoning, stage });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Applicant added · auto-scored"); qc.invalidateQueries({ queryKey: ["hiring"] }); setOpen(false); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Applicant> }) => {
      const { error } = await supabase.from("hiring_applicants").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["hiring"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const bulkMove = useMutation({
    mutationFn: async ({ ids, stage }: { ids: string[]; stage: Stage }) => {
      const { error } = await supabase.from("hiring_applicants").update({ stage, last_shown_at: new Date().toISOString() }).in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Updated"); setSelectedIds(new Set()); qc.invalidateQueries({ queryKey: ["hiring"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to update"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("hiring_applicants").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Removed"); setEditing(null); qc.invalidateQueries({ queryKey: ["hiring"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to remove"),
  });

  const toggleSel = (id: string) => {
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const total = applicants?.length ?? 0;
  const hired = applicants?.filter(a => a.stage === "hired").length ?? 0;
  const interviewWorthy = applicants?.filter(a => a.stage === "interview_worthy" || a.stage === "trial_call").length ?? 0;
  const avgScore = applicants?.length ? (applicants.reduce((s,a) => s + Number(a.ai_score ?? 0), 0) / applicants.length) : 0;

  return (
    <>
      <TopBar title="Sales Team Hiring" subtitle="Applicant pipeline · AI-scored · drag to move stages" />
      <div className="p-6 space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Total applicants" value={total} icon={<Users className="h-4 w-4" />} accent="accent" />
          <StatCard label="Interview / Trial" value={interviewWorthy} accent="primary" />
          <StatCard label="Hired" value={hired} accent="success" />
          <StatCard label="Avg AI score" value={avgScore.toFixed(1)} icon={<Star className="h-4 w-4" />} accent={avgScore >= 7 ? "success" : "warning"} />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search by name, email, niche, notes…" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-8 h-9" />
          </div>
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-1.5 rounded-md border border-border bg-muted/30 px-2 py-1">
              <span className="text-xs text-muted-foreground">{selectedIds.size} selected</span>
              <Select onValueChange={(v) => bulkMove.mutate({ ids: Array.from(selectedIds), stage: v as Stage })}>
                <SelectTrigger className="h-7 w-40 text-xs"><SelectValue placeholder="Move to…" /></SelectTrigger>
                <SelectContent>{STAGES.map(s => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          <div className="ml-auto">
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4" />Add applicant</Button></DialogTrigger>
              <DialogContent className="max-h-[90vh] overflow-y-auto">
                <DialogHeader><DialogTitle>New applicant</DialogTitle></DialogHeader>
                <ApplicantForm onSubmit={(f) => create.mutate(f)} pending={create.isPending} />
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <Tabs value={tab} onValueChange={(v) => { setTab(v as typeof ROLES[number]); setSelectedIds(new Set()); }}>
          <TabsList>
            {ROLE_TABS.map(t => {
              const roleApplicants = (applicants ?? []).filter(a => a.role_applied === t.key);
              return <TabsTrigger key={t.key} value={t.key}>{t.label} · {roleApplicants.length}</TabsTrigger>;
            })}
          </TabsList>
          {ROLE_TABS.map(t => {
            const roleApplicants = filtered.filter(a => a.role_applied === t.key);
            const roleAvg = roleApplicants.length ? roleApplicants.reduce((s, a) => s + Number(a.ai_score ?? 0), 0) / roleApplicants.length : 0;
            const roleHired = roleApplicants.filter(a => a.stage === "hired").length;
            return (
              <TabsContent key={t.key} value={t.key} className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <StatCard label={`${t.label}s in pipeline`} value={roleApplicants.length} icon={<Users className="h-4 w-4" />} accent="accent" />
                  <StatCard label="Hired" value={roleHired} accent="success" />
                  <StatCard label="Avg transcript-quality score" value={roleAvg.toFixed(1)} icon={<Star className="h-4 w-4" />} accent={roleAvg >= 7 ? "success" : "warning"} />
                </div>
                <KanbanBoard
                  columns={STAGES.map(s => ({ key: s.key, label: s.label, tone: s.tone }))}
                  itemsByColumn={byStageFor(t.key)}
                  onDropItem={(id, stage) => update.mutate({ id, patch: { stage: stage as Stage, last_shown_at: new Date().toISOString() } })}
                  renderCard={(a) => {
                    const sel = selectedIds.has(a.id);
                    const scoreTone: ChipTone = Number(a.ai_score ?? 0) >= 8 ? "success" : Number(a.ai_score ?? 0) >= 6 ? "warning" : "default";
                    const roleMismatch = a.ai_stated_role && a.ai_stated_role !== a.role_applied;
                    return (
                      <div className={sel ? "-m-2 rounded-md border border-primary p-2" : ""}>
                        <div className="flex items-start justify-between gap-2">
                          <button onClick={() => toggleSel(a.id)} className="mt-0.5 text-muted-foreground hover:text-foreground">
                            {sel ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
                          </button>
                          <div className="flex-1 min-w-0">
                            <button onClick={() => setEditing(a)} className="text-left w-full">
                              <div className="font-medium text-sm leading-tight truncate">{a.full_name}</div>
                              <div className="text-3xs text-muted-foreground capitalize">{a.role_applied} · {a.niche ?? "—"}</div>
                            </button>
                          </div>
                          <span className={`text-2xs font-mono font-semibold rounded px-1.5 py-0.5 ${CHIP_TONE_CLASSES[scoreTone]}`}>
                            {a.ai_score?.toFixed(1) ?? "—"}
                          </span>
                        </div>
                        {(a.recent_monthly_cash_collected_cents || a.historical_cash_collected_cents) && (
                          <div className="mt-1 flex items-center gap-1 text-3xs text-[color:var(--color-success)]">
                            <DollarSign className="h-3 w-3" />
                            {a.recent_monthly_cash_collected_cents ? `${fmtMoney(a.recent_monthly_cash_collected_cents)}/mo recent` : ""}
                            {a.recent_monthly_cash_collected_cents && a.historical_cash_collected_cents ? " · " : ""}
                            {a.historical_cash_collected_cents ? `${fmtMoney(a.historical_cash_collected_cents)} lifetime` : ""}
                          </div>
                        )}
                        {roleMismatch && (
                          <div className="mt-1 flex items-center gap-1 text-3xs text-[color:var(--color-warning)]">
                            <AlertTriangle className="h-3 w-3" /> AI heard "{a.ai_stated_role}" on video
                          </div>
                        )}
                        <div className="mt-1.5 flex items-center justify-between text-3xs text-muted-foreground">
                          <span>Applied {new Date(a.applied_at).toLocaleDateString()}</span>
                          {a.last_shown_at && <span>Moved {new Date(a.last_shown_at).toLocaleDateString()}</span>}
                        </div>
                      </div>
                    );
                  }}
                />
              </TabsContent>
            );
          })}
        </Tabs>

        <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle className="flex items-center gap-2"><Pencil className="h-4 w-4" /> {editing?.full_name}</DialogTitle></DialogHeader>
            {editing && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div><span className="text-muted-foreground">Email:</span> {editing.email ?? "—"}</div>
                  <div><span className="text-muted-foreground">Phone:</span> {editing.phone ?? "—"}</div>
                  <div><span className="text-muted-foreground">Experience:</span> {editing.years_experience ?? "—"}y</div>
                  <div><span className="text-muted-foreground">Niche:</span> {editing.niche ?? "—"}</div>
                  <div><span className="text-muted-foreground">Source:</span> {editing.source ?? "—"}</div>
                </div>

                {(editing.historical_cash_collected_cents || editing.recent_monthly_cash_collected_cents) && (
                  <div className="rounded-md border border-[color:var(--color-success)]/30 bg-[color:var(--color-success)]/5 p-3 grid grid-cols-2 gap-3 text-xs">
                    <div><span className="text-muted-foreground">Recent monthly cash (stated)</span><div className="font-mono text-sm text-[color:var(--color-success)]">{editing.recent_monthly_cash_collected_cents ? fmtMoney(editing.recent_monthly_cash_collected_cents) : "—"}</div></div>
                    <div><span className="text-muted-foreground">Historical cash (stated)</span><div className="font-mono text-sm text-[color:var(--color-success)]">{editing.historical_cash_collected_cents ? fmtMoney(editing.historical_cash_collected_cents) : "—"}</div></div>
                  </div>
                )}

                <div className="rounded-md border border-border bg-muted/20 p-3">
                  <div className="text-2xs uppercase tracking-wider text-muted-foreground mb-1">Transcript quality · {editing.ai_score?.toFixed(1) ?? "—"}/10</div>
                  <div className="text-xs">{editing.ai_reasoning ?? "No reasoning yet — grade the video below."}</div>
                  {editing.ai_transcript_summary && (
                    <p className="mt-2 border-t border-border pt-2 text-xs leading-relaxed text-muted-foreground">{editing.ai_transcript_summary}</p>
                  )}
                  {editing.ai_recommended_stage && (
                    <div className="mt-2 flex items-center gap-2 text-2xs">
                      <span className="text-muted-foreground">AI recommends</span>
                      <span className="rounded bg-primary/15 px-1.5 py-0.5 font-semibold uppercase tracking-wider text-primary">
                        {STAGES.find(s => s.key === editing.ai_recommended_stage)?.label ?? editing.ai_recommended_stage}
                      </span>
                      {editing.stage !== editing.ai_recommended_stage && (
                        <Button size="sm" variant="outline" className="h-6 text-3xs"
                          onClick={() => update.mutate({ id: editing.id, patch: { stage: editing.ai_recommended_stage as string, last_shown_at: new Date().toISOString() } })}>
                          Apply
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                <LoomGrader applicant={editing} onGraded={() => { qc.invalidateQueries({ queryKey: ["hiring"] }); setEditing(null); }} />

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Role applied for</Label>
                    <Select value={editing.role_applied} onValueChange={(v) => { update.mutate({ id: editing.id, patch: { role_applied: v } }); setEditing({ ...editing, role_applied: v }); }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                    </Select>
                    {editing.ai_stated_role && editing.ai_stated_role !== editing.role_applied && (
                      <div className="flex items-center gap-1.5 text-3xs text-[color:var(--color-warning)]">
                        <AlertTriangle className="h-3 w-3" /> AI heard "{editing.ai_stated_role}" on video
                        <Button size="sm" variant="outline" className="h-5 text-4xs px-1.5"
                          onClick={() => { const r = editing.ai_stated_role as string; update.mutate({ id: editing.id, patch: { role_applied: r } }); setEditing({ ...editing, role_applied: r }); }}>
                          Use this
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Stage</Label>
                    <Select value={editing.stage} onValueChange={(v) => update.mutate({ id: editing.id, patch: { stage: v, last_shown_at: new Date().toISOString() } })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{STAGES.map(s => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Recruiter notes</Label>
                  <Textarea rows={4} defaultValue={editing.notes ?? ""} onBlur={(e) => { if (e.target.value !== (editing.notes ?? "")) update.mutate({ id: editing.id, patch: { notes: e.target.value } }); }} />
                </div>
                <div className="flex justify-between pt-2">
                  <Button variant="destructive" size="sm" onClick={() => remove.mutate(editing.id)}><Trash2 className="h-3.5 w-3.5" /> Remove</Button>
                  <Button size="sm" variant="outline" onClick={() => setEditing(null)}>Close</Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}

function ApplicantForm({ onSubmit, pending }: { onSubmit: (f: FormData) => void; pending: boolean }) {
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); onSubmit(new FormData(e.currentTarget)); }}>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label>Full name</Label><Input name="full_name" required /></div>
        <div className="space-y-1.5"><Label>Email</Label><Input name="email" type="email" /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label>Phone</Label><Input name="phone" /></div>
        <div className="space-y-1.5"><Label>Role applied for</Label>
          <Select name="role_applied" defaultValue="setter">
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5"><Label>Years experience</Label><Input name="years_experience" type="number" step="0.5" min={0} /></div>
        <div className="space-y-1.5"><Label>Niche / vertical</Label><Input name="niche" placeholder="coaching, agency…" /></div>
        <div className="space-y-1.5"><Label>Source</Label><Input name="source" placeholder="LinkedIn / referral…" /></div>
      </div>
      <div className="space-y-1.5"><Label>Notes (perf signals, availability)</Label><Textarea name="notes" rows={3} /></div>
      <Button type="submit" className="w-full" disabled={pending}>{pending ? "Scoring…" : "Add & auto-score"}</Button>
    </form>
  );
}

/** AI watches the video application by reading its transcript, then routes the applicant. */
function LoomGrader({ applicant, onGraded }: { applicant: Applicant; onGraded: () => void }) {
  const grade = useServerFn(gradeLoomFn);
  const { devBypass } = useAuth();
  const [url, setUrl] = useState(applicant.loom_url ?? "");
  const [transcript, setTranscript] = useState(applicant.loom_transcript ?? "");

  const m = useMutation({
    mutationFn: async () => {
      if (devBypass) return withMockDelay(mockLoomGrade());
      return grade({ data: {
      applicant_id: applicant.id,
      loom_url: url.trim() || null,
      transcript: transcript.trim() || null,
    }});
    },
    onSuccess: (r) => { toast.success(`Graded ${r.score}/10 → ${r.stage.replace("_", " ")}`); onGraded(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="rounded-md border border-border p-3 space-y-2">
      <div className="flex items-center gap-1.5 text-2xs uppercase tracking-wider text-muted-foreground">
        <Video className="h-3.5 w-3.5" /> Video application
      </div>
      <Input placeholder="https://www.loom.com/share/…" value={url} onChange={(e) => setUrl(e.target.value)} />
      <Textarea rows={4} placeholder="Paste the Loom transcript here (Loom → … → Copy transcript). If left blank we'll try to read it from the share link."
        value={transcript} onChange={(e) => setTranscript(e.target.value)} />
      <div className="flex items-center gap-2">
        <Button size="sm" disabled={m.isPending || (!url.trim() && !transcript.trim())} onClick={() => m.mutate()}>
          {m.isPending ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Watching…</> : <><Sparkles className="h-3.5 w-3.5 mr-1.5" />Grade & route from video</>}
        </Button>
        {url.trim() && <a href={url} target="_blank" rel="noreferrer" className="text-2xs text-muted-foreground hover:text-foreground">Open Loom</a>}
      </div>
    </div>
  );
}
