import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useCurrentOrg } from "@/hooks/use-auth";
import { mockIntakeInsights, withMockDelay } from "@/lib/dev-mock-data";
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
import { Plus, Brain, MessageSquareQuote, Sparkles, Cloud, Pencil, Save, Search, TrendingDown, TrendingUp, Wand2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { analyzeIntake, analyzeIntakesAggregate } from "@/lib/intake-insights.functions";
import { MECHANISM_KEYS, MECHANISMS, emptyWeights, scoreText, addWeights, type MechanismWeights } from "@/lib/content-mechanisms";
import { BentoGrid, BentoCell } from "@/components/bento-grid";

export const Route = createFileRoute("/_authenticated/onboarding")({ component: Onboarding });

const STOPWORDS = new Set([
  "the","a","an","and","or","but","if","of","to","in","on","at","for","with","by","from","as","is","are","was","were","be","been","being","this","that","these","those","i","you","we","they","he","she","it","my","our","your","their","his","her","its","me","us","them","do","does","did","have","has","had","will","would","could","should","may","might","can","not","no","yes","so","up","out","about","into","over","than","then","just","like","get","got","make","made","go","going","want","need","know","think","really","very","much","more","most","some","any","all","one","two","also","because","when","while","what","why","how","where","which","who","whom","there","here","still","even","ever","never","yet","now","only","own","off","down","through","after","before","again","too","other","each","such","both","few","many"
]);
function topPhrases(texts: string[], n = 2, limit = 20): { phrase: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const t of texts) {
    if (!t) continue;
    const words = t.toLowerCase().replace(/[^a-z0-9\s']/g, " ").split(/\s+/).filter(Boolean);
    for (let i = 0; i <= words.length - n; i++) {
      const slice = words.slice(i, i + n);
      if (slice.some(w => STOPWORDS.has(w) || w.length < 3)) continue;
      const phrase = slice.join(" ");
      counts.set(phrase, (counts.get(phrase) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .filter(([, c]) => c >= 2)
    .map(([phrase, count]) => ({ phrase, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

type QType = "short" | "long" | "choice";
type Section = "sales" | "fulfillment" | "logistics";
type Signal = "bottleneck" | "double_down" | null;

const BOTTLENECK_KEYS = new Set(["objections_before", "join_sooner", "fear"]);
const DOUBLE_DOWN_KEYS = new Set(["first_touchpoint", "pivotal_moment", "beliefs_shifted", "content_type_helped"]);
const signalFor = (k: string): Signal => BOTTLENECK_KEYS.has(k) ? "bottleneck" : DOUBLE_DOWN_KEYS.has(k) ? "double_down" : null;
const signalClass = (s: Signal) =>
  s === "bottleneck" ? "border-l-2 border-l-destructive pl-3"
  : s === "double_down" ? "border-l-2 border-l-success pl-3"
  : "";
const signalBadge = (s: Signal) =>
  s === "bottleneck" ? <span className="inline-flex items-center gap-1 rounded bg-destructive/10 text-destructive px-1.5 py-0.5 text-4xs font-semibold uppercase tracking-wider"><TrendingDown className="h-2.5 w-2.5" />Bottleneck</span>
  : s === "double_down" ? <span className="inline-flex items-center gap-1 rounded bg-success/10 text-success px-1.5 py-0.5 text-4xs font-semibold uppercase tracking-wider"><TrendingUp className="h-2.5 w-2.5" />Double down</span>
  : null;
const QUESTIONS: { key: string; q: string; type: QType; options?: string[]; section: Section }[] = [
  // --- Sales psychology (feeds content/coaching) ---
  { section: "sales", key: "name", q: "Name", type: "short" },
  { section: "sales", key: "first_touchpoint", q: "What was the first piece of content / touchpoint that made you discover us?", type: "short" },
  { section: "sales", key: "pivotal_moment", q: "What was the moment you decided 'I have to work with them'?", type: "short" },
  { section: "sales", key: "objections_before", q: "What hesitations or doubts almost stopped you from joining?", type: "short" },
  { section: "sales", key: "join_sooner", q: "What could we have done to make you join 30 days sooner?", type: "long" },
  { section: "sales", key: "why_us", q: "Why did you choose us over competitors?", type: "long" },
  { section: "sales", key: "current_pain", q: "What is the #1 problem/frustration you're hoping we solve?", type: "short" },
  { section: "sales", key: "desired_identity", q: "12 months from now, who do you want to have become?", type: "short" },
  { section: "sales", key: "tried_before", q: "What have you tried before that didn't work, and why?", type: "long" },
  { section: "sales", key: "fear", q: "What's your biggest fear about this not working?", type: "long" },
  { section: "sales", key: "beliefs_shifted", q: "What belief [income wise] shifted when you saw our content?", type: "long" },
  { section: "sales", key: "content_type_helped", q: "Which content type helped most?", type: "choice", options: ["Reels", "Stories", "YouTube", "DMs", "Ads"] },
  { section: "sales", key: "experience_level", q: "Experience level", type: "choice", options: ["Beginner", "Intermediate", "Advanced"] },

  // --- Fulfillment intake (what the coach/CSM needs day 1) ---
  { section: "fulfillment", key: "current_revenue", q: "Current monthly revenue (or close estimate)", type: "short" },
  { section: "fulfillment", key: "target_revenue_90d", q: "Target monthly revenue 90 days from now", type: "short" },
  { section: "fulfillment", key: "north_star_outcome", q: "If we accomplish ONE thing together, what is it?", type: "long" },
  { section: "fulfillment", key: "success_metric", q: "How will you measure success at day 30 / 60 / 90?", type: "long" },
  { section: "fulfillment", key: "current_offer", q: "What are you selling right now? (offer, price, delivery)", type: "long" },
  { section: "fulfillment", key: "audience_size", q: "Audience size + main platform (IG followers / email list / etc.)", type: "short" },
  { section: "fulfillment", key: "current_funnel", q: "Walk us through your current funnel: traffic → lead → sale", type: "long" },
  { section: "fulfillment", key: "biggest_bottleneck", q: "What is the single biggest bottleneck stopping growth right now?", type: "long" },
  { section: "fulfillment", key: "team_setup", q: "Who is on your team today? (setter, closer, editor, VA, etc.)", type: "long" },
  { section: "fulfillment", key: "tech_stack", q: "Tools you use (CRM, scheduling, email, payments, automation)", type: "long" },
  { section: "fulfillment", key: "weekly_hours", q: "Hours per week you can commit to implementation", type: "choice", options: ["<5", "5-10", "10-20", "20-40", "40+"] },
  { section: "fulfillment", key: "learning_style", q: "Preferred learning style", type: "choice", options: ["Watch & model", "Live coaching", "1:1 feedback", "Async written", "Do-it-with-me"] },
  { section: "fulfillment", key: "accountability_pref", q: "How do you want to be held accountable?", type: "choice", options: ["Weekly check-in", "Daily Slack", "Public scoreboard", "Hard deadlines", "Light touch"] },
  { section: "fulfillment", key: "blockers_personal", q: "Anything personal we should know that could affect pace? (health, family, travel, etc.)", type: "long" },
  { section: "fulfillment", key: "wins_so_far", q: "What's working right now that we should NOT change?", type: "long" },
  { section: "fulfillment", key: "non_negotiables", q: "Non-negotiables — things you will NOT do (channels, tactics, hours)", type: "long" },

  // --- Logistics ---
  { section: "logistics", key: "timezone", q: "Time zone", type: "short" },
  { section: "logistics", key: "best_contact", q: "Best way + time to reach you", type: "short" },
  { section: "logistics", key: "kickoff_date", q: "Earliest date you can start implementing this week", type: "short" },
];

/**
 * Maps the 3 key sales-psychology questions (first touchpoint, decision to join,
 * join-earlier) to the 4 content mechanisms via the same keyword scorer used by
 * Content Signals, and stores the result on the row at submit time instead of only
 * recomputing it live downstream.
 */
function mechanismSignalsFor(answers: Record<string, string>): MechanismWeights {
  let w = emptyWeights();
  w = addWeights(w, scoreText(answers.first_touchpoint, 1));
  w = addWeights(w, scoreText(answers.pivotal_moment, 1));
  w = addWeights(w, scoreText(answers.join_sooner, 1));
  return w;
}

const SECTION_META: Record<Section, { label: string; hint: string }> = {
  sales: { label: "Sales psychology", hint: "Feeds the content + coaching engine" },
  fulfillment: { label: "Fulfillment intake", hint: "What your coach / CSM needs to deliver outcomes" },
  logistics: { label: "Logistics", hint: "How and when to reach the client" },
};

function Onboarding() {
  const { data: org } = useCurrentOrg();
  const orgId = org?.org_id;
  const { devBypass } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editDraft, setEditDraft] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [insightsByResp, setInsightsByResp] = useState<Record<string, { bottlenecks: { title: string; body: string; recommendation: string }[]; double_down: { title: string; body: string; recommendation: string }[] }>>({});
  const [aggInsights, setAggInsights] = useState<{ bottlenecks: { title: string; body: string; recommendation: string }[]; double_down: { title: string; body: string; recommendation: string }[]; sampleSize?: number } | null>(null);
  const today = () => new Date().toISOString().slice(0, 10);
  const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
  const mtdFrom = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10); };
  type AggPreset = "today" | "3d" | "7d" | "30d" | "mtd" | "all" | "custom";
  const [aggPreset, setAggPreset] = useState<AggPreset>("30d");
  const [aggFrom, setAggFrom] = useState<string>(daysAgo(29));
  const [aggTo, setAggTo] = useState<string>(today());
  const computeRange = (p: AggPreset): { from: string; to: string; label: string } => {
    if (p === "today") return { from: today(), to: today(), label: "Today" };
    if (p === "3d") return { from: daysAgo(2), to: today(), label: "Last 3d" };
    if (p === "7d") return { from: daysAgo(6), to: today(), label: "Last 7d" };
    if (p === "30d") return { from: daysAgo(29), to: today(), label: "Last 30d" };
    if (p === "mtd") return { from: mtdFrom(), to: today(), label: "MTD" };
    if (p === "all") return { from: "2000-01-01", to: today(), label: "All time" };
    return { from: aggFrom, to: aggTo, label: "Custom" };
  };
  const setPreset = (p: AggPreset) => {
    setAggPreset(p);
    if (p !== "custom") {
      const r = computeRange(p);
      setAggFrom(r.from); setAggTo(r.to);
    }
    // Analysis was generated for the previous window — don't keep showing it
    // labeled under a range it no longer corresponds to.
    setAggInsights(null);
  };
  const activeRange = computeRange(aggPreset);
  const analyzeFn = useServerFn(analyzeIntake);
  const aggregateFn = useServerFn(analyzeIntakesAggregate);
  const analyzeMut = useMutation({
    mutationFn: (id: string) => (devBypass ? withMockDelay(mockIntakeInsights()) : analyzeFn({ data: { responseId: id } })),
    onSuccess: (res, id) => { setInsightsByResp(m => ({ ...m, [id]: res })); toast.success("AI insights ready"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const aggregateMut = useMutation({
    mutationFn: () => (devBypass ? withMockDelay(mockIntakeInsights()) : aggregateFn({ data: { from: activeRange.from, to: activeRange.to } })),
    onSuccess: (res) => { setAggInsights(res); toast.success(`Analyzed ${res.sampleSize ?? 0} intakes`); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });


  const { data: responses } = useQuery({
    queryKey: ["onboarding", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("onboarding_responses")
        .select("id, responses, mechanism_signals, submitted_at, created_at, share_token, clients(full_name, offer_name)")
        .eq("org_id", orgId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: clients } = useQuery({
    queryKey: ["clients-pick", orgId],
    enabled: !!orgId && open,
    queryFn: async () => {
      const { data } = await supabase.from("clients").select("id, full_name").eq("org_id", orgId!);
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async (f: FormData) => {
      const answers: Record<string, string> = {};
      QUESTIONS.forEach(q => { answers[q.key] = String(f.get(q.key) || ""); });
      const client_id = (f.get("client_id") as string) || null;
      const { error } = await supabase.from("onboarding_responses").insert({
        org_id: orgId!,
        client_id,
        responses: answers,
        mechanism_signals: mechanismSignalsFor(answers),
        submitted_at: new Date().toISOString(),
      });
      if (error) throw error;
      // Fire event for content team
      await supabase.from("events").insert({
        org_id: orgId!,
        event_type: "onboarding.submitted",
        subject_type: "onboarding_response",
        payload: { answers, client_id },
      });
    },
    onSuccess: () => { toast.success("Onboarding captured · content team alerted"); qc.invalidateQueries({ queryKey: ["onboarding"] }); setOpen(false); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const updateResp = useMutation({
    mutationFn: async ({ id, answers }: { id: string; answers: Record<string, string> }) => {
      const { error } = await supabase.from("onboarding_responses").update({ responses: answers, mechanism_signals: mechanismSignalsFor(answers) }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Intake updated"); qc.invalidateQueries({ queryKey: ["onboarding"] }); setEditMode(false); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const total = responses?.length ?? 0;
  const submitted = responses?.filter(r => r.submitted_at).length ?? 0;

  const mechanismTagCounts = useMemo(() => {
    const counts: MechanismWeights = emptyWeights();
    let untagged = 0;
    for (const r of responses ?? []) {
      const w = (r.mechanism_signals ?? {}) as Partial<MechanismWeights>;
      let top: (typeof MECHANISM_KEYS)[number] | null = null;
      let topVal = 0;
      for (const k of MECHANISM_KEYS) {
        const v = Number(w[k] ?? 0);
        if (v > topVal) { topVal = v; top = k; }
      }
      if (top) counts[top] += 1; else untagged += 1;
    }
    return { counts, untagged };
  }, [responses]);

  return (
    <>
      <TopBar title="Client Onboarding Psychology" subtitle="Deep intake — pain, beliefs, identity shifts feeding the content engine" />
      <div className="p-6 space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Total -> Submitted reads as a simple 2-stage completion funnel. Pending's
              amber and Insight signals' neutral white are already correct as-is
              (a waiting-state cue and a plain derived count, not funnel miscolors). */}
          <StatCard label="Total intakes" value={total} icon={<Brain className="h-4 w-4" />} spectrum="cold" />
          <StatCard label="Submitted" value={submitted} spectrum="hot" />
          <StatCard label="Pending" value={total - submitted} accent="warning" />
          <StatCard label="Insight signals" value={submitted * QUESTIONS.length} icon={<Sparkles className="h-4 w-4" />} accent="primary" />
        </div>

        {/* Page hero (B1) — mechanism tags are categorical (4 equal content types),
            so they stay neutral/uncolored rather than borrowing spectrum
            decoratively; only the container gets the depth treatment. */}
        <BentoGrid rowHeight="9.5rem">
          <BentoCell span="hero">
            <div className="hover-lift relative flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card p-5">
              <div className="glass-highlight pointer-events-none absolute inset-0 rounded-2xl" />
              <div className="relative flex items-center gap-2 text-3xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                <Brain className="h-3.5 w-3.5" /> Mechanism Signal Tags
              </div>
              <div className="relative mt-1 text-2xs text-muted-foreground">
                Every submission's "first touchpoint" / "decision to join" / "join sooner" answers are scored against the 4 content mechanisms and tagged here — feeds Content Signals' mix directly.
              </div>
              <div className="relative mt-3 grid flex-1 grid-cols-2 gap-2 lg:grid-cols-5">
                {MECHANISM_KEYS.map(k => (
                  <div key={k} className="rounded-md border border-border bg-muted/20 p-2.5">
                    <div className="text-3xs uppercase tracking-wider text-muted-foreground truncate">{MECHANISMS[k].label}</div>
                    <div className="mt-0.5 font-mono text-lg font-semibold tabular-nums">{mechanismTagCounts.counts[k]}</div>
                  </div>
                ))}
                <div className="rounded-md border border-dashed border-border p-2.5">
                  <div className="text-3xs uppercase tracking-wider text-muted-foreground truncate">Untagged</div>
                  <div className="mt-0.5 font-mono text-lg font-semibold tabular-nums text-muted-foreground">{mechanismTagCounts.untagged}</div>
                </div>
              </div>
            </div>
          </BentoCell>
        </BentoGrid>

        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">Each submission triggers a content-team event with extracted beliefs & pain</div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4" />New intake</Button></DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Onboarding intake</DialogTitle></DialogHeader>
              <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); create.mutate(new FormData(e.currentTarget)); }}>
                <div className="space-y-1.5"><Label>Client</Label>
                  <Select name="client_id"><SelectTrigger><SelectValue placeholder="Pick client"/></SelectTrigger>
                    <SelectContent>{(clients ?? []).map(c => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                {(["sales","fulfillment","logistics"] as Section[]).map(sec => (
                  <div key={sec} className="space-y-3 pt-2">
                    <div className="border-t border-border pt-3">
                      <div className="text-2xs font-semibold uppercase tracking-wider text-accent">{SECTION_META[sec].label}</div>
                      <div className="text-2xs text-muted-foreground">{SECTION_META[sec].hint}</div>
                    </div>
                    {QUESTIONS.filter(q => q.section === sec).map(q => {
                      const sig = signalFor(q.key);
                      return (
                      <div key={q.key} className={`space-y-1.5 ${signalClass(sig)}`}>
                        <div className="flex items-center justify-between gap-2">
                          <Label className="text-xs leading-snug">{q.q}</Label>
                          {signalBadge(sig)}
                        </div>
                        {q.type === "short" && <Input name={q.key} maxLength={500} />}
                        {q.type === "long" && <Textarea name={q.key} rows={3} maxLength={2000} />}
                        {q.type === "choice" && (
                          <Select name={q.key}>
                            <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                            <SelectContent>
                              {q.options!.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    );})}
                  </div>
                ))}
                <Button type="submit" className="w-full" disabled={create.isPending}>{create.isPending ? "Saving…" : "Submit intake"}</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Aggregate AI insights — across ALL intakes in selected range */}
        <div className="rounded-lg border-2 border-accent/40 bg-gradient-to-br from-accent/5 to-card p-4 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Sparkles className="h-4 w-4 text-accent" /> Pattern analysis · ALL clients
              </div>
              <div className="text-2xs text-muted-foreground">
                Aggregates answers from <span className="font-semibold text-foreground">every intake</span> in the selected range. Finds repeating bottlenecks to fix and winning patterns to amplify across your client base.
              </div>
            </div>
            <Button size="sm" disabled={aggregateMut.isPending} onClick={() => aggregateMut.mutate()}>
              {aggregateMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
              {aggInsights ? "Re-analyze" : `Analyze (${activeRange.label})`}
            </Button>
          </div>

          {/* Range picker — matches the main dashboard one */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex rounded-md border border-border bg-card overflow-hidden">
              {([
                ["today", "Today"], ["3d", "3d"], ["7d", "7d"], ["30d", "30d"], ["mtd", "MTD"], ["all", "All"], ["custom", "Custom"],
              ] as [AggPreset, string][]).map(([k, label]) => (
                <button key={k} onClick={() => setPreset(k)}
                  className={`px-2.5 py-1 text-xs ${aggPreset === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted/50"}`}>
                  {label}
                </button>
              ))}
            </div>
            {aggPreset === "custom" && (
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-muted-foreground">From</span>
                <Input type="date" value={aggFrom} className="h-7 w-36 text-xs" onChange={(e) => { setAggFrom(e.target.value); setAggInsights(null); }} />
                <span className="text-muted-foreground">To</span>
                <Input type="date" value={aggTo} className="h-7 w-36 text-xs" onChange={(e) => { setAggTo(e.target.value); setAggInsights(null); }} />
              </div>
            )}
            <span className="text-2xs text-muted-foreground font-mono">{activeRange.from} → {activeRange.to}</span>
          </div>


          {aggInsights && (
            aggInsights.sampleSize === 0 ? (
              <div className="text-xs text-muted-foreground italic animate-in fade-in-0 duration-300">No intakes in this range yet.</div>
            ) : (
              <div className="grid md:grid-cols-2 gap-3 animate-in fade-in-0 slide-in-from-top-1 duration-300">
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 space-y-2">
                  <div className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-destructive">
                    <TrendingDown className="h-3 w-3" /> Bottlenecks across {aggInsights.sampleSize} intakes
                  </div>
                  {aggInsights.bottlenecks.length === 0 && <div className="text-xs text-muted-foreground italic">None surfaced.</div>}
                  {aggInsights.bottlenecks.map((i, idx) => (
                    <div key={idx} className="space-y-1">
                      <div className="text-xs font-semibold">{i.title}</div>
                      <div className="text-2xs text-muted-foreground leading-relaxed">{i.body}</div>
                      <div className="text-2xs text-destructive"><span className="font-semibold">Fix: </span>{i.recommendation}</div>
                    </div>
                  ))}
                </div>
                <div className="rounded-md border border-success/30 bg-success/5 p-3 space-y-2">
                  <div className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-success">
                    <TrendingUp className="h-3 w-3" /> Double down across {aggInsights.sampleSize} intakes
                  </div>
                  {aggInsights.double_down.length === 0 && <div className="text-xs text-muted-foreground italic">None surfaced.</div>}
                  {aggInsights.double_down.map((i, idx) => (
                    <div key={idx} className="space-y-1">
                      <div className="text-xs font-semibold">{i.title}</div>
                      <div className="text-2xs text-muted-foreground leading-relaxed">{i.body}</div>
                      <div className="text-2xs text-success"><span className="font-semibold">Amplify: </span>{i.recommendation}</div>
                    </div>
                  ))}
                </div>
              </div>
            )
          )}
        </div>

        <Tabs defaultValue="intakes">

          <TabsList>
            <TabsTrigger value="intakes">Intakes · {responses?.length ?? 0}</TabsTrigger>
            <TabsTrigger value="themes"><Cloud className="h-3.5 w-3.5 mr-1" />Themes</TabsTrigger>
          </TabsList>

          <TabsContent value="intakes">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="rounded-lg border border-border bg-card overflow-hidden lg:col-span-1">
                <div className="bg-muted/40 px-3 py-2 text-2xs uppercase tracking-wider text-muted-foreground">Recent intakes</div>
                <div className="p-2 border-b border-border">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input placeholder="Search by client or answers…" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-8 h-8 text-xs" />
                  </div>
                </div>
                <div className="divide-y divide-border max-h-[60vh] overflow-y-auto">
                  {(responses ?? []).filter(r => {
                    const q = query.trim().toLowerCase(); if (!q) return true;
                    const name = (r.clients?.full_name ?? "").toLowerCase();
                    const ans = Object.values((r.responses ?? {}) as Record<string,string>).join(" ").toLowerCase();
                    return name.includes(q) || ans.includes(q);
                  }).map(r => (
                    <button key={r.id} onClick={() => setSelected(r.id)} className={`w-full text-left p-3 hover:bg-muted/30 ${selected === r.id ? "bg-muted/40" : ""}`}>
                      <div className="font-medium text-sm">{r.clients?.full_name ?? "(no client linked)"}</div>
                      <div className="text-2xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</div>
                    </button>
                  ))}
                  {(!responses || responses.length === 0) && <div className="p-6 text-center text-xs text-muted-foreground">No intakes yet.</div>}
                </div>
              </div>
              <div className="rounded-lg border border-border bg-card p-4 lg:col-span-2">
                {selected ? (() => {
                  const r = responses?.find(x => x.id === selected);
                  if (!r) return null;
                  const ans = (r.responses ?? {}) as Record<string, string>;
                  const draft = editMode ? editDraft : ans;
                  return (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm font-semibold"><MessageSquareQuote className="h-4 w-4 text-accent" /> {r.clients?.full_name ?? "Intake"}</div>
                        {editMode ? (
                          <div className="flex gap-1">
                            <Button size="sm" variant="outline" onClick={() => setEditMode(false)}>Cancel</Button>
                            <Button size="sm" disabled={updateResp.isPending} onClick={() => updateResp.mutate({ id: r.id, answers: editDraft })}>
                              <Save className="h-3.5 w-3.5" /> Save
                            </Button>
                          </div>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => { setEditDraft(ans); setEditMode(true); }}>
                            <Pencil className="h-3.5 w-3.5" /> Edit
                          </Button>
                        )}
                      </div>



                      {/* AI insights */}
                      <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            <Sparkles className="h-3.5 w-3.5 text-accent" /> AI insights from this intake
                          </div>
                          <Button size="sm" variant="outline" disabled={analyzeMut.isPending} onClick={() => analyzeMut.mutate(r.id)}>
                            {analyzeMut.isPending && analyzeMut.variables === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                            {insightsByResp[r.id] ? "Re-analyze" : "Analyze"}
                          </Button>
                        </div>
                        {insightsByResp[r.id] ? (
                          <div className="grid md:grid-cols-2 gap-3">
                            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 space-y-2">
                              <div className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-destructive">
                                <TrendingDown className="h-3 w-3" /> Bottlenecks to fix
                              </div>
                              {insightsByResp[r.id].bottlenecks.length === 0 && <div className="text-xs text-muted-foreground italic">None surfaced.</div>}
                              {insightsByResp[r.id].bottlenecks.map((i, idx) => (
                                <div key={idx} className="space-y-1">
                                  <div className="text-xs font-semibold">{i.title}</div>
                                  <div className="text-2xs text-muted-foreground leading-relaxed">{i.body}</div>
                                  <div className="text-2xs text-destructive"><span className="font-semibold">Fix: </span>{i.recommendation}</div>
                                </div>
                              ))}
                            </div>
                            <div className="rounded-md border border-success/30 bg-success/5 p-3 space-y-2">
                              <div className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-success">
                                <TrendingUp className="h-3 w-3" /> Double down on
                              </div>
                              {insightsByResp[r.id].double_down.length === 0 && <div className="text-xs text-muted-foreground italic">None surfaced.</div>}
                              {insightsByResp[r.id].double_down.map((i, idx) => (
                                <div key={idx} className="space-y-1">
                                  <div className="text-xs font-semibold">{i.title}</div>
                                  <div className="text-2xs text-muted-foreground leading-relaxed">{i.body}</div>
                                  <div className="text-2xs text-success"><span className="font-semibold">Amplify: </span>{i.recommendation}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="text-xs text-muted-foreground">
                            Click <span className="font-semibold">Analyze</span> to extract fixable bottlenecks (red questions) and high-leverage patterns to double down on (green questions) from this client's answers.
                          </div>
                        )}
                      </div>

                      {(["sales","fulfillment","logistics"] as Section[]).map(sec => (
                        <div key={sec} className="space-y-2 pt-2">
                          <div className="border-t border-border pt-3">
                            <div className="text-2xs font-semibold uppercase tracking-wider text-accent">{SECTION_META[sec].label}</div>
                            <div className="text-2xs text-muted-foreground">{SECTION_META[sec].hint}</div>
                          </div>
                          {QUESTIONS.filter(q => q.section === sec).map(q => {
                            const sig = signalFor(q.key);
                            return (
                            <div key={q.key} className={`space-y-1 ${signalClass(sig)}`}>
                              <div className="flex items-center justify-between gap-2">
                                <div className="text-2xs uppercase tracking-wider text-muted-foreground">{q.q}</div>
                                {signalBadge(sig)}
                              </div>
                              {editMode ? (
                                q.type === "long"
                                  ? <Textarea rows={3} value={draft[q.key] ?? ""} onChange={(e) => setEditDraft(d => ({ ...d, [q.key]: e.target.value }))} />
                                  : q.type === "choice"
                                    ? <Select value={draft[q.key] ?? ""} onValueChange={(v) => setEditDraft(d => ({ ...d, [q.key]: v }))}>
                                        <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                                        <SelectContent>{q.options!.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                                      </Select>
                                    : <Input value={draft[q.key] ?? ""} onChange={(e) => setEditDraft(d => ({ ...d, [q.key]: e.target.value }))} />
                              ) : (
                                ans[q.key] ? <div className={`rounded p-3 text-sm whitespace-pre-wrap ${sig === "bottleneck" ? "bg-destructive/5" : sig === "double_down" ? "bg-success/5" : "bg-muted/30"}`}>{ans[q.key]}</div> : <div className="text-xs text-muted-foreground italic">—</div>
                              )}
                            </div>
                          );})}
                        </div>
                      ))}
                    </div>
                  );
                })() : <div className="text-center text-xs text-muted-foreground py-10">Select an intake to view answers</div>}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="themes">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {THEME_GROUPS.map(group => {
                const texts = (responses ?? []).flatMap(r => {
                  const ans = (r.responses ?? {}) as Record<string, string>;
                  return group.keys.map(k => ans[k]).filter(Boolean);
                });
                const phrases = topPhrases(texts, 2, 15);
                const maxCount = phrases[0]?.count ?? 1;
                return (
                  <div key={group.label} className="rounded-lg border border-border bg-card p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <group.icon className="h-4 w-4 text-accent" />
                      <div className="text-sm font-semibold">{group.label}</div>
                      <span className="text-3xs text-muted-foreground">{texts.length} responses</span>
                    </div>
                    <div className="text-2xs text-muted-foreground mb-3">{group.hint}</div>
                    {phrases.length === 0 ? (
                      <div className="text-xs text-muted-foreground py-6 text-center">Need 2+ intakes with repeated phrases to surface themes.</div>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {phrases.map(p => {
                          const scale = 0.75 + 0.5 * (p.count / maxCount);
                          return (
                            <span key={p.phrase}
                              className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2.5 py-1 text-accent"
                              style={{ fontSize: `${scale * 0.85}rem` }}
                            >
                              {p.phrase}
                              <span className="text-3xs font-mono text-muted-foreground">×{p.count}</span>
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}

const THEME_GROUPS = [
  { label: "Pain points", keys: ["current_pain", "tried_before"], icon: MessageSquareQuote, hint: "What problems clients say they're trying to solve — feeds hook + offer copy" },
  { label: "Pivotal moments", keys: ["pivotal_moment", "beliefs_shifted"], icon: Sparkles, hint: "The exact moments + beliefs that converted them — replicate in content" },
  { label: "Objections that almost killed the sale", keys: ["objections_before", "fear"], icon: Brain, hint: "Pre-emptive content + script targets" },
  { label: "Desired identity", keys: ["desired_identity", "why_us"], icon: Cloud, hint: "Aspirational language to mirror in long-form + sales" },
] as const;
