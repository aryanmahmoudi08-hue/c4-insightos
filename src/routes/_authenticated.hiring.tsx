import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useCurrentOrg } from "@/hooks/use-auth";
import { mockLoomGrade, withMockDelay } from "@/lib/dev-mock-data";
import { TopBar } from "@/components/app-sidebar";
import { StatCard } from "@/components/stat-card";
import { useState, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Plus,
  Search,
  Users,
  Star,
  Trash2,
  Pencil,
  CheckSquare,
  Square,
  Video,
  Sparkles,
  Loader2,
  DollarSign,
  AlertTriangle,
  Headphones,
  Link2,
  Upload,
  CalendarClock,
  PlayCircle,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { gradeLoomFn, recommendStageFromScore } from "@/lib/hiring.functions";
import { KanbanBoard } from "@/components/kanban-board";
import { CHIP_TONE_CLASSES, type ChipTone } from "@/components/ui/badge";
import { BentoGrid, BentoCell } from "@/components/bento-grid";
import { SPECTRUM_VAR, SPECTRUM_TEXT_CLASS, type SpectrumPosition } from "@/lib/spectrum";

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
type Stage = (typeof STAGES)[number]["key"];

const ROLES = ["setter", "closer", "dialer"] as const;
const ROLE_TABS: { key: (typeof ROLES)[number]; label: string }[] = [
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
  portfolio_url?: string | null;
  audio_url?: string | null;
  resume_url?: string | null;
};

// Heuristic AI-style scorer. Replace with Lovable AI call later if desired.
function scoreApplicant(a: {
  years_experience?: number | null;
  niche?: string | null;
  role_applied?: string | null;
  notes?: string | null;
}): { score: number; reasoning: string } {
  let score = 5;
  const r: string[] = [];
  const yrs = Number(a.years_experience ?? 0);
  if (yrs >= 5) {
    score += 2.5;
    r.push(`${yrs}y experience (strong)`);
  } else if (yrs >= 2) {
    score += 1.5;
    r.push(`${yrs}y experience (solid)`);
  } else if (yrs >= 1) {
    score += 0.5;
    r.push(`${yrs}y experience (entry)`);
  } else r.push("limited experience");
  const niche = (a.niche || "").toLowerCase();
  if (/coach|info|course|consult|agency|saas/.test(niche)) {
    score += 1.5;
    r.push("niche fit");
  }
  const notes = (a.notes || "").toLowerCase();
  if (/closed|quota|commission|hit|exceed/.test(notes)) {
    score += 1;
    r.push("perf signals in notes");
  }
  if (/remote|full.?time|available/.test(notes)) {
    score += 0.5;
    r.push("availability");
  }
  score = Math.max(0, Math.min(10, score));
  return { score: Math.round(score * 10) / 10, reasoning: r.join(" · ") };
}

type Flag = { label: string; positive: boolean };

/** AI evaluation drawer's green/red flags — derived from real structured fields
 * already on the applicant record (score, stated cash, experience, role match),
 * never parsed out of free-text reasoning (whose separator differs between the
 * heuristic scorer's " · " and the LLM grader's pipe-separated prose) and never
 * a new AI call shape — same discipline as everywhere else this app grounds an
 * AI-adjacent claim in a real computed number. */
function deriveFlags(a: Applicant): Flag[] {
  const flags: Flag[] = [];
  const score = Number(a.ai_score ?? 0);
  if (score > 0) {
    if (score >= 7) {
      flags.push({ label: `Strong transcript score (${score.toFixed(1)}/10)`, positive: true });
    } else if (score < 5) {
      flags.push({ label: `Weak transcript score (${score.toFixed(1)}/10)`, positive: false });
    }
  }
  if (a.ai_stated_role && a.ai_stated_role !== a.role_applied) {
    flags.push({
      label: `AI heard "${a.ai_stated_role}" on video, applied as ${a.role_applied}`,
      positive: false,
    });
  } else if (a.ai_stated_role) {
    flags.push({ label: "Stated role matches application", positive: true });
  }
  if ((a.years_experience ?? 0) >= 3) {
    flags.push({ label: `${a.years_experience}y experience`, positive: true });
  }
  if (a.historical_cash_collected_cents || a.recent_monthly_cash_collected_cents) {
    flags.push({ label: "Has a stated cash-collected track record", positive: true });
  }
  return flags;
}

function HiringFunnelHero({
  total,
  interviewWorthy,
  hired,
}: {
  total: number;
  interviewWorthy: number;
  hired: number;
}) {
  const stages: { label: string; value: number; spectrum: SpectrumPosition }[] = [
    { label: "Total Applicants", value: total, spectrum: "cold" },
    { label: "Interview / Trial", value: interviewWorthy, spectrum: "mid" },
    { label: "Hired", value: hired, spectrum: "hot" },
  ];
  const max = Math.max(1, stages[0].value);
  return (
    <div className="hover-lift relative flex h-full flex-col justify-between overflow-hidden rounded-2xl border border-border bg-card p-5">
      <div className="glass-highlight pointer-events-none absolute inset-0 rounded-2xl" />
      <div className="relative">
        <div className="text-3xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Hiring Pipeline
        </div>
        <div className="display-serif mt-0.5 text-2xl">Applicants to hires</div>
      </div>
      <div className="relative flex flex-1 flex-col justify-center gap-2.5 py-3">
        {stages.map((s, i) => {
          const width = Math.max(4, Math.round((s.value / max) * 100));
          const prev = stages[i - 1];
          const conv =
            prev && prev.value > 0 ? `${((s.value / prev.value) * 100).toFixed(0)}%` : null;
          return (
            <div key={s.label} className="space-y-1">
              <div className="flex items-center justify-between text-2xs">
                <span className="font-medium">{s.label}</span>
                <span className="font-mono text-muted-foreground">
                  {s.value}
                  {conv && (
                    <span className={`ml-1.5 ${SPECTRUM_TEXT_CLASS[s.spectrum]}`}>· {conv}</span>
                  )}
                </span>
              </div>
              <div className="h-2 rounded bg-muted/30 overflow-hidden">
                <div
                  className="h-full rounded transition-all duration-500"
                  style={{ width: `${width}%`, background: SPECTRUM_VAR[s.spectrum] }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Hiring() {
  const { data: org } = useCurrentOrg();
  const orgId = org?.org_id;
  const { devBypass } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Applicant | null>(null);
  const [aiEvalApplicant, setAiEvalApplicant] = useState<Applicant | null>(null);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<(typeof ROLES)[number]>("closer");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // devBypass has no real session, so reads succeed empty under RLS and writes
  // 401 — same rationale as team-calendar.tsx's mockCals/mockBlocks.
  const [mockApplicants, setMockApplicants] = useState<Applicant[]>([]);

  const { data: applicantsQuery } = useQuery({
    queryKey: ["hiring", orgId],
    enabled: !!orgId && !devBypass,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hiring_applicants")
        .select("*")
        .eq("org_id", orgId!)
        .order("applied_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Applicant[];
    },
  });
  const applicants = devBypass ? mockApplicants : applicantsQuery;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (applicants ?? []).filter((a) => {
      if (!q) return true;
      return [a.full_name, a.email, a.niche, a.source, a.notes].some((v) =>
        (v ?? "").toLowerCase().includes(q),
      );
    });
  }, [applicants, query]);

  const byStageFor = (role: string) => {
    const m = new Map<Stage, Applicant[]>();
    STAGES.forEach((s) => m.set(s.key, []));
    for (const a of filtered) {
      if (a.role_applied !== role) continue;
      const s = STAGES.find((x) => x.key === a.stage)?.key ?? "applied";
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
        portfolio_url: String(f.get("portfolio_url") || "") || null,
        audio_url: String(f.get("audio_url") || "") || null,
      };
      const { score, reasoning } = scoreApplicant(draft);
      // Heuristic score only ever suggests a stage (ai_recommended_stage) — the
      // real `stage` a new applicant lands in is always the neutral "applied"
      // until a human applies the recommendation, same rule as the video-grading path.
      const recommendedStage = recommendStageFromScore(score);
      const resumeFile = f.get("resume") as File | null;
      if (devBypass) {
        const row: Applicant = {
          id: crypto.randomUUID(),
          ...draft,
          ai_score: score,
          ai_reasoning: reasoning,
          ai_recommended_stage: recommendedStage,
          stage: "applied",
          last_shown_at: null,
          applied_at: new Date().toISOString(),
          loom_url: null,
          loom_transcript: null,
          ai_transcript_summary: null,
          ai_stated_role: null,
          historical_cash_collected_cents: null,
          recent_monthly_cash_collected_cents: null,
          resume_url: resumeFile && resumeFile.size > 0 ? resumeFile.name : null,
        };
        setMockApplicants((prev) => [row, ...prev]);
        return;
      }
      let resume_url: string | null = null;
      if (resumeFile && resumeFile.size > 0) {
        const path = `${orgId}/${Date.now()}-${resumeFile.name.replace(/[^\w.-]/g, "_")}`;
        const { error: upErr } = await supabase.storage
          .from("applicant-resumes")
          .upload(path, resumeFile);
        if (upErr) throw new Error(`Resume upload failed: ${upErr.message}`);
        resume_url = path;
      }
      const { error } = await supabase.from("hiring_applicants").insert({
        org_id: orgId!,
        ...draft,
        resume_url,
        ai_score: score,
        ai_reasoning: reasoning,
        ai_recommended_stage: recommendedStage,
        stage: "applied",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Applicant added · auto-scored");
      if (!devBypass) qc.invalidateQueries({ queryKey: ["hiring"] });
      setOpen(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Applicant> }) => {
      if (devBypass) {
        setMockApplicants((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
        return;
      }
      const { error } = await supabase.from("hiring_applicants").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      if (!devBypass) qc.invalidateQueries({ queryKey: ["hiring"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const bulkMove = useMutation({
    mutationFn: async ({ ids, stage }: { ids: string[]; stage: Stage }) => {
      if (devBypass) {
        const idSet = new Set(ids);
        setMockApplicants((prev) =>
          prev.map((a) =>
            idSet.has(a.id) ? { ...a, stage, last_shown_at: new Date().toISOString() } : a,
          ),
        );
        return;
      }
      const { error } = await supabase
        .from("hiring_applicants")
        .update({ stage, last_shown_at: new Date().toISOString() })
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Updated");
      setSelectedIds(new Set());
      if (!devBypass) qc.invalidateQueries({ queryKey: ["hiring"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to update"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      if (devBypass) {
        setMockApplicants((prev) => prev.filter((a) => a.id !== id));
        return;
      }
      const { error } = await supabase.from("hiring_applicants").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Removed");
      setEditing(null);
      if (!devBypass) qc.invalidateQueries({ queryKey: ["hiring"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to remove"),
  });

  const toggleSel = (id: string) => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const total = applicants?.length ?? 0;
  const hired = applicants?.filter((a) => a.stage === "hired").length ?? 0;
  const interviewWorthy =
    applicants?.filter((a) => a.stage === "interview_worthy" || a.stage === "trial_call").length ??
    0;
  const avgScore = applicants?.length
    ? applicants.reduce((s, a) => s + Number(a.ai_score ?? 0), 0) / applicants.length
    : 0;

  return (
    <>
      <TopBar
        title="Sales Team Hiring"
        subtitle="Applicant pipeline · AI-scored · drag to move stages"
      />
      <div className="p-6 space-y-5">
        <BentoGrid cols={2} rowHeight="8rem">
          <BentoCell span="hero">
            <HiringFunnelHero total={total} interviewWorthy={interviewWorthy} hired={hired} />
          </BentoCell>
        </BentoGrid>

        {/* Sticky on scroll — the Kanban board below can run long, so the
            headline counts stay visible instead of scrolling out of view.
            top-[155px] docks it directly below the two stacked sticky headers
            above (LiveTicker 32px + TopBar's measured ~123px on this page). */}
        <div className="sticky top-[155px] z-10 -mx-6 bg-background/95 px-6 pb-3 pt-1 backdrop-blur">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard
              label="Total applicants"
              value={total}
              icon={<Users className="h-4 w-4" />}
              spectrum="cold"
            />
            <StatCard label="Interview / Trial" value={interviewWorthy} spectrum="mid" />
            <StatCard label="Hired" value={hired} spectrum="hot" />
            {/* Avg score vs a quality bar is a genuine threshold/state signal — success/warning is correct here, not a spectrum miscolor. */}
            <StatCard
              label="Avg AI score"
              value={avgScore.toFixed(1)}
              icon={<Star className="h-4 w-4" />}
              accent={avgScore >= 7 ? "success" : "warning"}
            />
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name, email, niche, notes…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-8 h-9"
            />
          </div>
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-1.5 rounded-md border border-border bg-muted/30 px-2 py-1">
              <span className="text-xs text-muted-foreground">{selectedIds.size} selected</span>
              <Select
                onValueChange={(v) =>
                  bulkMove.mutate({ ids: Array.from(selectedIds), stage: v as Stage })
                }
              >
                <SelectTrigger className="h-7 w-40 text-xs">
                  <SelectValue placeholder="Move to…" />
                </SelectTrigger>
                <SelectContent>
                  {STAGES.map((s) => (
                    <SelectItem key={s.key} value={s.key}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="ml-auto">
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="h-4 w-4" />
                  Add applicant
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>New applicant</DialogTitle>
                </DialogHeader>
                <ApplicantForm onSubmit={(f) => create.mutate(f)} pending={create.isPending} />
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <Tabs
          value={tab}
          onValueChange={(v) => {
            setTab(v as (typeof ROLES)[number]);
            setSelectedIds(new Set());
          }}
        >
          {/* Pill-style role filter — same underlying tab-switch behavior, rounded-full
              filled-when-active treatment instead of the default underline tabs. */}
          <TabsList className="h-auto gap-1.5 bg-transparent p-0">
            {ROLE_TABS.map((t) => {
              const roleApplicants = (applicants ?? []).filter((a) => a.role_applied === t.key);
              return (
                <TabsTrigger
                  key={t.key}
                  value={t.key}
                  className="rounded-full border border-border bg-card px-3 py-1.5 text-xs data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-none"
                >
                  {t.label} · {roleApplicants.length}
                </TabsTrigger>
              );
            })}
          </TabsList>
          {ROLE_TABS.map((t) => {
            const roleApplicants = filtered.filter((a) => a.role_applied === t.key);
            const roleAvg = roleApplicants.length
              ? roleApplicants.reduce((s, a) => s + Number(a.ai_score ?? 0), 0) /
                roleApplicants.length
              : 0;
            const roleHired = roleApplicants.filter((a) => a.stage === "hired").length;
            return (
              <TabsContent key={t.key} value={t.key} className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <StatCard
                    label={`${t.label}s in pipeline`}
                    value={roleApplicants.length}
                    icon={<Users className="h-4 w-4" />}
                    spectrum="cold"
                  />
                  <StatCard label="Hired" value={roleHired} spectrum="hot" />
                  <StatCard
                    label="Avg transcript-quality score"
                    value={roleAvg.toFixed(1)}
                    icon={<Star className="h-4 w-4" />}
                    accent={roleAvg >= 7 ? "success" : "warning"}
                  />
                </div>
                <KanbanBoard
                  layout="scroll"
                  columns={STAGES.map((s) => ({ key: s.key, label: s.label, tone: s.tone }))}
                  itemsByColumn={byStageFor(t.key)}
                  onDropItem={(id, stage) =>
                    update.mutate({
                      id,
                      patch: { stage: stage as Stage, last_shown_at: new Date().toISOString() },
                    })
                  }
                  renderCard={(a) => {
                    const sel = selectedIds.has(a.id);
                    // Derived from the same recommendStageFromScore() breakpoints the
                    // server uses for ai_recommended_stage, so the chip color and the
                    // recommended stage can never disagree with each other again.
                    const scoreRec = recommendStageFromScore(Number(a.ai_score ?? 0));
                    const scoreTone: ChipTone =
                      scoreRec === "trial_call"
                        ? "success"
                        : scoreRec === "interview_worthy"
                          ? "info"
                          : scoreRec === "needs_grading"
                            ? "warning"
                            : "default";
                    const roleMismatch = a.ai_stated_role && a.ai_stated_role !== a.role_applied;
                    return (
                      <div className={sel ? "-m-2 rounded-md border border-primary p-2" : ""}>
                        <div className="flex items-start justify-between gap-2">
                          <button
                            onClick={() => toggleSel(a.id)}
                            className="mt-0.5 text-muted-foreground hover:text-foreground"
                          >
                            {sel ? (
                              <CheckSquare className="h-3.5 w-3.5" />
                            ) : (
                              <Square className="h-3.5 w-3.5" />
                            )}
                          </button>
                          <div className="flex-1 min-w-0">
                            <button onClick={() => setEditing(a)} className="text-left w-full">
                              <div className="font-medium text-sm leading-tight truncate">
                                {a.full_name}
                              </div>
                              <div className="text-3xs text-muted-foreground capitalize">
                                {a.role_applied} · {a.niche ?? "—"}
                              </div>
                            </button>
                          </div>
                          <button
                            onClick={() => setAiEvalApplicant(a)}
                            title="Open AI evaluation"
                            className={`text-2xs font-mono font-semibold rounded px-1.5 py-0.5 ${CHIP_TONE_CLASSES[scoreTone]}`}
                          >
                            {a.ai_score?.toFixed(1) ?? "—"}
                          </button>
                        </div>
                        {(a.recent_monthly_cash_collected_cents ||
                          a.historical_cash_collected_cents) && (
                          <div className="mt-1 flex items-center gap-1 text-3xs text-[color:var(--color-success)]">
                            <DollarSign className="h-3 w-3" />
                            {a.recent_monthly_cash_collected_cents
                              ? `${fmtMoney(a.recent_monthly_cash_collected_cents)}/mo recent`
                              : ""}
                            {a.recent_monthly_cash_collected_cents &&
                            a.historical_cash_collected_cents
                              ? " · "
                              : ""}
                            {a.historical_cash_collected_cents
                              ? `${fmtMoney(a.historical_cash_collected_cents)} lifetime`
                              : ""}
                          </div>
                        )}
                        {roleMismatch && (
                          <div className="mt-1 flex items-center gap-1 text-3xs text-[color:var(--color-warning)]">
                            <AlertTriangle className="h-3 w-3" /> AI heard "{a.ai_stated_role}" on
                            video
                          </div>
                        )}
                        {/* Louder suggest-and-confirm (per plan's correction: no auto-advance,
                            just fewer clicks to act on the existing recommendation) — this used
                            to only surface inside the edit dialog; now it's visible on the card
                            itself, right where a recruiter is already scanning the board. */}
                        {a.ai_recommended_stage && a.ai_recommended_stage !== a.stage && (
                          <div className="mt-1.5 flex items-center justify-between gap-1.5 rounded-md bg-primary/10 px-1.5 py-1 text-3xs">
                            <span className="truncate text-primary">
                              AI suggests:{" "}
                              {STAGES.find((s) => s.key === a.ai_recommended_stage)?.label ??
                                a.ai_recommended_stage}{" "}
                              →
                            </span>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-5 shrink-0 px-1.5 text-4xs"
                              onClick={() =>
                                update.mutate({
                                  id: a.id,
                                  patch: {
                                    stage: a.ai_recommended_stage as string,
                                    last_shown_at: new Date().toISOString(),
                                  },
                                })
                              }
                            >
                              Apply
                            </Button>
                          </div>
                        )}
                        <div className="mt-1.5 flex items-center gap-2 text-3xs text-muted-foreground">
                          {a.loom_url && (
                            <button
                              onClick={() => window.open(a.loom_url!, "_blank", "noreferrer")}
                              className="flex items-center gap-1 hover:text-foreground"
                            >
                              <PlayCircle className="h-3 w-3" /> Listen
                            </button>
                          )}
                          <button
                            onClick={() => setEditing(a)}
                            className="flex items-center gap-1 hover:text-foreground"
                          >
                            <CalendarClock className="h-3 w-3" /> Schedule
                          </button>
                        </div>
                        <div className="mt-1.5 flex items-center justify-between text-3xs text-muted-foreground">
                          <span>Applied {new Date(a.applied_at).toLocaleDateString()}</span>
                          {a.last_shown_at && (
                            <span>Moved {new Date(a.last_shown_at).toLocaleDateString()}</span>
                          )}
                        </div>
                      </div>
                    );
                  }}
                />
              </TabsContent>
            );
          })}
        </Tabs>

        <Dialog
          open={!!editing}
          onOpenChange={(o) => {
            if (!o) setEditing(null);
          }}
        >
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Pencil className="h-4 w-4" /> {editing?.full_name}
              </DialogTitle>
            </DialogHeader>
            {editing && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-muted-foreground">Email:</span> {editing.email ?? "—"}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Phone:</span> {editing.phone ?? "—"}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Experience:</span>{" "}
                    {editing.years_experience ?? "—"}y
                  </div>
                  <div>
                    <span className="text-muted-foreground">Niche:</span> {editing.niche ?? "—"}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Source:</span> {editing.source ?? "—"}
                  </div>
                </div>

                {(editing.portfolio_url || editing.audio_url || editing.resume_url) && (
                  <div className="flex flex-wrap gap-2 text-2xs">
                    {editing.portfolio_url && (
                      <a
                        href={editing.portfolio_url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-muted-foreground hover:text-foreground"
                      >
                        <Link2 className="h-3 w-3" /> Portfolio
                      </a>
                    )}
                    {editing.audio_url && (
                      <a
                        href={editing.audio_url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-muted-foreground hover:text-foreground"
                      >
                        <Headphones className="h-3 w-3" /> Audio application
                      </a>
                    )}
                    {editing.resume_url && (
                      <span className="flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-muted-foreground">
                        <Upload className="h-3 w-3" /> {editing.resume_url.split("/").pop()}
                      </span>
                    )}
                  </div>
                )}

                {(editing.historical_cash_collected_cents ||
                  editing.recent_monthly_cash_collected_cents) && (
                  <div className="rounded-md border border-[color:var(--color-success)]/30 bg-[color:var(--color-success)]/5 p-3 grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-muted-foreground">Recent monthly cash (stated)</span>
                      <div className="font-mono text-sm text-[color:var(--color-success)]">
                        {editing.recent_monthly_cash_collected_cents
                          ? fmtMoney(editing.recent_monthly_cash_collected_cents)
                          : "—"}
                      </div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Historical cash (stated)</span>
                      <div className="font-mono text-sm text-[color:var(--color-success)]">
                        {editing.historical_cash_collected_cents
                          ? fmtMoney(editing.historical_cash_collected_cents)
                          : "—"}
                      </div>
                    </div>
                  </div>
                )}

                {/* AI evaluation (score/flags/reasoning/summary/video-grading) moved into
                    its own drawer — decluttering this dialog down to identity + pipeline
                    controls, same content just better organized, no new AI call shape. */}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full justify-between"
                  onClick={() => setAiEvalApplicant(editing)}
                >
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5" /> AI evaluation
                  </span>
                  <span className="font-mono text-2xs">
                    {editing.ai_score?.toFixed(1) ?? "—"}/10 →
                  </span>
                </Button>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Role applied for</Label>
                    <Select
                      value={editing.role_applied}
                      onValueChange={(v) => {
                        update.mutate({ id: editing.id, patch: { role_applied: v } });
                        setEditing({ ...editing, role_applied: v });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLES.map((r) => (
                          <SelectItem key={r} value={r}>
                            {r}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {editing.ai_stated_role && editing.ai_stated_role !== editing.role_applied && (
                      <div className="flex items-center gap-1.5 text-3xs text-[color:var(--color-warning)]">
                        <AlertTriangle className="h-3 w-3" /> AI heard "{editing.ai_stated_role}" on
                        video
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-5 text-4xs px-1.5"
                          onClick={() => {
                            const r = editing.ai_stated_role as string;
                            update.mutate({ id: editing.id, patch: { role_applied: r } });
                            setEditing({ ...editing, role_applied: r });
                          }}
                        >
                          Use this
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Stage</Label>
                    <Select
                      value={editing.stage}
                      onValueChange={(v) => {
                        update.mutate({
                          id: editing.id,
                          patch: { stage: v, last_shown_at: new Date().toISOString() },
                        });
                        setEditing({ ...editing, stage: v });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STAGES.map((s) => (
                          <SelectItem key={s.key} value={s.key}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Recruiter notes</Label>
                  <Textarea
                    rows={4}
                    defaultValue={editing.notes ?? ""}
                    onBlur={(e) => {
                      if (e.target.value !== (editing.notes ?? ""))
                        update.mutate({ id: editing.id, patch: { notes: e.target.value } });
                    }}
                  />
                </div>
                <div className="flex justify-between pt-2">
                  <Button variant="destructive" size="sm" onClick={() => remove.mutate(editing.id)}>
                    <Trash2 className="h-3.5 w-3.5" /> Remove
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEditing(null)}>
                    Close
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <AiEvaluationDrawer
          applicant={aiEvalApplicant}
          devBypass={devBypass}
          onOpenChange={(o) => {
            if (!o) setAiEvalApplicant(null);
          }}
          onApply={(a) => {
            const stage = a.ai_recommended_stage as string;
            update.mutate({ id: a.id, patch: { stage, last_shown_at: new Date().toISOString() } });
            setAiEvalApplicant({ ...a, stage, last_shown_at: new Date().toISOString() });
            if (editing?.id === a.id)
              setEditing({ ...editing, stage, last_shown_at: new Date().toISOString() });
          }}
          onGraded={(a, r, loomUrl, transcript) => {
            const patch: Partial<Applicant> = {
              ai_score: r.score,
              ai_reasoning: r.reasoning,
              ai_recommended_stage: r.recommendedStage,
              ai_transcript_summary: r.summary,
              ai_stated_role: r.stated_role,
              loom_url: loomUrl || a.loom_url,
              loom_transcript: transcript || a.loom_transcript,
              last_shown_at: new Date().toISOString(),
            };
            if (devBypass)
              setMockApplicants((prev) =>
                prev.map((x) => (x.id === a.id ? { ...x, ...patch } : x)),
              );
            else qc.invalidateQueries({ queryKey: ["hiring"] });
            setAiEvalApplicant((prev) => (prev ? { ...prev, ...patch } : prev));
            if (editing?.id === a.id) setEditing((prev) => (prev ? { ...prev, ...patch } : prev));
          }}
        />
      </div>
    </>
  );
}

/** AI evaluation drawer — score breakdown, transcript summary, and real
 * green/red flags (deriveFlags, above), plus the video-grading form
 * (LoomGrader) that produces them. Surfaces `gradeApplicantFromTranscript`'s
 * existing structured output; no new AI call shape. Auto-advance is still not
 * built (see the plan's own correction) — Apply here is the same one-click
 * suggest-and-confirm action as everywhere else in this file, never automatic. */
function AiEvaluationDrawer({
  applicant,
  devBypass,
  onOpenChange,
  onApply,
  onGraded,
}: {
  applicant: Applicant | null;
  devBypass: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (a: Applicant) => void;
  onGraded: (a: Applicant, r: GradeResult, loomUrl: string, transcript: string) => void;
}) {
  const flags = applicant ? deriveFlags(applicant) : [];
  return (
    <Sheet open={!!applicant} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" /> AI evaluation · {applicant?.full_name}
          </SheetTitle>
        </SheetHeader>
        {applicant && (
          <div className="mt-4 space-y-4">
            <div className="flex items-center justify-between rounded-md border border-border bg-muted/20 p-3">
              <div className="text-3xs uppercase tracking-wider text-muted-foreground">
                Transcript quality
              </div>
              <div className="font-mono text-2xl font-bold">
                {applicant.ai_score?.toFixed(1) ?? "—"}
                <span className="text-sm text-muted-foreground">/10</span>
              </div>
            </div>

            {flags.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-3xs uppercase tracking-wider text-muted-foreground">Flags</div>
                {flags.map((f, i) => (
                  <div
                    key={i}
                    className={cn(
                      "flex items-center gap-1.5 text-xs",
                      f.positive ? "text-[color:var(--color-success)]" : "text-destructive",
                    )}
                  >
                    {f.positive ? (
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 shrink-0" />
                    )}
                    {f.label}
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-1.5">
              <div className="text-3xs uppercase tracking-wider text-muted-foreground">
                Reasoning
              </div>
              <div className="text-xs text-muted-foreground">
                {applicant.ai_reasoning ?? "No reasoning yet — grade the video below."}
              </div>
            </div>

            {applicant.ai_transcript_summary && (
              <div className="space-y-1.5">
                <div className="text-3xs uppercase tracking-wider text-muted-foreground">
                  Transcript summary
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {applicant.ai_transcript_summary}
                </p>
              </div>
            )}

            {applicant.ai_recommended_stage && (
              <div className="flex items-center gap-2 rounded-md bg-primary/10 p-2.5 text-2xs">
                <span className="text-muted-foreground">AI recommends</span>
                <span className="rounded bg-primary/15 px-1.5 py-0.5 font-semibold uppercase tracking-wider text-primary">
                  {STAGES.find((s) => s.key === applicant.ai_recommended_stage)?.label ??
                    applicant.ai_recommended_stage}
                </span>
                {applicant.stage !== applicant.ai_recommended_stage && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="ml-auto h-6 text-3xs"
                    onClick={() => onApply(applicant)}
                  >
                    Apply
                  </Button>
                )}
              </div>
            )}

            <LoomGrader
              applicant={applicant}
              devBypass={devBypass}
              onGraded={(r, loomUrl, transcript) => onGraded(applicant, r, loomUrl, transcript)}
            />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function ApplicantForm({
  onSubmit,
  pending,
}: {
  onSubmit: (f: FormData) => void;
  pending: boolean;
}) {
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(new FormData(e.currentTarget));
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Full name</Label>
          <Input name="full_name" required />
        </div>
        <div className="space-y-1.5">
          <Label>Email</Label>
          <Input name="email" type="email" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Phone</Label>
          <Input name="phone" />
        </div>
        <div className="space-y-1.5">
          <Label>Role applied for</Label>
          <Select name="role_applied" defaultValue="setter">
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLES.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label>Years experience</Label>
          <Input name="years_experience" type="number" step="0.5" min={0} />
        </div>
        <div className="space-y-1.5">
          <Label>Niche / vertical</Label>
          <Input name="niche" placeholder="coaching, agency…" />
        </div>
        <div className="space-y-1.5">
          <Label>Source</Label>
          <Input name="source" placeholder="LinkedIn / referral…" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5">
            <Link2 className="h-3 w-3" /> Portfolio link
          </Label>
          <Input name="portfolio_url" type="url" placeholder="https://…" />
        </div>
        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5">
            <Headphones className="h-3 w-3" /> Audio application link
          </Label>
          <Input name="audio_url" type="url" placeholder="https://…" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Notes (perf signals, availability)</Label>
        <Textarea name="notes" rows={3} />
      </div>
      <ResumeDropzone />
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Scoring…" : "Add & auto-score"}
      </Button>
    </form>
  );
}

/** Dashed-border resume dropzone — a real `<input type="file" name="resume">` styled
 * as a drop target, uploaded to the `applicant-resumes` Storage bucket on submit
 * (see the `create` mutation above) via the same client-upload pattern the app
 * already uses for daily-win proof photos (`daily-win.tsx`). */
function ResumeDropzone() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1.5">
        <Upload className="h-3 w-3" /> Resume
      </Label>
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files?.[0];
          if (file && inputRef.current) {
            inputRef.current.files = e.dataTransfer.files;
            setFileName(file.name);
          }
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed px-3 py-4 text-center transition-colors",
          dragOver ? "border-primary bg-primary/5" : "border-border/70 hover:border-border",
        )}
      >
        <Upload className="h-4 w-4 text-muted-foreground" />
        <span className="text-2xs text-muted-foreground">
          {fileName ?? "Drop a resume here, or click to browse (PDF, DOC)"}
        </span>
        <input
          ref={inputRef}
          type="file"
          name="resume"
          accept=".pdf,.doc,.docx"
          className="hidden"
          onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
        />
      </label>
    </div>
  );
}

type GradeResult = {
  score: number;
  recommendedStage: string;
  summary: string;
  reasoning: string;
  stated_role: string | null;
};

/** AI watches the video application by reading its transcript and grades it — a
 * RECOMMENDATION only (see hiring.server.ts). It never moves the applicant's
 * real stage; the parent surfaces an "Apply" button for that. */
function LoomGrader({
  applicant,
  devBypass,
  onGraded,
}: {
  applicant: Applicant;
  devBypass: boolean;
  onGraded: (result: GradeResult, loomUrl: string, transcript: string) => void;
}) {
  const grade = useServerFn(gradeLoomFn);
  const [url, setUrl] = useState(applicant.loom_url ?? "");
  const [transcript, setTranscript] = useState(applicant.loom_transcript ?? "");

  const m = useMutation({
    mutationFn: async (): Promise<GradeResult> => {
      if (devBypass) return withMockDelay(mockLoomGrade());
      return grade({
        data: {
          applicant_id: applicant.id,
          loom_url: url.trim() || null,
          transcript: transcript.trim() || null,
        },
      });
    },
    onSuccess: (r) => {
      toast.success(
        `Graded ${r.score}/10 — recommends ${r.recommendedStage.replace("_", " ")}. Apply it below to move the applicant.`,
      );
      onGraded(r, url.trim(), transcript.trim());
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="rounded-md border border-border p-3 space-y-2">
      <div className="flex items-center gap-1.5 text-2xs uppercase tracking-wider text-muted-foreground">
        <Video className="h-3.5 w-3.5" /> Video application
      </div>
      <Input
        placeholder="https://www.loom.com/share/…"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
      />
      <Textarea
        rows={4}
        placeholder="Paste the Loom transcript here (Loom → … → Copy transcript). If left blank we'll try to read it from the share link."
        value={transcript}
        onChange={(e) => setTranscript(e.target.value)}
      />
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          disabled={m.isPending || (!url.trim() && !transcript.trim())}
          onClick={() => m.mutate()}
        >
          {m.isPending ? (
            <>
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              Watching…
            </>
          ) : (
            <>
              <Sparkles className="h-3.5 w-3.5 mr-1.5" />
              Grade & route from video
            </>
          )}
        </Button>
        {url.trim() && (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="text-2xs text-muted-foreground hover:text-foreground"
          >
            Open Loom
          </a>
        )}
      </div>
    </div>
  );
}
