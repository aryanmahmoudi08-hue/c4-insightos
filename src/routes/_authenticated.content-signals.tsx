import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
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
import { MECHANISMS, MECHANISM_KEYS, variationLabel, reelSplit, type MechanismKey } from "@/lib/content-mechanisms";
import { contentDemandFn, analyzeContentSystemFn, logSetterSignalFn } from "@/lib/content-signals.functions";
import { mockContentDemand, mockContentSystemInsight, withMockDelay } from "@/lib/dev-mock-data";
import { Radar, Sparkles, Loader2, TrendingUp, TriangleAlert, PhoneCall, CalendarCheck, ArrowRight, ChevronDown, Wrench } from "lucide-react";
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

const RANGES = [
  { label: "Today", days: 1 },
  { label: "3d", days: 3 },
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
];

function ContentSignalsPage() {
  const { data: org } = useCurrentOrg();
  const orgId = (org as { org_id?: string } | undefined)?.org_id;
  const { devBypass } = useAuth();
  const [days, setDays] = useState(30);
  const [reelTarget, setReelTarget] = useState(6);
  const [insight, setInsight] = useState("");
  const [expandedMix, setExpandedMix] = useState<Set<MechanismKey>>(new Set());
  const toggleMix = (k: MechanismKey) => setExpandedMix(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; });

  const demandFn = useServerFn(contentDemandFn);
  const { data: demand, isLoading } = useQuery({
    queryKey: ["content-demand", days, devBypass],
    queryFn: () => (devBypass ? Promise.resolve(mockContentDemand()) : demandFn({ data: { days } })),
  });

  const analyzeFn = useServerFn(analyzeContentSystemFn);
  const analyze = useMutation({
    mutationFn: async () => {
      if (devBypass) return withMockDelay(mockContentSystemInsight(demand ?? mockContentDemand()));
      return analyzeFn({ data: { days } });
    },
    onSuccess: (r) => setInsight(r.insight),
    onError: (e: Error) => toast.error(e.message),
  });

  // Weekly posting check — are we posting all 4 categories, 5-7 reels/week?
  const { data: week } = useQuery({
    queryKey: ["weekly-content-check", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const since = new Date(Date.now() - 7 * 86400000).toISOString();
      const { data: pieces, error } = await supabase
        .from("content_pieces")
        .select("id, title, mechanism, variation, platform, posted_at, pipeline_status")
        .eq("org_id", orgId!)
        .gte("created_at", since)
        .limit(200);
      if (error) throw error;
      const ids = (pieces ?? []).map(p => p.id);
      const metrics: Record<string, { dms: number; calls: number; cash: number; views: number; eng: number; drop: number; retention: number }> = {};
      if (ids.length) {
        const { data: ms } = await supabase
          .from("content_metrics")
          .select("content_id, views, dms_generated, calls_booked, cash_collected_cents, engagement_rate_pct, drop_off_rate_pct, hook_retention_pct")
          .in("content_id", ids);
        for (const m of ms ?? []) {
          metrics[m.content_id] = {
            dms: m.dms_generated ?? 0, calls: m.calls_booked ?? 0,
            cash: m.cash_collected_cents ?? 0, views: m.views ?? 0,
            eng: Number(m.engagement_rate_pct ?? 0), drop: Number(m.drop_off_rate_pct ?? 0),
            retention: Number(m.hook_retention_pct ?? 0),
          };
        }
      }
      return { pieces: pieces ?? [], metrics };
    },
  });

  const weekly = useMemo(() => {
    const pieces = week?.pieces ?? [];
    const metrics = week?.metrics ?? {};
    const per: Record<string, { count: number; dms: number; calls: number; cash: number; views: number; eng: number[]; retention: number[]; withMetrics: number }> = {};
    for (const k of MECHANISM_KEYS) per[k] = { count: 0, dms: 0, calls: 0, cash: 0, views: 0, eng: [], retention: [], withMetrics: 0 };
    per["untagged"] = { count: 0, dms: 0, calls: 0, cash: 0, views: 0, eng: [], retention: [], withMetrics: 0 };
    for (const p of pieces) {
      const k = (p.mechanism as string) ?? "untagged";
      const bucket = per[k] ?? per["untagged"];
      bucket.count += 1;
      const m = metrics[p.id];
      if (m) {
        bucket.dms += m.dms; bucket.calls += m.calls; bucket.cash += m.cash; bucket.views += m.views;
        if (m.eng) bucket.eng.push(m.eng);
        if (m.retention) bucket.retention.push(m.retention);
        if (m.views || m.dms || m.calls || m.eng || m.retention) bucket.withMetrics += 1;
      }
    }
    const reels = pieces.filter(p => ["reel", "tiktok", "youtube_short"].includes(p.platform as string)).length;
    const missing = MECHANISM_KEYS.filter(k => per[k].count === 0);
    const untracked = pieces.filter(p => !metrics[p.id]).length;
    const best = MECHANISM_KEYS.slice().sort((a, b) => (per[b].dms + per[b].calls * 3) - (per[a].dms + per[a].calls * 3))[0];
    const worst = MECHANISM_KEYS.filter(k => per[k].count > 0)
      .sort((a, b) => (per[a].dms + per[a].calls * 3) - (per[b].dms + per[b].calls * 3))[0];

    // Underperformance reasoning — retention vs reach vs mechanism-mismatch, not just a flag.
    const avg = (arr: number[]) => arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0;
    const overallAvgViews = pieces.length ? MECHANISM_KEYS.reduce((s, k) => s + per[k].views, 0) / Math.max(1, pieces.filter(p => metrics[p.id]).length) : 0;
    let worstReason: { label: string; detail: string } | null = null;
    if (worst && per[worst].count > 0) {
      const b = per[worst];
      const avgViews = b.withMetrics ? b.views / b.withMetrics : 0;
      const avgRetention = avg(b.retention);
      const avgEng = avg(b.eng);
      const converted = b.dms + b.calls > 0;
      if (b.withMetrics === 0) {
        worstReason = { label: "Untracked", detail: `${b.count} posts with no metrics logged — can't diagnose without data. Log views/retention/engagement to find out.` };
      } else if (avgViews < overallAvgViews * 0.5) {
        worstReason = { label: "Low reach", detail: `Avg ${Math.round(avgViews).toLocaleString()} views vs ${Math.round(overallAvgViews).toLocaleString()} org avg — it barely got seen. Check hook, posting time, or distribution.` };
      } else if (avgRetention > 0 && avgRetention < 40) {
        worstReason = { label: "Low retention", detail: `Avg ${Math.round(avgRetention)}% hook retention — reached people but lost them fast. The hook or first 3s isn't landing for this mechanism.` };
      } else if (!converted && (avgViews >= overallAvgViews * 0.5 || avgEng >= 3)) {
        worstReason = { label: "Wrong mechanism", detail: `Reached and held attention (${Math.round(avgViews).toLocaleString()} views) but drove 0 DMs/calls — the audience saw it fine, they just don't want this mechanism right now.` };
      } else {
        worstReason = { label: "Underperforming", detail: `${b.count} posts, ${b.dms} DMs, ${b.calls} calls booked — below the mix's other mechanisms this week.` };
      }
    }
    return { per, reels, missing, untracked, best, worst, worstReason, total: pieces.length };
  }, [week]);

  const split = demand ? reelSplit(demand.mix as Record<MechanismKey, number>, reelTarget) : [];

  return (
    <>
      <TopBar title="Content Signals" />
      <main className="p-4 md:p-6 space-y-5 max-w-[1400px]">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="display-serif text-2xl flex items-center gap-2"><Radar className="h-5 w-5" /> What to post next</h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              One brain. FAQ video clicks, setting-call objections, client intake answers, VSL drop-off and reel performance all collapse into a single posting mix.
              Cash inconsistency → unknown posting → untracked performance. Fix tracking, fix everything.
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            {RANGES.map(r => (
              <button key={r.days} onClick={() => { setDays(r.days); setInsight(""); }}
                className={cn("rounded border px-2 py-1 text-2xs", days === r.days ? "border-primary bg-primary/10" : "border-border text-muted-foreground hover:bg-muted/40")}>
                {r.label}
              </button>
            ))}
          </div>
        </header>

        {/* Page hero (B1) — presentation-only promotion into a bento hero;
            RootCauseChain's own node logic/tones are untouched (Part F). */}
        <BentoGrid rowHeight="9.5rem">
          <BentoCell span="hero">
            <RootCauseChain untaggedCount={weekly.per["untagged"]?.count ?? 0} untrackedCount={weekly.untracked} totalPosts={weekly.total} />
          </BentoCell>
        </BentoGrid>

        {/* Demand mix */}
        <Card className="p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Recommended mix · last {days}d</div>
            <div className="flex items-center gap-2 text-2xs text-muted-foreground">
              Weekly reel target
              <Input type="number" min={1} max={21} value={reelTarget} onChange={e => setReelTarget(Math.max(1, Number(e.target.value) || 1))} className="h-7 w-16 text-xs" />
            </div>
          </div>
          {isLoading ? (
            <div className="py-8 text-center text-xs text-muted-foreground"><Loader2 className="h-4 w-4 mx-auto animate-spin" /></div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {MECHANISM_KEYS.map(k => {
                const pct = demand?.mix?.[k] ?? 25;
                const reels = split.find(s => s.mechanism === k)?.reels ?? 0;
                const posted = weekly.per[k]?.count ?? 0;
                const gap = reels - posted;
                const kDrivers = (demand?.drivers ?? []).filter(d => d.mechanism === k).sort((a, b) => b.weight - a.weight);
                const kWeight = kDrivers.reduce((s, d) => s + d.weight, 0);
                const expanded = expandedMix.has(k);
                return (
                  <div key={k} className="rounded-md border border-border p-3 space-y-1.5">
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
            <div className="rounded-md border border-destructive/45 bg-destructive/5 p-3 text-xs space-y-1">
              <div className="flex items-center gap-1.5 font-semibold uppercase tracking-wider text-3xs text-destructive">
                <TriangleAlert className="h-3.5 w-3.5" /> Underperformed
              </div>
              {weekly.worst && weekly.worstReason ? (
                <div>
                  <span className="font-medium">{MECHANISMS[weekly.worst].label}</span>
                  <span className="ml-1.5 rounded bg-destructive/15 px-1.5 py-0.5 text-3xs uppercase tracking-wide text-destructive">{weekly.worstReason.label}</span>
                  <div className="mt-1 text-muted-foreground">{weekly.worstReason.detail}</div>
                </div>
              ) : <div className="text-muted-foreground">Nothing posted with a mechanism tag this week.</div>}
            </div>
          </div>
        </Card>

        {/* Drivers */}
        <Card className="p-4 space-y-2">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Why the mix looks like this — raw signals</div>
          {(demand?.drivers ?? []).length === 0 ? (
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
              <Sparkles className="h-3.5 w-3.5" /> AI bottleneck read · last {days}d
            </div>
            <Button size="sm" variant="outline" disabled={analyze.isPending} onClick={() => analyze.mutate()}>
              {analyze.isPending ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Reading…</> : "Analyze the system"}
            </Button>
          </div>
          {insight
            ? <div className="text-xs leading-relaxed whitespace-pre-wrap animate-in fade-in-0 slide-in-from-top-1 duration-300">{insight}</div>
            : <p className="text-xs text-muted-foreground">Merges VSL play/drop-off, FAQ clicks, setting-call objections, intake answers and reel performance into a root-cause chain plus this week's 5-7 reels.</p>}
        </Card>

        <SetterSignals orgId={orgId} days={days} />
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
  const nodes: { key: string; label: string; tone: ChipTone }[] = [
    { key: "cash", label: "Cash inconsistent", tone: "destructive" },
    { key: "mix", label: untaggedCount > 0 ? `${untaggedCount} posts untagged` : "Posting mix tracked", tone: untaggedCount > 0 ? "destructive" : "success" },
    { key: "perf", label: untrackedCount > 0 ? `${untrackedCount} posts w/o metrics` : "Performance tracked", tone: untrackedCount > 0 ? "destructive" : "success" },
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

function SetterSignals({ orgId, days }: { orgId?: string; days: number }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [transcript, setTranscript] = useState("");
  const [notes, setNotes] = useState("");

  const { data: rows } = useQuery({
    queryKey: ["setter-signals", orgId, days],
    enabled: !!orgId,
    queryFn: async () => {
      const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("setter_call_signals")
        .select("id, setter_name, call_date, limiting_beliefs, objections, mechanism, ai_summary")
        .eq("org_id", orgId!)
        .gte("call_date", since)
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
