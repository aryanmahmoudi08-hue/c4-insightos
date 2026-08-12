import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useCurrentOrg } from "@/hooks/use-auth";
import { TopBar } from "@/components/app-sidebar";
import { useMemo, useState, Fragment } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, Video, Layers, Pencil, ExternalLink, Trash2, Sparkles, ChevronRight, ChevronDown, Eye, Flame, Download } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { analyzeContent } from "@/lib/analyze-content.functions";
import { dispatchContentReady } from "@/lib/dispatch.functions";
import { coachContentFn } from "@/lib/coach-content.functions";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip } from "recharts";
import { PageHero } from "@/components/page-hero";
import { MetricCard } from "@/components/metric-card";
import { HeatmapGrid } from "@/components/heatmap-grid";
import { mockContentPieces, mockContentFunnel, mockVariationHeatmap, mockContentCoaching, mockContentClassification, withMockDelay } from "@/lib/dev-mock-data";
import { MECHANISMS, MECHANISM_KEYS, questionsFor, type MechanismKey, type VariationQuestion } from "@/lib/content-mechanisms";
import type { Database } from "@/integrations/supabase/types";
import { GlassTableShell } from "@/components/glass-table";
import { EmptyState } from "@/components/empty-state";
import { CHIP_TONE_CLASSES } from "@/components/ui/badge";
import { BentoGrid, BentoCell } from "@/components/bento-grid";
import { SPECTRUM_VAR, SPECTRUM_CHIP_CLASS, type SpectrumPosition } from "@/lib/spectrum";

type Platform = Database["public"]["Enums"]["content_platform"];
type Angle = Database["public"]["Enums"]["content_angle"];

type PieceRow = {
  id: string; title: string | null; platform: Platform; hook: string | null;
  angle: Angle | null; posted_at: string | null; url: string | null;
  funnel_stage: string | null; body: string | null; pipeline_status: string;
  mechanism?: string | null; variation?: string | null; variation_answers?: Record<string, string> | null;
  content_metrics: { views: number | null; likes: number | null; leads_generated: number | null; closes: number | null;
    cash_collected_cents: number | null; hook_retention_pct: number | null;
    comments: number | null; shares: number | null; saves: number | null;
    follower_views: number | null; non_follower_views: number | null;
    engagement_rate_pct: number | null; drop_off_rate_pct: number | null }[] | null;
};

const fmtN = (n: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(n));

const PIPELINE: { key: string; label: string; tone: string }[] = [
  { key: "draft", label: "Draft", tone: CHIP_TONE_CLASSES.default },
  { key: "in_review", label: "In Review", tone: CHIP_TONE_CLASSES.warning },
  { key: "approved", label: "Approved", tone: CHIP_TONE_CLASSES.info },
  { key: "ready_to_post", label: "Ready to Post", tone: CHIP_TONE_CLASSES.success },
  { key: "posted", label: "Posted", tone: CHIP_TONE_CLASSES.default },
];

// Top/Middle/Bottom-of-funnel is literally the spectrum's own cold/mid/hot
// vocabulary — was previously split across a semantic ChipTone mapping (table)
// and raw hardcoded blue-500/amber-500/emerald-500 (kanban card + calendar),
// the exact banned-default-Tailwind-hue pattern (B7). Unified to spectrum.
const FUNNEL_SPECTRUM: Record<string, SpectrumPosition> = { TOF: "cold", MOF: "mid", BOF: "hot" };
const funnelChip = (stage: string | null) => stage && FUNNEL_SPECTRUM[stage] ? SPECTRUM_CHIP_CLASS[FUNNEL_SPECTRUM[stage]] : CHIP_TONE_CLASSES.default;

type Prefill = {
  id?: string; title?: string; hook?: string; platform?: Platform; angle?: Angle; url?: string; transcript?: string;
  mechanism?: string; variation?: string; variationAnswers?: Record<string, string>;
  views?: number; leads?: number; retention?: number;
  likes?: number; comments?: number; shares?: number; saves?: number;
  followerViews?: number; nonFollowerViews?: number; engagementRatePct?: number; dropOffRatePct?: number;
};

export const Route = createFileRoute("/_authenticated/content")({ component: ContentIntel });

