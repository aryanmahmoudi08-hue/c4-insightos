import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { TopBar } from "@/components/app-sidebar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useCurrentOrg } from "@/hooks/use-auth";
import { useDateRange } from "@/hooks/use-date-range";
import type { DateRange } from "@/components/date-range-picker";
import { MECHANISMS, MECHANISM_KEYS, variationLabel, reelSplit, type MechanismKey } from "@/lib/content-mechanisms";
import { contentDemandFn, analyzeContentSystemFn, logSetterSignalFn, weeklyContentCheckFn } from "@/lib/content-signals.functions";
import { getWorkspaceSettingsFn, DEFAULT_WORKSPACE_SETTINGS } from "@/lib/workspace-settings.functions";
import { mockContentDemand, mockContentSystemInsight, mockWeeklyContentCheck, withMockDelay } from "@/lib/dev-mock-data";
import { Radar, Sparkles, Loader2, TrendingUp, TriangleAlert, PhoneCall, CalendarCheck, ArrowRight, ChevronDown, Wrench, CircleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { CHIP_TONE_CLASSES, type ChipTone } from "@/components/ui/badge";
import { BentoGrid, BentoCell } from "@/components/bento-grid";

export const Route = createFileRoute("/_authenticated/content-signals")({
  component: ContentSignalsPage,
  head: () => ({
    meta: [
      { title: "Content Signals — What to post next | C4 InsightOS" },
      { name: "description", content: "One brain that merges VSL analytics, FAQ clicks, setting-call objections and client intakes to decide which content mechanism to double down on." },
      { property: "og:title", content: "Content Signals — What to post next" },
      { property: "og:description", content: "Demand mix across the 4 conversion mechanisms, weekly posting check, and root-cause bottleneck reads." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function ContentSignalsPage() {
  const { data: org } = useCurrentOrg();
  const orgId = (org as { org_id?: string } | undefined)?.org_id;
  const { devBypass } = useAuth();
  const { range } = useDateRange();
  // Seeded from the workspace's saved weeklyReelTarget (Settings → Content
  // Engine) instead of a hardcoded 6 that reset on every visit — a scratch
  // edit here stays session-local, it doesn't write back to settings.
  const [reelTarget, setReelTarget] = useState(DEFAULT_WORKSPACE_SETTINGS.content_engine.weeklyReelTarget);
  const [reelTargetSeeded, setReelTargetSeeded] = useState(false);
  const [insight, setInsight] = useState("");
  useEffect(() => { setInsight(""); }, [range.from, range.to]);
  const [expandedMix, setExpandedMix] = useState<Set<MechanismKey>>(new Set());
  const toggleMix = (k: MechanismKey) => setExpandedMix(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; });

  // Deep-link from the objection instrument ("View in Content Signals") —
  // expand and scroll to the matching mechanism card on arrival.
  const deepLink = useSearch({ strict: false }) as { mechanism?: string };
  useEffect(() => {
    const m = deepLink.mechanism;
    if (!m || !MECHANISM_KEYS.includes(m as MechanismKey)) return;
    setExpandedMix((prev) => new Set(prev).add(m as MechanismKey));
    const el = document.getElementById(`mechanism-${m}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [deepLink.mechanism]);

  const settingsFn = useServerFn(getWorkspaceSettingsFn);
  const { data: workspaceSettings } = useQuery({
    queryKey: ["workspace-settings", orgId, devBypass],
    enabled: devBypass || !!orgId,
    queryFn: () => (devBypass ? Promise.resolve(DEFAULT_WORKSPACE_SETTINGS) : settingsFn({ data: { orgId: orgId! } })),
  });
  if (workspaceSettings && !reelTargetSeeded) { setReelTarget(workspaceSettings.content_engine.weeklyReelTarget); setReelTargetSeeded(true); }

  const demandFn = useServerFn(contentDemandFn);
  const { data: demand, isLoading, isError: demandError, error: demandErrorObj } = useQuery({
    queryKey: ["content-demand", range.from, range.to, devBypass],
    queryFn: () => (devBypass ? Promise.resolve(mockContentDemand()) : demandFn({ data: { from: range.from, to: range.to } })),
    retry: false,
  });

  const analyzeFn = useServerFn(analyzeContentSystemFn);
  const analyze = useMutation({
    mutationFn: async () => {
      if (devBypass) return withMockDelay(mockContentSystemInsight(demand ?? mockContentDemand()));
      return analyzeFn({ data: { from: range.from, to: range.to } });
    },
    onSuccess: (r) => setInsight(r.insight),
    onError: (e: Error) => toast.error(e.message),
  });

  // Weekly posting check — are we posting all 4 categories, 5-7 reels/week?
  // Server-side now (content-signals.functions.ts's weeklyContentCheckFn) —
  // the "worst mechanism" diagnosis shares the exact same classifyPerformance()
  // call computeDemand's reel-strength scoring uses, bucketed by mechanism ×
  // platform against this account's own baseline. Previously this was an
  // independent client-side implementation that compared views to an
  // org-wide average across every mechanism AND platform combined — it could
  // (and did) disagree with computeDemand's own read of the same data.
  const weeklyFn = useServerFn(weeklyContentCheckFn);
  const { data: weeklyData, isError: weeklyError, error: weeklyErrorObj } = useQuery({
    queryKey: ["weekly-content-check", orgId, devBypass],
    enabled: !!orgId,
    queryFn: () => (devBypass ? Promise.resolve(mockWeeklyContentCheck()) : weeklyFn()),
    retry: false,
  });
  // This fallback is ONLY a rendering convenience for the "haven't loaded yet"
  // case — every read site below checks `weeklyError` FIRST and renders an
  // explicit error state instead, so a failed query is never silently
  // presented through these zeroed-out values as if it were a clean "nothing
  // tracked yet" read.
  const weekly = weeklyData ?? {
    per: {} as Record<string, { count: number; dms: number; calls: number; cash: number; views: number; withMetrics: number }>,
    reels: 0, missing: [] as MechanismKey[], untracked: 0,
    best: null as MechanismKey | null, worst: null as MechanismKey | null,
    worstDiagnosis: null as { label: string; detail: string; verdictsSampled: number } | null,
    total: 0,
  };

  const split = demand ? reelSplit(demand.mix as Record<MechanismKey, number>, reelTarget) : [];

  return (
    <>
      <TopBar title="Content Signals" showDateRange />
      <main className="p-4 md:p-6 space-y-5 max-w-[1400px]">
        <header>
          <h1 className="display-serif text-2xl flex items-center gap-2"><Radar className="h-5 w-5" /> What to post next</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            One brain. FAQ video clicks, setting-call objections, client intake answers, VSL drop-off and reel performance all collapse into a single posting mix.
            Cash inconsistency → unknown posting → untracked performance. Fix tracking, fix everything.
          </p>
        </header>

        {/* Page hero (B1) — presentation-only promotion into a bento hero;
            RootCauseChain's own node logic/tones are untouched (Part F).
            A failed weekly-check query must NEVER render through this —
            zeroed-out fallback fields would read as "Posting mix tracked ✓ /
            Performance tracked ✓," the exact opposite of what actually happened. */}
        <BentoGrid cols={2} rowHeight="9.5rem">
          <BentoCell span="wide">
            {weeklyError
              ? <QueryErrorCard label="Root-cause read" error={weeklyErrorObj} />
              : <RootCauseChain untaggedCount={weekly.per["untagged"]?.count ?? 0} untrackedCount={weekly.untracked} totalPosts={weekly.total} />}
          </BentoCell>
        </BentoGrid>

        {/* Demand mix */}
        <Card className="p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Recommended mix · {range.from} → {range.to}</div>
              {demand?.insufficientData && (
                <span className="flex items-center gap-1 rounded bg-[color:var(--color-warning)]/15 px-1.5 py-0.5 text-3xs font-medium uppercase tracking-wide text-[color:var(--color-warning)]" title={`Total signal weight ${demand.totalWeight} is below the configured minimum of ${demand.minTotalWeight} — this mix is a real computed split, not a placeholder, but it's resting on thin signal. Log more FAQ clicks, setter calls, or intakes to sharpen it.`}>
                  <TriangleAlert className="h-3 w-3" /> Limited data
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-2xs text-muted-foreground">
              Weekly reel target
              <Input type="number" min={1} max={21} value={reelTarget} onChange={e => setReelTarget(Math.max(1, Number(e.target.value) || 1))} className="h-7 w-16 text-xs" />
            </div>
          </div>
          {isLoading ? (
            <div className="py-8 text-center text-xs text-muted-foreground"><Loader2 className="h-4 w-4 mx-auto animate-spin" /></div>
          ) : demandError ? (
            <QueryErrorCard label="Recommended mix" error={demandErrorObj} />
          ) : !demand ? (
            <EmptyState icon={<Radar className="h-5 w-5" />} title="No mix yet" description="Waiting on a workspace to compute a mix against." />
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {MECHANISM_KEYS.map(k => {
                const pct = demand.mix[k];
                const reels = split.find(s => s.mechanism === k)?.reels ?? 0;
                const posted = weekly.per[k]?.count ?? 0;
                const gap = reels - posted;
                const kDrivers = (demand?.drivers ?? []).filter(d => d.mechanism === k).sort((a, b) => b.weight - a.weight);
                const kWeight = kDrivers.reduce((s, d) => s + d.weight, 0);
                const expanded = expandedMix.has(k);
                return (
                  <div key={k} id={`mechanism-${k}`} className="rounded-md border border-border p-3 space-y-1.5 scroll-mt-20">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{MECHANISMS[k].label}</span>
                      <span className="font-mono text-sm">{pct}%</span>
                    </div>
                    <div className="h-1.5 w-full rounded bg-muted overflow-hidden">
                      <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="text-2xs text-muted-foreground">{reels} of {reelTarget} reels this week</div>
                    <div className={cn("text-2xs font-medium",
                      gap > 0 ? "text-destructive" : "text-[color:var(--color-success)]")}>
                      {gap > 0 ? `${gap} short — posted ${posted}` : `On target — posted ${posted}`}
                    </div>
                    <button type="button" onClick={() => toggleMix(k)}
                      className="flex w-full items-center justify-between text-3xs text-muted-foreground hover:text-foreground pt-1 border-t border-border/60">
                      <span>{kDrivers.length ? `Why ${pct}%? ${kDrivers.length} signal${kDrivers.length === 1 ? "" : "s"} · w${Math.round(kWeight)}` : "No signals yet"}</span>
                      {kDrivers.length > 0 && <ChevronDown className={cn("h-3 w-3 transition-transform", expanded && "rotate-180")} />}
                    </button>
                    {expanded && kDrivers.length > 0 && (
                      <div className="space-y-1 pt-1 animate-in fade-in-0 slide-in-from-top-1 duration-200">
                        {kDrivers.map((d, i) => (
                          <div key={i} className="flex items-start gap-1.5 text-3xs">
                            <span className="shrink-0 text-muted-foreground">{d.source}</span>
                            <span className="flex-1 truncate">{d.detail}</span>
                            <span className="shrink-0 font-mono text-muted-foreground">w{Math.round(d.weight)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {demand && (
            <div className="text-2xs text-muted-foreground">
              Built from {demand.counts.faq} FAQ videos · {demand.counts.setter_calls} setting-call signals · {demand.counts.intakes} client intakes · {demand.counts.reels} content pieces.
            </div>
          )}
        </Card>

        {/* Weekly check */}
        <Card className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
            <CalendarCheck className="h-3.5 w-3.5" /> Weekly check · last 7 days
          </div>
          {weeklyError ? <QueryErrorCard label="Weekly check" error={weeklyErrorObj} /> : (
          <>
          <div className="grid gap-2 sm:grid-cols-3">
            <Stat label="Reels posted" value={`${weekly.reels}`} sub={`target 5-7 · ${weekly.total} pieces total`}
              tone={weekly.reels >= 5 ? "success" : "danger"} />
            <Stat label="All 4 categories covered?" value={weekly.missing.length === 0 ? "Yes" : `No — ${weekly.missing.length} missing`}
              sub={weekly.missing.length ? weekly.missing.map(k => MECHANISMS[k].label).join(", ") : "full coverage"}
              tone={weekly.missing.length === 0 ? "success" : "danger"} />
            <Stat label="Untagged pieces" value={`${weekly.per["untagged"]?.count ?? 0}`} sub="tag mechanism or it can't be measured"
              tone={(weekly.per["untagged"]?.count ?? 0) === 0 ? "success" : "danger"} />
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <div className="rounded-md border border-[color:var(--color-success)]/45 bg-[color:var(--color-success)]/5 p-3 text-xs space-y-1">
              <div className="flex items-center gap-1.5 font-semibold uppercase tracking-wider text-3xs text-[color:var(--color-success)]">
                <TrendingUp className="h-3.5 w-3.5" /> Drove the most DMs / calls
              </div>
              {weekly.best && weekly.per[weekly.best].count > 0
                ? <div>{MECHANISMS[weekly.best].label} — {weekly.per[weekly.best].dms} DMs, {weekly.per[weekly.best].calls} calls booked, ${Math.round(weekly.per[weekly.best].cash / 100).toLocaleString()} cash. Double down.</div>
                : <div className="text-muted-foreground">No performance logged yet this week.</div>}
            </div>
            {/* Red/"Underperformed" styling only applies when the diagnosis actually
                IS that — "Not enough data" and "Typical" are neutral reads, not
                alarms, and presenting them under a red header would be exactly the
                false-confidence problem this project exists to remove. */}
            <div className={cn("rounded-md border p-3 text-xs space-y-1",
              weekly.worstDiagnosis?.label === "Underperforming" ? "border-destructive/45 bg-destructive/5" : "border-border bg-muted/20")}>
              <div className={cn("flex items-center gap-1.5 font-semibold uppercase tracking-wider text-3xs",
                weekly.worstDiagnosis?.label === "Underperforming" ? "text-destructive" : "text-muted-foreground")}>
                <TriangleAlert className="h-3.5 w-3.5" /> {weekly.worstDiagnosis?.label === "Underperforming" ? "Underperformed" : "Lowest this week"}
              </div>
              {weekly.worst && weekly.worstDiagnosis ? (
                <div>
                  <span className="font-medium">{MECHANISMS[weekly.worst].label}</span>
                  <span className={cn("ml-1.5 rounded px-1.5 py-0.5 text-3xs uppercase tracking-wide",
                    weekly.worstDiagnosis.label === "Underperforming" ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground")}>
                    {weekly.worstDiagnosis.label}
                  </span>
                  <div className="mt-1 text-muted-foreground">{weekly.worstDiagnosis.detail}</div>
                </div>
              ) : <div className="text-muted-foreground">Nothing posted with a mechanism tag this week.</div>}
            </div>
          </div>
          </>
          )}
        </Card>

        {/* Drivers */}
        <Card className="p-4 space-y-2">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Why the mix looks like this — raw signals</div>
          {demandError ? (
            <QueryErrorCard label="Demand drivers" error={demandErrorObj} />
          ) : (demand?.drivers ?? []).length === 0 ? (
            <EmptyState icon={<Radar className="h-5 w-5" />} title="No demand signals yet" description="Log FAQ video clicks, screen a setting call, or collect a client intake — each one moves the mix." />
          ) : (
            <div className="divide-y divide-border">
              {demand!.drivers.map((d, i) => (
                <div key={i} className="flex items-start gap-2 py-2 text-xs">
                  <Badge variant="outline" className="text-3xs shrink-0">{MECHANISMS[d.mechanism as MechanismKey]?.label ?? d.mechanism}</Badge>
                  <span className="text-muted-foreground shrink-0">{d.source}</span>
                  <span className="flex-1">{d.detail}</span>
                  <span className="font-mono text-3xs text-muted-foreground">w{Math.round(d.weight)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* AI root-cause read */}
        <Card className="p-4 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5" /> AI bottleneck read · {range.from} → {range.to}
            </div>
            <Button size="sm" variant="outline" disabled={analyze.isPending} onClick={() => analyze.mutate()}>
              {analyze.isPending ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Reading…</> : "Analyze the system"}
            </Button>
          </div>
          {insight
            ? <div className="text-xs leading-relaxed whitespace-pre-wrap animate-in fade-in-0 slide-in-from-top-1 duration-300">{insight}</div>
            : <p className="text-xs text-muted-foreground">Merges VSL play/drop-off, FAQ clicks, setting-call objections, intake answers and reel performance into a root-cause chain plus this week's 5-7 reels.</p>}
        </Card>

        <SetterSignals orgId={orgId} range={range} />
      </main>
    </>
  );
}

/**
 * First-class, always-visible root-cause chain: cash inconsistency traces back to
 * an untracked posting mix, which traces back to untracked performance — fixing
 * tracking fixes the whole read. Each node's tone reflects real current data, and
 * whichever node is broken right now gets called out explicitly, not just implied.
 */
function RootCauseChain({ untaggedCount, untrackedCount, totalPosts }: { untaggedCount: number; untrackedCount: number; totalPosts: number }) {
  const post = (n: number) => (n === 1 ? "post" : "posts");
  const nodes: { key: string; label: string; tone: ChipTone }[] = [
    { key: "cash", label: "Cash inconsistent", tone: "destructive" },
    { key: "mix", label: untaggedCount > 0 ? `${untaggedCount} ${post(untaggedCount)} untagged` : "Posting mix tracked", tone: untaggedCount > 0 ? "destructive" : "success" },
    { key: "perf", label: untrackedCount > 0 ? `${untrackedCount} ${post(untrackedCount)} w/o metrics` : "Performance tracked", tone: untrackedCount > 0 ? "destructive" : "success" },
    { key: "fix", label: "Fix tracking → fixes everything", tone: "info" },
  ];
  const gap = untaggedCount > 0 ? "mix" : untrackedCount > 0 ? "perf" : null;
  const gapNode = nodes.find(n => n.key === gap);

  return (
    <div className="hover-lift relative flex h-full flex-col justify-center gap-3 overflow-hidden rounded-2xl border border-border bg-card p-5">
      <div className="glass-highlight pointer-events-none absolute inset-0 rounded-2xl" />
      <div className="relative flex items-center gap-1.5 text-3xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        <Wrench className="h-3.5 w-3.5" /> Root cause — why the numbers move
      </div>
      <div className="relative flex flex-wrap items-center gap-1.5">
        {nodes.map((n, i) => (
          <div key={n.key} className="flex items-center gap-1.5">
            <div className={cn("flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-2xs font-medium",
              n.tone === "destructive" && "border-destructive/40 bg-destructive/10 text-destructive",
              n.tone === "success" && "border-[color:var(--color-success)]/40 bg-[color:var(--color-success)]/10 text-[color:var(--color-success)]",
              n.tone === "info" && "border-accent/40 bg-accent/10 text-accent",
            )}>
              {n.key === gap && <TriangleAlert className="h-3 w-3" />}
              {n.label}
            </div>
            {i < nodes.length - 1 && <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
          </div>
        ))}
      </div>
      <div className="relative text-2xs text-muted-foreground">
        {gapNode
          ? <>Current gap: <span className={cn("font-medium", gapNode.tone === "destructive" && "text-destructive")}>{gapNode.label}</span> out of {totalPosts} posts this week — fix that first, every downstream read (mix %, bottleneck engine, double-down calls) sharpens automatically once it's closed.</>
          : <>Tracking is healthy — {totalPosts} posts this week are all mechanism-tagged with metrics logged. The mix below reflects real signal, not guesswork.</>}
      </div>
    </div>
  );
}

function SetterSignals({ orgId, range }: { orgId?: string; range: DateRange }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [transcript, setTranscript] = useState("");
  const [notes, setNotes] = useState("");

  const { data: rows } = useQuery({
    queryKey: ["setter-signals", orgId, range.from, range.to],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("setter_call_signals")
        .select("id, setter_name, call_date, limiting_beliefs, objections, mechanism, ai_summary")
        .eq("org_id", orgId!)
        .gte("call_date", range.from)
        .lte("call_date", range.to)
        .order("call_date", { ascending: false })
        .limit(60);
      if (error) throw error;
      return data ?? [];
    },
  });

  const logFn = useServerFn(logSetterSignalFn);
  const m = useMutation({
    mutationFn: () => logFn({ data: { setter_name: name.trim(), call_date: date, transcript: transcript || undefined, notes: notes || undefined, screen: true } }),
    onSuccess: () => {
      toast.success("Screened — beliefs and objections mapped to a mechanism.");
      setTranscript(""); setNotes("");
      qc.invalidateQueries({ queryKey: ["setter-signals"] });
      qc.invalidateQueries({ queryKey: ["content-demand"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
        <PhoneCall className="h-3.5 w-3.5" /> Setting-call word tracks → content demand
      </div>
      <p className="text-2xs text-muted-foreground">
        Paste the setting-call transcript (or the setter's notes from Close). AI pulls the limiting beliefs and objections, then decides which mechanism kills them.
      </p>
      <div className="grid gap-2 sm:grid-cols-3">
        <Input placeholder="Setter name" value={name} onChange={e => setName(e.target.value)} />
        <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
        <Button disabled={!name.trim() || (!transcript.trim() && !notes.trim()) || m.isPending} onClick={() => m.mutate()}>
          {m.isPending ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Screening…</> : "Screen call"}
        </Button>
      </div>
      <Textarea rows={4} placeholder="Paste transcript…" value={transcript} onChange={e => setTranscript(e.target.value)} />
      <Textarea rows={2} placeholder="Or setter notes / word tracks…" value={notes} onChange={e => setNotes(e.target.value)} />

      <div className="divide-y divide-border">
        {(rows ?? []).map(r => (
          <div key={r.id} className="py-2 space-y-1 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{r.setter_name}</span>
              <span className="font-mono text-3xs text-muted-foreground">{r.call_date}</span>
              {r.mechanism && <Badge variant="outline" className="text-3xs">{MECHANISMS[r.mechanism as MechanismKey]?.label ?? r.mechanism}</Badge>}
            </div>
            {(r.limiting_beliefs ?? []).length > 0 && <div><span className="text-3xs uppercase tracking-wider text-destructive">Beliefs</span> — {(r.limiting_beliefs ?? []).join(" · ")}</div>}
            {(r.objections ?? []).length > 0 && <div><span className="text-3xs uppercase tracking-wider text-muted-foreground">Objections</span> — {(r.objections ?? []).join(" · ")}</div>}
            {r.ai_summary && <div className="text-muted-foreground">{r.ai_summary}</div>}
          </div>
        ))}
        {(rows ?? []).length === 0 && <div className="py-6 text-center text-xs text-muted-foreground italic">No setting-call signals in this window.</div>}
      </div>
    </Card>
  );
}

/**
 * A failed fetch, rendered so it can never be mistaken for "not enough data
 * yet" — different color, different icon, different words. Cold-start states
 * are neutral/gray because nothing is wrong; this is red because something
 * broke and the read below it (if any) cannot be trusted until it's fixed.
 */
function QueryErrorCard({ label, error }: { label: string; error: unknown }) {
  const message = error instanceof Error ? error.message : "Unknown error";
  return (
    <div className="rounded-md border border-destructive/45 bg-destructive/5 p-3 text-xs space-y-1">
      <div className="flex items-center gap-1.5 font-semibold uppercase tracking-wider text-3xs text-destructive">
        <CircleAlert className="h-3.5 w-3.5" /> Couldn't load {label}
      </div>
      <div className="text-muted-foreground">
        This is a fetch failure, not a "not enough data" read — nothing below should be trusted until this is fixed. {message}
      </div>
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "success" | "danger" }) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="text-3xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("mt-0.5 font-mono text-lg font-semibold",
        tone === "success" && "text-[color:var(--color-success)]", tone === "danger" && "text-destructive")}>{value}</div>
      {sub && <div className="text-2xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}