function ContentIntel() {
  const { data: org } = useCurrentOrg();
  const orgId = org?.org_id;
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [prefill, setPrefill] = useState<Prefill | null>(null);
  const [slidesFor, setSlidesFor] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [overviewFor, setOverviewFor] = useState<PieceRow | null>(null);

  const toggleExpand = (id: string) => setExpanded(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const { devBypass } = useAuth();
  const { data: pieces } = useQuery({
    queryKey: ["content", orgId, devBypass],
    enabled: !!orgId,
    queryFn: async () => {
      if (devBypass) return mockContentPieces() as unknown as PieceRow[];
      const { data, error } = await supabase
        .from("content_pieces")
        .select("id, title, platform, hook, angle, posted_at, url, funnel_stage, body, pipeline_status, mechanism, variation, variation_answers, content_metrics(views, likes, leads_generated, closes, cash_collected_cents, hook_retention_pct, comments, shares, saves, follower_views, non_follower_views, engagement_rate_pct, drop_off_rate_pct)")
        .eq("org_id", orgId!)
        .order("posted_at", { ascending: false, nullsFirst: false })
        .limit(200);
      if (error) throw error;
      return data as unknown as PieceRow[];
    },
  });

  const dispatchReadyFn = useServerFn(dispatchContentReady);
  type SchedulePatch = {
    scheduled_date: string; scheduled_time: string; post_format: string;
    repurpose_plan: string; voice_notes: string; why_it_works: string; posting_instructions: string;
  };
  const [schedulingFor, setSchedulingFor] = useState<PieceRow | null>(null);
  const moveStatus = useMutation({
    mutationFn: async ({ id, status, schedule }: { id: string; status: string; schedule?: SchedulePatch }) => {
      const patch: Partial<Database["public"]["Tables"]["content_pieces"]["Update"]> = { pipeline_status: status };
      if (status === "posted") patch.posted_at = new Date().toISOString();
      if (schedule) {
        patch.scheduled_date = schedule.scheduled_date || null;
        patch.scheduled_time = schedule.scheduled_time || null;
        patch.post_format = schedule.post_format || null;
        patch.repurpose_plan = schedule.repurpose_plan || null;
        patch.voice_notes = schedule.voice_notes || null;
        patch.why_it_works = schedule.why_it_works || null;
        patch.posting_instructions = schedule.posting_instructions || null;
      }
      const { error } = await supabase.from("content_pieces").update(patch).eq("id", id);
      if (error) throw error;

      if (status === "ready_to_post") {
        try { await dispatchReadyFn({ data: { contentId: id } }); } catch (e) { console.warn("dispatch failed", e); }
      }
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["content"] });
      qc.invalidateQueries({ queryKey: ["content-schedule"] });
      setSchedulingFor(null);
      if (vars.status === "ready_to_post") toast.success("Scheduled · added to the Content Calendar and sent to the admin channel");
      else toast.success("Moved to " + (PIPELINE.find(p => p.key === vars.status)?.label ?? vars.status));
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });


  const save = useMutation({
    mutationFn: async (form: FormData) => {
      const editingId = prefill?.id;
      const payload = {
        org_id: orgId!,
        title: String(form.get("title") || ""),
        hook: String(form.get("hook") || "") || null,
        platform: form.get("platform") as Platform,
        angle: (form.get("angle") as Angle) || null,
        url: String(form.get("url") || "") || null,
        body: String(form.get("transcript") || "") || null,
        mechanism: String(form.get("mechanism") || "") || null,
        variation: String(form.get("variation") || "") || null,
        variation_answers: JSON.parse(String(form.get("variation_answers") || "{}")),
      };
      let contentId = editingId;
      if (editingId) {
        const { error } = await supabase.from("content_pieces").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { data: piece, error } = await supabase
          .from("content_pieces")
          .insert({ ...payload, posted_at: new Date().toISOString() })
          .select("id").single();
        if (error) throw error;
        contentId = piece.id;
      }
      const metrics = {
        views: Number(form.get("views") || 0),
        leads_generated: Number(form.get("leads") || 0),
        hook_retention_pct: Number(form.get("retention") || 0),
        likes: Number(form.get("likes") || 0),
        comments: Number(form.get("comments") || 0),
        shares: Number(form.get("shares") || 0),
        saves: Number(form.get("saves") || 0),
        follower_views: Number(form.get("follower_views") || 0),
        non_follower_views: Number(form.get("non_follower_views") || 0),
        engagement_rate_pct: Number(form.get("engagement_rate_pct") || 0),
        drop_off_rate_pct: Number(form.get("drop_off_rate_pct") || 0),
      };
      if (editingId) {
        const { data: existing } = await supabase
          .from("content_metrics").select("id").eq("content_id", editingId).limit(1).maybeSingle();
        if (existing) {
          await supabase.from("content_metrics").update(metrics).eq("id", existing.id);
        } else {
          await supabase.from("content_metrics").insert({ org_id: orgId!, content_id: contentId!, ...metrics });
        }
      } else {
        await supabase.from("content_metrics").insert({ org_id: orgId!, content_id: contentId!, ...metrics });
      }
    },
    onSuccess: () => { toast.success(prefill?.id ? "Content updated" : "Content logged"); qc.invalidateQueries({ queryKey: ["content"] }); setOpen(false); setPrefill(null); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("content_metrics").delete().eq("content_id", id);
      await supabase.from("slide_metrics").delete().eq("org_id", orgId!).in("slide_id",
        (await supabase.from("story_slides").select("id").eq("content_id", id)).data?.map(s => s.id) ?? []);
      await supabase.from("story_slides").delete().eq("content_id", id);
      await supabase.from("lead_content_touches").delete().eq("content_id", id);
      const { error } = await supabase.from("content_pieces").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["content"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const edit = (p: PieceRow) => {
    const m = (p.content_metrics ?? [])[0];
    setPrefill({
      id: p.id,
      title: p.title ?? undefined,
      hook: p.hook ?? undefined,
      platform: p.platform,
      angle: p.angle ?? undefined,
      url: p.url ?? undefined,
      transcript: p.body ?? undefined,
      mechanism: p.mechanism ?? undefined,
      variation: p.variation ?? undefined,
      variationAnswers: p.variation_answers ?? undefined,
      views: m?.views ?? 0,
      leads: m?.leads_generated ?? 0,
      retention: m?.hook_retention_pct ?? 0,
      likes: m?.likes ?? 0,
      comments: m?.comments ?? 0,
      shares: m?.shares ?? 0,
      saves: m?.saves ?? 0,
      followerViews: m?.follower_views ?? 0,
      nonFollowerViews: m?.non_follower_views ?? 0,
      engagementRatePct: m?.engagement_rate_pct ?? 0,
      dropOffRatePct: m?.drop_off_rate_pct ?? 0,
    });
    setOpen(true);
  };

  // Performance overview — funnel totals, top hooks, mechanism x variation heatmap.
  const perf = useMemo(() => {
    const list = pieces ?? [];
    const metricsOf = (p: PieceRow) => p.content_metrics?.[0];
    const totals = list.reduce((s, p) => {
      const m = metricsOf(p);
      s.views += m?.views ?? 0;
      s.leads += m?.leads_generated ?? 0;
      s.closes += m?.closes ?? 0;
      s.cash += m?.cash_collected_cents ?? 0;
      return s;
    }, { views: 0, leads: 0, closes: 0, cash: 0 });

    if (devBypass) {
      const mock = mockContentFunnel();
      const heat = mockVariationHeatmap();
      const top = [...list].sort((a, b) => (metricsOf(b)?.hook_retention_pct ?? 0) - (metricsOf(a)?.hook_retention_pct ?? 0)).slice(0, 4);
      return { totals: mock, topHooks: top, heatmapRows: heat.rows, heatmapCols: heat.cols, heatmapData: heat.data, postedThisWeek: 4, inReview: 1 };
    }

    const top = [...list]
      .filter(p => metricsOf(p)?.hook_retention_pct != null)
      .sort((a, b) => (metricsOf(b)?.hook_retention_pct ?? 0) - (metricsOf(a)?.hook_retention_pct ?? 0))
      .slice(0, 4);

    const heatRows = MECHANISM_KEYS.map(k => MECHANISMS[k].label);
    const heatCols = ["Var 1", "Var 2"];
    const heatData = MECHANISM_KEYS.map(k => {
      const vars = MECHANISMS[k].variations.map(v => v.value);
      return vars.slice(0, 2).map(vv => {
        const matches = list.filter(p => p.mechanism === k && p.variation === vv);
        if (!matches.length) return 0;
        return Math.round(matches.reduce((s, p) => s + (metricsOf(p)?.views ?? 0), 0) / matches.length);
      });
    });

    const now = Date.now();
    const postedThisWeek = list.filter(p => p.posted_at && now - new Date(p.posted_at).getTime() < 7 * 86400e3).length;
    const inReview = list.filter(p => p.pipeline_status === "in_review").length;

    return { totals, topHooks: top, heatmapRows: heatRows, heatmapCols: heatCols, heatmapData: heatData, postedThisWeek, inReview };
  }, [pieces, devBypass]);

  // Real month-grid calendar with month/year navigation.
  const [cursor, setCursor] = useState(() => {
    const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return d;
  });
  const calendar = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const first = new Date(year, month, 1);
    const lead = first.getDay(); // 0=Sun
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const totalCells = Math.ceil((lead + daysInMonth) / 7) * 7;
    const cells: { date: string; inMonth: boolean; pieces: PieceRow[] }[] = [];
    for (let i = 0; i < totalCells; i++) {
      const dt = new Date(year, month, i - lead + 1);
      const iso = dt.toISOString().slice(0, 10);
      cells.push({ date: iso, inMonth: dt.getMonth() === month, pieces: [] });
    }
    for (const p of pieces ?? []) {
      if (!p.posted_at) continue;
      const iso = p.posted_at.slice(0, 10);
      const slot = cells.find(c => c.date === iso);
      if (slot) slot.pieces.push(p);
    }
    const weeks: typeof cells[] = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    return weeks;
  }, [pieces, cursor]);
  const monthLabel = cursor.toLocaleString("default", { month: "long", year: "numeric" });
  const shiftMonth = (delta: number) => {
    setCursor(c => { const n = new Date(c); n.setMonth(c.getMonth() + delta); return n; });
  };


  const exportCsv = () => {
    const rows = pieces ?? [];
    const header = ["title", "platform", "status", "views", "leads", "closes", "cash_cents", "retention_pct"];
    const lines = rows.map(p => {
      const m = p.content_metrics?.[0];
      return [p.title ?? "", p.platform, p.pipeline_status, m?.views ?? 0, m?.leads_generated ?? 0, m?.closes ?? 0, m?.cash_collected_cents ?? 0, m?.hook_retention_pct ?? ""].join(",");
    });
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "content-intelligence.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <TopBar title="Content Intelligence" subtitle="Hooks, retention, cash-per-view" />
      <div className="p-6 space-y-4">
        <PageHero
          icon={<Video className="h-5 w-5" />}
          eyebrow="ContentOS"
          title="Content Intelligence"
          subtitle="Every post, tagged by mechanism and variation, tracked hook-to-cash."
          status={[
            { label: `${pieces?.length ?? 0} pieces tracked`, tone: "default" },
            { label: `${perf.postedThisWeek} posted this week`, tone: "success" },
            ...(perf.inReview > 0 ? [{ label: `${perf.inReview} in review`, tone: "warning" as const }] : []),
          ]}
          stats={[
            { label: "Views", value: fmtN(perf.totals.views), spectrum: "cold" },
            { label: "Leads", value: fmtN(perf.totals.leads), spectrum: "mid" },
            { label: "Closes", value: fmtN(perf.totals.closes), spectrum: "hot" },
            { label: "Cash", value: "$" + fmtN(perf.totals.cash / 100), spectrum: "hot" },
          ]}
          actions={
            <>
              <Button variant="outline" size="sm" onClick={exportCsv}><Download className="h-3.5 w-3.5" />Export CSV</Button>
              <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setPrefill(null); }}>
                <DialogTrigger asChild><Button size="sm" onClick={() => setPrefill(null)}><Plus className="h-4 w-4" />Log content</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>{prefill?.id ? "Edit content piece" : "Log content piece"}</DialogTitle></DialogHeader>
                  <ContentForm key={prefill?.id ?? "new"} prefill={prefill} onSubmit={(fd) => save.mutate(fd)} pending={save.isPending} />
                </DialogContent>
              </Dialog>
            </>
          }
        />

        {/* Enterprise metric visualizers */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 stagger-fade">
          <MetricCard label="Views" value={fmtN(perf.totals.views)} icon={<Eye className="h-3 w-3" />} spectrum="cold" deltaPct={12} spark={[40, 55, 48, 62, 70, 65, 80]} />
          <MetricCard label="Leads generated" value={fmtN(perf.totals.leads)} icon={<Sparkles className="h-3 w-3" />} spectrum="mid" deltaPct={8} spark={[3, 5, 4, 6, 7, 6, 9]} sparkVariant="bar" />
          <MetricCard label="Closes attributed" value={fmtN(perf.totals.closes)} icon={<Flame className="h-3 w-3" />} spectrum="hot" deltaPct={-4} spark={[2, 3, 2, 3, 1, 2, 3]} sparkVariant="bar" />
          <MetricCard label="Cash attributed" value={"$" + fmtN(perf.totals.cash / 100)} icon={<Layers className="h-3 w-3" />} spectrum="hot" deltaPct={21} spark={[4, 6, 5, 8, 9, 10, 12]} />
        </div>

        {/* Content -> Cash funnel — the page's hero moment (B1), promoted into a
            bento hero with bands now in strict spectrum order instead of a flat
            foreground-opacity ramp. Hook comparison stays alongside it. */}
        <BentoGrid cols={2} rowHeight="9.5rem">
          <BentoCell span="hero">
            <div className="hover-lift relative flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card p-5">
              <div className="glass-highlight pointer-events-none absolute inset-0 rounded-2xl" />
              <div className="relative text-3xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Content → Cash Funnel</div>
              <div className="relative flex-1 flex flex-col justify-center space-y-2 py-3">
                {([
                  { stage: "Views", value: perf.totals.views, spectrum: "cold" },
                  { stage: "Leads", value: perf.totals.leads, spectrum: "mid" },
                  { stage: "Closes", value: perf.totals.closes, spectrum: "hot" },
                ] as { stage: string; value: number; spectrum: SpectrumPosition }[]).map((f, i, arr) => {
                  const max = arr[0].value || 1;
                  const width = Math.max(6, Math.round((f.value / max) * 100));
                  return (
                    <div key={f.stage} className="space-y-0.5">
                      <div className="flex items-center justify-between text-2xs">
                        <span className="font-medium">{f.stage}</span>
                        <span className="font-mono text-muted-foreground">{fmtN(f.value)}</span>
                      </div>
                      <div className="h-5 rounded bg-muted/30 overflow-hidden">
                        <div className="h-full rounded transition-all duration-500" style={{ width: `${width}%`, background: SPECTRUM_VAR[f.spectrum] }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </BentoCell>
        </BentoGrid>

        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-sm font-semibold mb-3">Top hooks by retention</div>
          <div className="grid sm:grid-cols-2 gap-2.5 stagger-fade">
            {perf.topHooks.map((p) => {
              const m = p.content_metrics?.[0];
              const retention = m?.hook_retention_pct ?? 0;
              return (
                <div key={p.id} className="hover-lift rounded-lg border border-border bg-background/60 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-xs font-medium leading-snug line-clamp-2">{p.title || p.hook || "(untitled)"}</div>
                    {/* Threshold-based quality signal, correctly kept semantic (not a spectrum miscolor). */}
                    <span className={`badge-glass normal-case tracking-normal shrink-0 ${retention >= 55 ? "text-[color:var(--color-success)]" : "text-muted-foreground"}`}>
                      <Flame className="h-2.5 w-2.5" />{retention}% retention
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-3xs font-mono text-muted-foreground">
                    <span>{fmtN(m?.views ?? 0)} views</span>
                    <span>{m?.leads_generated ?? 0} leads</span>
                    <span className="capitalize">{p.platform?.replace(/_/g, " ")}</span>
                  </div>
                </div>
              );
            })}
            {perf.topHooks.length === 0 && <div className="text-xs text-muted-foreground italic sm:col-span-2">Log content with hook retention % to see top performers here.</div>}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-semibold">Mechanism × variation heatmap</div>
            <div className="text-3xs text-muted-foreground">Avg views per piece</div>
          </div>
          <HeatmapGrid rowLabels={perf.heatmapRows} colLabels={perf.heatmapCols} data={perf.heatmapData} valueFmt={(v) => fmtN(v) + " views"} variant="spectrum" />
        </div>

        <Tabs defaultValue="pipeline">
          <TabsList>
            <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
            <TabsTrigger value="table">Table</TabsTrigger>
            <TabsTrigger value="calendar">Calendar</TabsTrigger>
          </TabsList>

          <TabsContent value="pipeline">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
              {PIPELINE.map((col, colIdx) => {
                const items = (pieces ?? []).filter(p => (p.pipeline_status ?? "draft") === col.key);
                return (
                  <div key={col.key} className="rounded-lg border border-border bg-card flex flex-col min-h-[300px]">
                    <div className="px-3 py-2 border-b border-border flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`text-3xs font-mono uppercase px-1.5 py-0.5 rounded ${col.tone}`}>{col.label}</span>
                        <span className="text-2xs text-muted-foreground">{items.length}</span>
                      </div>
                    </div>
                    <div className="p-2 space-y-2 flex-1 overflow-y-auto max-h-[70vh]">
                      {items.length === 0 && (
                        <div className="text-2xs text-muted-foreground italic text-center py-6">Empty</div>
                      )}
                      {items.map(p => (
                        <div key={p.id} className="rounded-md border border-border bg-background p-2.5 space-y-1.5 hover:border-accent/40 transition-colors">
                          <div className="flex items-start justify-between gap-2">
                            <button onClick={() => setOverviewFor(p)} className="text-xs font-medium leading-snug text-left hover:text-accent line-clamp-2">{p.title || "(untitled)"}</button>
                            {p.funnel_stage && (
                              <span className={`shrink-0 inline-block rounded px-1 py-0.5 text-4xs font-mono uppercase ${funnelChip(p.funnel_stage)}`}>{p.funnel_stage}</span>
                            )}
                          </div>
                          {p.hook && <div className="text-2xs text-muted-foreground line-clamp-2">{p.hook}</div>}
                          <div className="flex items-center justify-between pt-1">
                            <span className="text-3xs uppercase text-muted-foreground">{p.platform}</span>
                            <div className="flex gap-1">
                              {colIdx > 0 && (
                                <button title="Move back"
                                  onClick={() => moveStatus.mutate({ id: p.id, status: PIPELINE[colIdx - 1].key })}
                                  className="text-3xs text-muted-foreground hover:text-foreground px-1">←</button>
                              )}
                              {colIdx < PIPELINE.length - 1 && (
                                <button title={PIPELINE[colIdx + 1].key === "ready_to_post" ? "Schedule it · lands on the client calendar" : "Advance"}
                                  onClick={() => {
                                    const next = PIPELINE[colIdx + 1].key;
                                    if (next === "ready_to_post") setSchedulingFor(p);
                                    else moveStatus.mutate({ id: p.id, status: next });
                                  }}
                                  className="text-3xs text-accent hover:text-accent/80 px-1 font-semibold">→</button>
                              )}

                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-2xs text-muted-foreground mt-3">
              Tip: when a piece moves to <span className="font-mono">Ready to Post</span> the team's posting-channel automation will fire. New ideas land in <span className="font-mono">Draft</span> by default — log content above to start the pipeline.
            </p>
          </TabsContent>


          <TabsContent value="table">
            <GlassTableShell>
              <table className="w-full min-w-[1200px] text-sm">
                <thead className="sticky-thead bg-muted/40 text-2xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="w-6 p-3"></th>
                    <th className="text-left p-3">Title</th><th className="text-left p-3">Platform</th><th className="text-left p-3">Angle</th>
                    <th className="text-center p-3">Funnel</th>
                    <th className="text-center p-3">Link</th>
                    <th className="text-right p-3 font-mono">Views</th><th className="text-right p-3 font-mono">Leads</th>
                    <th className="text-right p-3 font-mono">Closes</th><th className="text-right p-3 font-mono">Cash</th>
                    <th className="text-right p-3 font-mono">Retention</th><th className="text-right p-3"></th></tr>
                </thead>
                <tbody>
                  {(pieces ?? []).map((p) => {
                    const m = (p.content_metrics ?? [])[0];
                    const isOpen = expanded.has(p.id);
                    return (
                      <Fragment key={p.id}>
                        <tr className="border-t border-border hover:bg-muted/20">
                          <td className="p-3 align-top">
                            <button onClick={() => toggleExpand(p.id)} className="text-muted-foreground hover:text-foreground" title={isOpen ? "Hide transcript" : "Show transcript"}>
                              {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </button>
                          </td>
                          <td className="p-3">
                            <div className="flex items-start gap-2"><Video className="h-3.5 w-3.5 text-muted-foreground mt-0.5" />
                              <button onClick={() => setOverviewFor(p)} className="min-w-0 text-left group">
                                <div className="truncate font-medium group-hover:text-accent group-hover:underline">
                                  {(p.title || "(untitled)")}
                                </div>
                              </button>
                            </div>
                          </td>
                          <td className="p-3 text-xs uppercase text-muted-foreground">{p.platform}</td>
                          <td className="p-3 text-xs">{p.angle ?? "—"}</td>
                          <td className="p-3 text-center">
                            {p.funnel_stage ? (
                              <span className={`inline-block rounded px-1.5 py-0.5 text-3xs font-mono uppercase ${funnelChip(p.funnel_stage)}`}>{p.funnel_stage}</span>
                            ) : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="p-3 text-center">{p.url ? (
                            <a href={p.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline" title={p.url}>
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          ) : <span className="text-muted-foreground">—</span>}</td>
                          <td className="p-3 text-right font-mono">{m?.views?.toLocaleString() ?? "—"}</td>
                          <td className="p-3 text-right font-mono">{m?.leads_generated ?? "—"}</td>
                          <td className="p-3 text-right font-mono">{m?.closes ?? "—"}</td>
                          <td className="p-3 text-right font-mono">{m?.cash_collected_cents ? "$"+Math.round(m.cash_collected_cents/100) : "—"}</td>
                          <td className="p-3 text-right font-mono">{m?.hook_retention_pct ? m.hook_retention_pct+"%" : "—"}</td>
                          <td className="p-3 text-right whitespace-nowrap">
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => edit(p)}>
                              <Pencil className="h-3 w-3" />Edit
                            </Button>
                            {p.platform === "story_sequence" && (
                              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSlidesFor(p.id)}>
                                <Layers className="h-3 w-3" />Slides
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:text-destructive" onClick={() => { if (confirm(`Delete "${p.title || "this piece"}"? This cannot be undone.`)) del.mutate(p.id); }}>
                              <Trash2 className="h-3 w-3" />Delete
                            </Button>
                          </td>
                        </tr>
                        {isOpen && (
                          <tr key={p.id + "-tx"} className="bg-muted/10 border-t border-border/50">
                            <td></td>
                            <td colSpan={11} className="p-3">
                              <div className="text-3xs uppercase tracking-wider text-muted-foreground mb-1">Transcript</div>
                              <div className="whitespace-pre-wrap text-xs text-foreground/90 max-h-64 overflow-y-auto rounded bg-background/50 p-3 border border-border">
                                {p.body || <span className="text-muted-foreground italic">No transcript yet. Add one via Edit.</span>}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                  {(!pieces || pieces.length === 0) && (
                    <tr><td colSpan={12}><EmptyState icon={<Video className="h-4 w-4" />} title="No content yet" description="Log your first piece." /></td></tr>
                  )}
                </tbody>
              </table>
            </GlassTableShell>
          </TabsContent>


          <TabsContent value="calendar">
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => shiftMonth(-1)} className="h-8 w-8 p-0">‹</Button>
                  <div className="display-serif text-lg min-w-[180px] text-center">{monthLabel}</div>
                  <Button size="sm" variant="outline" onClick={() => shiftMonth(1)} className="h-8 w-8 p-0">›</Button>
                </div>
                <Button size="sm" variant="ghost" onClick={() => { const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); setCursor(d); }}>Today</Button>
              </div>
              <div className="grid grid-cols-7 gap-1 text-3xs uppercase tracking-wider text-muted-foreground mb-1">
                {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => <div key={d} className="p-1 text-center font-semibold">{d}</div>)}
              </div>
              <div className="space-y-1">
                {calendar.map((week, wi) => (
                  <div key={wi} className="grid grid-cols-7 gap-1">
                    {week.map(slot => {
                      const today = new Date().toISOString().slice(0, 10);
                      const isToday = slot.date === today;
                      const dayNum = Number(slot.date.slice(8, 10));
                      return (
                        <div key={slot.date} className={`min-h-[96px] rounded-md border p-1.5 text-2xs transition ${
                          isToday ? "border-primary bg-primary/5 ring-1 ring-primary/40" :
                          slot.inMonth ? "border-border bg-card hover:bg-muted/20" :
                          "border-border/40 bg-muted/10 text-muted-foreground/50"
                        }`}>
                          <div className={`font-mono mb-1 text-xs ${isToday ? "text-primary font-bold" : slot.inMonth ? "text-foreground/80" : "text-muted-foreground/40"}`}>{dayNum}</div>
                          <div className="space-y-0.5">
                            {slot.pieces.slice(0, 3).map(p => {
                              const m = (p.content_metrics ?? [])[0];
                              const stage = p.funnel_stage ?? "—";
                              const stageCls = funnelChip(p.funnel_stage);
                              return (
                                <button key={p.id} onClick={() => setOverviewFor(p)} className="w-full flex items-center gap-1 rounded px-1 py-0.5 hover:bg-accent/10 text-left" title={p.title ?? ""}>
                                  <span className={`rounded px-1 py-px text-4xs font-mono uppercase ${stageCls}`}>{stage}</span>
                                  <span className="flex items-center gap-0.5 text-3xs font-mono text-muted-foreground"><Eye className="h-2.5 w-2.5" />{m?.views ?? 0}</span>
                                </button>
                              );
                            })}
                            {slot.pieces.length > 3 && <div className="text-muted-foreground text-3xs pl-1">+{slot.pieces.length - 3} more</div>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>

        </Tabs>
      </div>
      <SlidesPanel orgId={orgId} contentId={slidesFor} onClose={() => setSlidesFor(null)} />
      <OverviewPanel piece={overviewFor} onClose={() => setOverviewFor(null)} onEdit={(p) => { setOverviewFor(null); edit(p); }} />
      <ScheduleDialog
        piece={schedulingFor}
        pending={moveStatus.isPending}
        onClose={() => setSchedulingFor(null)}
        onConfirm={(schedule) => schedulingFor && moveStatus.mutate({ id: schedulingFor.id, status: "ready_to_post", schedule })}
      />
    </>
  );
}

const FORMATS = [
  { key: "short_form", label: "Short-form (Reel / TikTok / Short)" },
  { key: "long_form", label: "Long-form (YouTube / podcast)" },
  { key: "long_to_short", label: "Long-form → cut into clips" },
  { key: "story", label: "Story sequence" },
  { key: "carousel", label: "Carousel / post" },
  { key: "email", label: "Email / SMS" },
];

function ScheduleDialog({
  piece, pending, onClose, onConfirm,
}: {
  piece: PieceRow | null; pending: boolean; onClose: () => void;
  onConfirm: (s: { scheduled_date: string; scheduled_time: string; post_format: string; repurpose_plan: string; voice_notes: string; why_it_works: string; posting_instructions: string }) => void;
}) {
  const tomorrow = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);
  const guessFormat = (pl?: Platform) =>
    pl === "youtube" || pl === "vsl" ? "long_form"
      : pl === "story_sequence" ? "story"
      : pl === "email" ? "email"
      : pl === "carousel" || pl === "post" ? "carousel"
      : "short_form";

  const [date, setDate] = useState(tomorrow);
  const [time, setTime] = useState("18:00");
  const [format, setFormat] = useState(guessFormat(piece?.platform));
  const [repurpose, setRepurpose] = useState("");
  const [voice, setVoice] = useState("");
  const [why, setWhy] = useState("");
  const [instr, setInstr] = useState("");

  // Re-seed when a different card is opened.
  const [seeded, setSeeded] = useState<string | null>(null);
  if (piece && seeded !== piece.id) {
    setSeeded(piece.id);
    setDate(tomorrow); setTime("18:00"); setFormat(guessFormat(piece.platform));
    setRepurpose(""); setVoice(""); setWhy(""); setInstr("");
  }

  return (
    <Dialog open={!!piece} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Schedule this post</DialogTitle>
        </DialogHeader>
        {piece && (
          <div className="space-y-3">
            <div className="rounded-md border border-border bg-muted/20 p-2.5">
              <div className="text-xs font-medium">{piece.title || "(untitled)"}</div>
              {piece.hook && <div className="text-2xs text-muted-foreground mt-0.5 line-clamp-2 italic">"{piece.hook}"</div>}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Post on</Label>
                <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">At</Label>
                <Input type="time" value={time} onChange={e => setTime(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Format</Label>
              <Select value={format} onValueChange={setFormat}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FORMATS.map(f => <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">How it should sound (voice / delivery notes)</Label>
              <Textarea rows={2} value={voice} onChange={e => setVoice(e.target.value)} placeholder="Calm, matter-of-fact, no hype. Talk to camera, walking." />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Repurpose plan</Label>
              <Textarea rows={2} value={repurpose} onChange={e => setRepurpose(e.target.value)} placeholder="Cut 3 clips from 4:10, 8:30, 12:05 → Reels next week." />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Why this works</Label>
              <Textarea rows={2} value={why} onChange={e => setWhy(e.target.value)} placeholder="Proof angle for solution-aware viewers — mirrors the top objection from intakes." />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Posting instructions</Label>
              <Textarea rows={2} value={instr} onChange={e => setInstr(e.target.value)} placeholder="Caption + first comment, pin the CTA, reply to DMs within the hour." />
            </div>
            <Button className="w-full" disabled={pending || !date}
              onClick={() => onConfirm({ scheduled_date: date, scheduled_time: time, post_format: format, repurpose_plan: repurpose, voice_notes: voice, why_it_works: why, posting_instructions: instr })}>
              {pending ? "Scheduling…" : "Confirm · add to client calendar"}
            </Button>
            <p className="text-2xs text-muted-foreground">
              This moves the piece to <span className="font-mono">Ready to Post</span>, drops it on the Content Calendar for that day/time, and pings the admin channel with the script.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}


function ContentForm({ prefill, onSubmit, pending }: { prefill: Prefill | null; onSubmit: (fd: FormData) => void; pending: boolean }) {
  const [title, setTitle] = useState(prefill?.title ?? "");
  const [hook, setHook] = useState(prefill?.hook ?? "");
  const [platform, setPlatform] = useState<Platform>(prefill?.platform ?? "reel");
  const [angle, setAngle] = useState<Angle>(prefill?.angle ?? "authority");
  const [url, setUrl] = useState(prefill?.url ?? "");
  const [transcript, setTranscript] = useState(prefill?.transcript ?? "");
  const [mechanism, setMechanism] = useState<MechanismKey | "">((prefill?.mechanism as MechanismKey) ?? "");
  const [variation, setVariation] = useState(prefill?.variation ?? "");
  const [answers, setAnswers] = useState<Record<string, string>>(prefill?.variationAnswers ?? {});
  const analyze = useServerFn(analyzeContent);
  const { devBypass } = useAuth();
  const [analyzing, setAnalyzing] = useState(false);

  const questions: VariationQuestion[] = questionsFor(variation);

  const runAnalyze = async () => {
    if (!transcript.trim()) { toast.error("Paste the transcript first"); return; }
    setAnalyzing(true);
    try {
      const r = devBypass ? await withMockDelay(mockContentClassification()) : await analyze({ data: { transcript, hook, title } });
      if (!r) { toast.error("AI not configured — add LOVABLE_API_KEY to enable this."); return; }
      setHook(r.hook);
      setAngle(r.angle as Angle);
      toast.success(`Detected: ${r.angle}`, { description: r.rationale });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <form className="space-y-3" onSubmit={(e) => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      fd.set("platform", platform); fd.set("angle", angle);
      fd.set("mechanism", mechanism); fd.set("variation", variation);
      fd.set("variation_answers", JSON.stringify(answers));
      onSubmit(fd);
    }}>
      <div className="space-y-1.5"><Label>Title</Label><Input name="title" value={title} onChange={(e) => setTitle(e.target.value)} required /></div>
      <div className="space-y-1.5"><Label>Video URL</Label><Input name="url" type="url" placeholder="https://..." value={url} onChange={(e) => setUrl(e.target.value)} /></div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label>Full transcript</Label>
          <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={runAnalyze} disabled={analyzing}>
            <Sparkles className="h-3 w-3" />{analyzing ? "Analyzing…" : "AI: detect hook + angle"}
          </Button>
        </div>
        <Textarea name="transcript" rows={6} placeholder="Paste the entire reel transcript here…" value={transcript} onChange={(e) => setTranscript(e.target.value)} />
      </div>
      <div className="space-y-1.5"><Label>Hook (first 3 sec)</Label><Textarea name="hook" rows={2} value={hook} onChange={(e) => setHook(e.target.value)} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label>Platform / format</Label>
          <Select value={platform} onValueChange={(v) => setPlatform(v as Platform)}><SelectTrigger><SelectValue/></SelectTrigger>
            <SelectContent>{["reel","story_sequence","post","carousel","youtube","youtube_short","tiktok","vsl","ad_creative","email","dm","other"].map(p =>
              <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-1.5"><Label>Angle</Label>
          <Select value={angle} onValueChange={(v) => setAngle(v as Angle)}><SelectTrigger><SelectValue/></SelectTrigger>
            <SelectContent>{["authority","story","contrarian","tutorial","case_study","aspirational","fear","social_proof"].map(p =>
              <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select></div>
      </div>

      <div className="grid grid-cols-2 gap-3 rounded-md border border-accent/30 bg-accent/5 p-3">
        <div className="space-y-1.5"><Label>Mechanism</Label>
          <Select value={mechanism} onValueChange={(v) => { setMechanism(v as MechanismKey); setVariation(""); setAnswers({}); }}>
            <SelectTrigger><SelectValue placeholder="Which of the 4?" /></SelectTrigger>
            <SelectContent>{MECHANISM_KEYS.map(k => <SelectItem key={k} value={k}>{MECHANISMS[k].label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5"><Label>Variation</Label>
          <Select value={variation} onValueChange={(v) => { setVariation(v); setAnswers({}); }} disabled={!mechanism}>
            <SelectTrigger><SelectValue placeholder={mechanism ? "Pick a variation" : "Pick mechanism first"} /></SelectTrigger>
            <SelectContent>{mechanism && MECHANISMS[mechanism].variations.map(v => <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        {mechanism && variation && (
          <p className="col-span-2 text-2xs text-muted-foreground">{MECHANISMS[mechanism].variations.find(v => v.value === variation)?.hint}</p>
        )}
      </div>

      {questions.length > 0 && (
        <div className="space-y-3 rounded-md border border-border bg-muted/20 p-3">
          <div className="text-2xs uppercase tracking-wider text-muted-foreground">Tailored for this variation — not the same generic form every time</div>
          {questions.map(q => (
            <div key={q.key} className="space-y-1.5">
              <Label className="text-xs leading-snug">{q.label}</Label>
              {q.type === "textarea" && <Textarea rows={2} placeholder={q.placeholder} value={answers[q.key] ?? ""} onChange={(e) => setAnswers(a => ({ ...a, [q.key]: e.target.value }))} />}
              {q.type === "text" && <Input placeholder={q.placeholder} value={answers[q.key] ?? ""} onChange={(e) => setAnswers(a => ({ ...a, [q.key]: e.target.value }))} />}
              {q.type === "select" && (
                <Select value={answers[q.key] ?? ""} onValueChange={(v) => setAnswers(a => ({ ...a, [q.key]: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>{(q.options ?? []).map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                </Select>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5"><Label>Views</Label><Input name="views" type="number" defaultValue={prefill?.views ?? 0} /></div>
        <div className="space-y-1.5"><Label>Leads</Label><Input name="leads" type="number" defaultValue={prefill?.leads ?? 0} /></div>
        <div className="space-y-1.5"><Label>Hook retention %</Label><Input name="retention" type="number" step="0.1" defaultValue={prefill?.retention ?? 0} /></div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-2xs uppercase tracking-wider text-muted-foreground">Reel-level detail — every metric individually, not aggregate</Label>
        <div className="grid grid-cols-4 gap-3">
          <div className="space-y-1.5"><Label className="text-xs">Likes</Label><Input name="likes" type="number" defaultValue={prefill?.likes ?? 0} /></div>
          <div className="space-y-1.5"><Label className="text-xs">Comments</Label><Input name="comments" type="number" defaultValue={prefill?.comments ?? 0} /></div>
          <div className="space-y-1.5"><Label className="text-xs">Shares</Label><Input name="shares" type="number" defaultValue={prefill?.shares ?? 0} /></div>
          <div className="space-y-1.5"><Label className="text-xs">Saves</Label><Input name="saves" type="number" defaultValue={prefill?.saves ?? 0} /></div>
          <div className="space-y-1.5"><Label className="text-xs">Drop-off %</Label><Input name="drop_off_rate_pct" type="number" step="0.1" defaultValue={prefill?.dropOffRatePct ?? 0} /></div>
          <div className="space-y-1.5"><Label className="text-xs">Follower views</Label><Input name="follower_views" type="number" defaultValue={prefill?.followerViews ?? 0} /></div>
          <div className="space-y-1.5"><Label className="text-xs">Non-follower views</Label><Input name="non_follower_views" type="number" defaultValue={prefill?.nonFollowerViews ?? 0} /></div>
          <div className="space-y-1.5 col-span-2"><Label className="text-xs">Engagement rate %</Label><Input name="engagement_rate_pct" type="number" step="0.1" defaultValue={prefill?.engagementRatePct ?? 0} /></div>
        </div>
      </div>
      <Button type="submit" className="w-full" disabled={pending}>{pending ? "…" : "Save"}</Button>
    </form>
  );
}

function SlidesPanel({ orgId, contentId, onClose }: { orgId?: string; contentId: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: slides } = useQuery({
    queryKey: ["slides", contentId],
    enabled: !!contentId && !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from("story_slides")
        .select("id, sequence_index, caption, cta, slide_metrics(views, exits, taps_forward, taps_back, replies, link_clicks)")
        .eq("content_id", contentId!)
        .order("sequence_index");
      return data ?? [];
    },
  });
  const add = useMutation({
    mutationFn: async (f: FormData) => {
      const seq = Number(f.get("sequence_index") || (slides?.length ?? 0) + 1);
      const { data: slide, error } = await supabase.from("story_slides").insert({
        org_id: orgId!, content_id: contentId!, sequence_index: seq,
        caption: String(f.get("caption") || "") || null, cta: String(f.get("cta") || "") || null,
      }).select("id").single();
      if (error) throw error;
      await supabase.from("slide_metrics").insert({
        org_id: orgId!, slide_id: slide.id,
        views: Number(f.get("views") || 0), exits: Number(f.get("exits") || 0),
        taps_forward: Number(f.get("taps_forward") || 0), taps_back: Number(f.get("taps_back") || 0),
        replies: Number(f.get("replies") || 0), link_clicks: Number(f.get("link_clicks") || 0),
      });
    },
    onSuccess: () => { toast.success("Slide tracked"); qc.invalidateQueries({ queryKey: ["slides"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const chartData = (slides ?? []).map(s => {
    const m = (s.slide_metrics ?? [])[0];
    return { slide: `#${s.sequence_index}`, views: m?.views ?? 0, exits: m?.exits ?? 0 };
  });

  return (
    <Dialog open={!!contentId} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Story sequence · slide drop-off</DialogTitle></DialogHeader>
        {chartData.length > 0 && (
          <div className="h-48 rounded border border-border bg-card p-2">
            <ResponsiveContainer>
              <LineChart data={chartData}>
                <XAxis dataKey="slide" stroke="var(--muted-foreground)" fontSize={11} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} />
                <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                <Line type="monotone" dataKey="views" stroke="var(--chart-1)" strokeWidth={2} />
                <Line type="monotone" dataKey="exits" stroke="var(--destructive)" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        <div className="space-y-1">
          {(slides ?? []).map(s => {
            const m = (s.slide_metrics ?? [])[0];
            const dropoff = m?.views ? Math.round(((m.exits ?? 0) / m.views) * 100) : 0;
            return (
              <div key={s.id} className="flex items-center gap-3 rounded border border-border bg-card/40 p-2 text-xs">
                <span className="font-mono text-accent w-8">#{s.sequence_index}</span>
                <span className="flex-1 truncate">{s.caption ?? <span className="text-muted-foreground">—</span>}</span>
                <span className="font-mono">{m?.views ?? 0}v</span>
                <span className={`font-mono ${dropoff > 30 ? "text-destructive" : "text-muted-foreground"}`}>{dropoff}% exit</span>
              </div>
            );
          })}
          {(!slides || slides.length === 0) && <div className="p-6 text-center text-xs text-muted-foreground">No slides yet.</div>}
        </div>
        <form className="space-y-2 border-t border-border pt-3" onSubmit={(e) => { e.preventDefault(); add.mutate(new FormData(e.currentTarget)); (e.target as HTMLFormElement).reset(); }}>
          <div className="text-2xs uppercase tracking-wider text-muted-foreground">Add slide</div>
          <div className="grid grid-cols-2 gap-2">
            <Input name="sequence_index" type="number" placeholder="Seq #" />
            <Input name="caption" placeholder="Caption" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Input name="views" type="number" placeholder="Views" />
            <Input name="exits" type="number" placeholder="Exits" />
            <Input name="taps_forward" type="number" placeholder="Fwd" />
            <Input name="taps_back" type="number" placeholder="Back" />
            <Input name="replies" type="number" placeholder="Replies" />
            <Input name="link_clicks" type="number" placeholder="Clicks" />
          </div>
          <Button type="submit" size="sm" className="w-full" disabled={add.isPending}>Add slide</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function OverviewPanel({ piece, onClose, onEdit }: { piece: PieceRow | null; onClose: () => void; onEdit: (p: PieceRow) => void }) {
  const coach = useServerFn(coachContentFn);
  const { devBypass } = useAuth();
  const m = (piece?.content_metrics ?? [])[0];
  const { data: coaching, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["coach", piece?.id, devBypass],
    enabled: !!piece,
    staleTime: 1000 * 60 * 60,
    queryFn: async () => {
      if (devBypass) return withMockDelay(mockContentCoaching());
      return coach({ data: {
        title: piece!.title, hook: piece!.hook, transcript: piece!.body,
        angle: piece!.angle, funnel_stage: piece!.funnel_stage, platform: piece!.platform,
        views: m?.views ?? 0, leads: m?.leads_generated ?? 0, closes: m?.closes ?? 0,
        cash_cents: m?.cash_collected_cents ?? 0, retention_pct: Number(m?.hook_retention_pct ?? 0),
      } });
    },
  });

  if (!piece) return null;
  const stage = piece.funnel_stage;
  const answers = piece.variation_answers ?? {};
  const questions = questionsFor(piece.variation);

  return (
    <Dialog open={!!piece} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="pr-8">{piece.title || "(untitled)"}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="uppercase text-muted-foreground">{piece.platform}</span>
          {stage && <span className={`rounded px-1.5 py-0.5 font-mono uppercase text-3xs ${funnelChip(stage)}`}>{stage}</span>}
          {piece.angle && <span className="rounded bg-muted px-1.5 py-0.5">{piece.angle}</span>}
          {piece.mechanism && (
            <span className="rounded bg-accent/15 px-1.5 py-0.5 text-accent">
              {MECHANISMS[piece.mechanism as MechanismKey]?.label ?? piece.mechanism}
              {piece.variation && ` · ${MECHANISMS[piece.mechanism as MechanismKey]?.variations.find(v => v.value === piece.variation)?.label ?? piece.variation}`}
            </span>
          )}
          {piece.posted_at && <span className="text-muted-foreground">· {new Date(piece.posted_at).toLocaleDateString()}</span>}
          {piece.url && <a href={piece.url} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-1 text-accent hover:underline"><ExternalLink className="h-3 w-3" />Open</a>}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {[
            ["Views", m?.views?.toLocaleString() ?? "—"],
            ["Leads", m?.leads_generated ?? "—"],
            ["Closes", m?.closes ?? "—"],
            ["Cash", m?.cash_collected_cents ? "$"+Math.round(m.cash_collected_cents/100) : "—"],
            ["Retention", m?.hook_retention_pct ? m.hook_retention_pct+"%" : "—"],
          ].map(([k, v]) => (
            <div key={k as string} className="rounded border border-border bg-card/40 p-2">
              <div className="text-3xs uppercase tracking-wider text-muted-foreground">{k}</div>
              <div className="font-mono text-sm">{v}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            ["Likes", m?.likes ?? "—"],
            ["Comments", m?.comments ?? "—"],
            ["Shares", m?.shares ?? "—"],
            ["Saves", m?.saves ?? "—"],
            ["Follower views", m?.follower_views ?? "—"],
            ["Non-follower views", m?.non_follower_views ?? "—"],
            ["Engagement rate", m?.engagement_rate_pct ? m.engagement_rate_pct + "%" : "—"],
            ["Drop-off rate", m?.drop_off_rate_pct ? m.drop_off_rate_pct + "%" : "—"],
          ].map(([k, v]) => (
            <div key={k as string} className="rounded border border-border bg-card/40 p-2">
              <div className="text-3xs uppercase tracking-wider text-muted-foreground">{k}</div>
              <div className="font-mono text-sm">{v}</div>
            </div>
          ))}
        </div>

        {questions.length > 0 && Object.keys(answers).length > 0 && (
          <div className="rounded border border-border bg-card/40 p-3 space-y-2">
            <div className="text-3xs uppercase tracking-wider text-muted-foreground">Variation-specific answers</div>
            {questions.map(q => answers[q.key] ? (
              <div key={q.key}>
                <div className="text-3xs text-muted-foreground">{q.label}</div>
                <div className="text-sm whitespace-pre-wrap">{answers[q.key]}</div>
              </div>
            ) : null)}
          </div>
        )}

        {piece.hook && (
          <div className="rounded border border-border bg-card/40 p-3">
            <div className="text-3xs uppercase tracking-wider text-muted-foreground mb-1">Hook (first 3s)</div>
            <div className="text-sm">{piece.hook}</div>
          </div>
        )}

        {piece.body && (
          <div className="rounded border border-border bg-card/40 p-3">
            <div className="text-3xs uppercase tracking-wider text-muted-foreground mb-1">Transcript</div>
            <div className="whitespace-pre-wrap text-xs text-foreground/90 max-h-48 overflow-y-auto">{piece.body}</div>
          </div>
        )}

        <div className="rounded border border-accent/30 bg-accent/5 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5 text-accent" />AI coach review</div>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => refetch()} disabled={isFetching}>
              {isFetching ? "Thinking…" : "Re-analyze"}
            </Button>
          </div>
          {isLoading || isFetching ? (
            <div className="text-xs text-muted-foreground">Analyzing transcript and metrics…</div>
          ) : coaching ? (
            <div className="space-y-3 text-sm animate-in fade-in-0 slide-in-from-top-1 duration-300">
              <div>{coaching.summary}</div>
              <div>
                <div className="text-3xs uppercase tracking-wider text-[color:var(--color-success,oklch(0.7_0.16_150))] mb-1">What worked</div>
                <ul className="list-disc pl-5 space-y-1 text-xs">{coaching.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
              </div>
              <div>
                <div className="text-3xs uppercase tracking-wider text-amber-400 mb-1">How to improve</div>
                <ul className="list-disc pl-5 space-y-1 text-xs">{coaching.improvements.map((s, i) => <li key={i}>{s}</li>)}</ul>
              </div>
              <div>
                <div className="text-3xs uppercase tracking-wider text-accent mb-1">Try these hooks next time</div>
                <ul className="list-disc pl-5 space-y-1 text-xs">{coaching.next_hook_ideas.map((s, i) => <li key={i}>{s}</li>)}</ul>
              </div>
            </div>
          ) : isError ? (
            <div className="text-xs text-destructive">{error instanceof Error ? error.message : "AI coaching failed — try again."}</div>
          ) : coaching === null ? (
            <div className="text-xs text-muted-foreground">AI coaching is not configured for this workspace (missing API key).</div>
          ) : (
            <div className="text-xs text-muted-foreground">No review yet.</div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => onEdit(piece)}><Pencil className="h-3 w-3" />Edit piece</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

