/* eslint-disable @typescript-eslint/no-explicit-any -- legacy VSL and Supabase payloads are dynamic until generated types are expanded */
import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { TopBar } from "@/components/app-sidebar";
import { useDateRange } from "@/hooks/use-date-range";
import { StatCard } from "@/components/stat-card";
import { SlimHeader } from "@/components/slim-header";
import { Sparkline } from "@/components/sparkline";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Video,
  Plus,
  Upload,
  Wand2,
  Loader2,
  TrendingDown,
  TrendingUp,
  Save,
  Play,
  Mic,
  Trash2,
  HelpCircle,
  Pencil,
  MousePointerClick,
  Eye,
  PlayCircle,
  UsersRound,
  Gauge,
  Timer,
  FileBarChart,
} from "lucide-react";
import { toast } from "sonner";
import {
  listVsls,
  upsertVsl,
  deleteVsl,
  listSnapshots,
  addSnapshot,
  importCsvRows,
  analyzeVsl,
  transcribeAudio,
  listVslActionQueue,
  upsertVslRecommendation,
  setVslRecommendationStatus,
  getVslFunnelData,
  type VslKind,
} from "@/lib/vsl.functions";
import {
  buildRecommendationEvidence,
  buildVslFunnel,
  deriveLargestLeak,
} from "@/lib/media-intelligence";
import { useAuth, useCurrentOrg } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import {
  mockVsls,
  mockVslSnapshots,
  mockVslInsights,
  mockTranscriptLines,
  mockFaqVideos,
  mockVslActionQueue,
  mockVslFunnel,
  withMockDelay,
} from "@/lib/dev-mock-data";
import { MECHANISM_KEYS, MECHANISMS, type MechanismKey } from "@/lib/content-mechanisms";
import { cn } from "@/lib/utils";
import { BentoGrid, BentoCell } from "@/components/bento-grid";
import { VideoEmbed } from "@/components/video-embed";
import { VideoActionQueue, type VideoActionQueueItem } from "@/components/video-action-queue";
import { AttributionPathPanel, type AttributionPath } from "@/components/attribution-path-panel";

export const Route = createFileRoute("/_authenticated/vsl")({ component: VslPage });

const KIND_LABEL: Record<VslKind, string> = {
  main: "Main VSL",
  webinar: "Webinar VSL",
  post_booking: "Post-booking Confirmation",
  testimonial: "Testimonial Videos",
};
const KIND_ORDER: VslKind[] = ["main", "webinar", "post_booking", "testimonial"];

type FaqVideo = {
  id: string;
  title: string;
  question: string | null;
  video_url: string | null;
  wistia_video_id: string | null;
  mechanism: string | null;
  clicks: number;
  plays: number;
  avg_watch_pct: number;
  active: boolean;
  notes: string | null;
};

function fmtNum(n: number) {
  return Intl.NumberFormat().format(Math.round(n || 0));
}
function fmtPct(n: number) {
  return `${(Number(n) || 0).toFixed(1)}%`;
}
function mmss(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Per-VSL funnel built from real snapshot data (Wistia-native), and real
 * leads/calls tagged to this VSL via source_vsl_id (CRM/cash) — no stage is
 * ever populated from an inferred or estimated figure. A stage with no
 * connected data renders "Unavailable" rather than a zero.
 */
function VslFunnelPanel({ vsl }: { vsl: any }) {
  const { devBypass } = useAuth();
  const loadFunnel = useServerFn(getVslFunnelData);
  const { data: funnelInput } = useQuery({
    queryKey: ["vsl_funnel", vsl.id, devBypass],
    queryFn: () =>
      devBypass ? Promise.resolve(mockVslFunnel(vsl.id)) : loadFunnel({ data: { vsl_id: vsl.id } }),
  });
  if (!funnelInput) return null;
  const stages = buildVslFunnel(funnelInput);
  const leak = deriveLargestLeak(stages);
  const path: AttributionPath = {
    id: `vsl-funnel-${vsl.id}`,
    label: "Landing → play → milestones → completion → CTA → booking → show → close → cash",
    stages: stages.map((s) => ({
      key: s.key,
      label: s.label,
      value: s.value,
      detail: s.detail,
    })),
  };
  return (
    <div className="border-t border-border p-4 space-y-3">
      <AttributionPathPanel
        title="Full funnel"
        subtitle="Wistia metric, page-event, CRM, and cash data are labeled separately at each stage — none of it is a live Wistia API sync"
        paths={[path]}
      />
      <p className="text-3xs text-muted-foreground">
        Application/booking, show, close, and cash stages reflect leads and calls tagged to this VSL
        (source_vsl_id). No booking flow currently writes that tag automatically — a real 0 here
        means "checked, none tagged yet," not that the funnel is broken.
      </p>
      {leak && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs">
          <div className="flex items-center gap-1.5 font-semibold uppercase tracking-wider text-2xs text-destructive">
            <TrendingDown className="h-3 w-3" /> Largest leak
          </div>
          <div className="mt-1 text-foreground">
            {leak.fromLabel} → {leak.toLabel}:{" "}
            <span className="font-mono">{leak.dropRatePct.toFixed(1)}%</span> drop
          </div>
          <div className="mt-1 text-muted-foreground">→ {leak.recommendedTest}</div>
        </div>
      )}
    </div>
  );
}

function VslPage() {
  const load = useServerFn(listVsls);
  const { devBypass } = useAuth();
  const { range } = useDateRange();
  const qc = useQueryClient();
  const { data: vsls = [], isLoading } = useQuery({
    queryKey: ["vsls", devBypass],
    queryFn: (): Promise<any[]> => (devBypass ? Promise.resolve(mockVsls()) : load()),
  });
  const loadActionQueue = useServerFn(listVslActionQueue);
  const { data: actionQueueItems = [] } = useQuery({
    queryKey: ["vsl_action_queue", devBypass],
    queryFn: (): Promise<VideoActionQueueItem[]> =>
      devBypass ? Promise.resolve(mockVslActionQueue()) : loadActionQueue(),
  });
  const upsertRec = useServerFn(upsertVslRecommendation);
  const setRecStatus = useServerFn(setVslRecommendationStatus);
  const statusMutation = useMutation({
    mutationFn: async ({
      item,
      status,
    }: {
      item: VideoActionQueueItem;
      status: VideoActionQueueItem["status"];
    }) => {
      if (devBypass) return;
      const { evidence_json, confidence } = buildRecommendationEvidence({ reason: item.reason });
      if (item.recommendation_id) {
        return setRecStatus({
          data: {
            id: item.recommendation_id,
            status,
            reason: item.reason,
            evidence_json,
            confidence,
          },
        });
      }
      return upsertRec({
        data: {
          vsl_id: item.vsl_id,
          action: item.action,
          reason: item.reason,
          status,
          evidence_json,
          confidence,
        },
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vsl_action_queue"] }),
    onError: (e: any) => toast.error(e.message || "Failed to update action status"),
  });
  const [kind, setKind] = useState<VslKind | "faq">("main");

  const grouped = useMemo(() => {
    const m: Record<VslKind, any[]> = {
      main: [],
      webinar: [],
      post_booking: [],
      testimonial: [],
    };
    for (const v of vsls as any[]) m[v.kind as VslKind]?.push(v);
    return m;
  }, [vsls]);

  return (
    <>
      <TopBar
        title="VSL Analytics"
        subtitle="Wistia performance, drop-off, and script alignment across your video funnel."
        showDateRange
      />
      <div className="p-4 md:p-6 space-y-5">
        <VideoActionQueue
          items={actionQueueItems}
          providerAvailable={vsls.some((v: any) => Boolean(v.wistia_video_id))}
          mediaCount={vsls.length}
          onStatusChange={(item, status) => statusMutation.mutate({ item, status })}
        />
        <Tabs value={kind} onValueChange={(v) => setKind(v as VslKind | "faq")}>
          <TabsList className="w-full justify-start">
            {KIND_ORDER.map((k) => (
              <TabsTrigger key={k} value={k} className="gap-2">
                <Video className="h-3.5 w-3.5" />
                {KIND_LABEL[k]}
                <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-3xs font-mono">
                  {grouped[k].length}
                </span>
              </TabsTrigger>
            ))}
            <TabsTrigger value="faq" className="gap-2">
              <HelpCircle className="h-3.5 w-3.5" /> FAQ Videos
            </TabsTrigger>
          </TabsList>
          {KIND_ORDER.map((k) => (
            <TabsContent key={k} value={k} className="space-y-4 mt-4">
              <SlimHeader
                icon={<Video className="h-4 w-4" />}
                title={KIND_LABEL[k]}
                subtitle="Import Wistia metrics, drop your transcript, and let AI point at the drop-off."
                right={<NewVslButton kind={k} />}
              />
              {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
              {k === "testimonial" ? (
                <TestimonialVideosSection videos={grouped[k]} range={range} isLoading={isLoading} />
              ) : (
                <>
                  {!isLoading && grouped[k].length === 0 && (
                    <EmptyState
                      icon={<Video className="h-6 w-6" />}
                      title={`No ${KIND_LABEL[k]} yet`}
                      description="Create one, paste its Wistia sheet, and start tracking play rate, retention, and drop-off timestamps."
                    />
                  )}
                  {grouped[k].map((v: any) => (
                    <VslCard key={v.id} vsl={v} range={range} />
                  ))}
                </>
              )}
            </TabsContent>
          ))}
          <TabsContent value="faq" className="space-y-4 mt-4">
            <FaqVideosSection />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}

function NewVslButton({ kind }: { kind: VslKind }) {
  const qc = useQueryClient();
  const upsert = useServerFn(upsertVsl);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [wid, setWid] = useState("");
  const [sheet, setSheet] = useState("");
  const m = useMutation({
    mutationFn: async () =>
      upsert({
        data: {
          kind,
          name: name.trim(),
          wistia_video_id: wid.trim() || undefined,
          sheet_url: sheet.trim() || undefined,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vsls"] });
      toast.success("VSL added");
      setOpen(false);
      setName("");
      setWid("");
      setSheet("");
    },
    onError: (e: any) => toast.error(e.message || "Failed"),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          Add
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New {KIND_LABEL[kind]}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Main offer VSL v3"
            />
          </div>
          <div>
            <Label>Wistia video ID (optional)</Label>
            <Input value={wid} onChange={(e) => setWid(e.target.value)} placeholder="abc123xyz" />
          </div>
          <div>
            <Label>Google Sheet URL (optional, for reference)</Label>
            <Input
              value={sheet}
              onChange={(e) => setSheet(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/…"
            />
          </div>
          <Button
            onClick={() => m.mutate()}
            disabled={!name.trim() || m.isPending}
            className="w-full"
          >
            {m.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function VslCard({ vsl, range }: { vsl: any; range: { from: string; to: string } }) {
  const qc = useQueryClient();
  const loadSnaps = useServerFn(listSnapshots);
  const analyze = useServerFn(analyzeVsl);
  const del = useServerFn(deleteVsl);
  const { devBypass } = useAuth();
  const [insights, setInsights] = useState<any | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  const { data: snaps = [] } = useQuery({
    queryKey: ["vsl_snaps", vsl.id, range.from, range.to, devBypass],
    queryFn: () =>
      devBypass
        ? Promise.resolve(mockVslSnapshots(vsl.id))
        : loadSnaps({
            data: { vsl_id: vsl.id, from: `${range.from}T00:00:00`, to: `${range.to}T23:59:59` },
          }),
  });
  const latest = snaps[0];
  const history = [...snaps].reverse();
  const spark = (k: string) => history.map((s: any) => Number(s[k] ?? 0));

  const onAnalyze = async () => {
    setAnalyzing(true);
    try {
      setInsights(
        devBypass
          ? await withMockDelay(mockVslInsights())
          : await analyze({ data: { vsl_id: vsl.id } }),
      );
      toast.success("Analysis ready");
    } catch (e: any) {
      toast.error(e.message || "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  };
  const onDelete = async () => {
    if (!confirm(`Delete "${vsl.name}"? Snapshots will also be removed.`)) return;
    try {
      await del({ data: { id: vsl.id } });
      qc.invalidateQueries({ queryKey: ["vsls"] });
      toast.success("Deleted");
    } catch (e: any) {
      toast.error(e?.message || "Failed to delete");
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate">{vsl.name}</div>
          <div className="text-2xs text-muted-foreground truncate">
            {vsl.wistia_video_id ? `Wistia · ${vsl.wistia_video_id}` : "No Wistia ID set"}
            {vsl.sheet_url && (
              <>
                {" "}
                ·{" "}
                <a href={vsl.sheet_url} target="_blank" rel="noreferrer" className="underline">
                  Sheet
                </a>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onAnalyze}
            disabled={analyzing}
            className="gap-1.5"
          >
            {analyzing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Wand2 className="h-3.5 w-3.5" />
            )}{" "}
            AI Analyze
          </Button>
          <ImportDialog vslId={vsl.id} />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Player is the page hero — real playable video wherever the Wistia ID
          resolves, a designed placeholder everywhere else (never a broken
          embed). Metrics stay arranged below it, unchanged. */}
      <div className="p-4 pb-0">
        <VideoEmbed wistiaId={vsl.wistia_video_id} title={vsl.name} className="mx-auto max-w-2xl" />
      </div>

      {latest && (
        <div className="px-4 pt-3 text-3xs text-muted-foreground">
          Wistia metric · {latest.source === "csv" ? "CSV import" : "Manual entry"} · captured{" "}
          {new Date(latest.captured_at).toLocaleDateString()} — never a live API sync.
        </div>
      )}

      {/* Unique viewers (reach) and play rate (a conversion, not a fixed-green
          decoration) now take their funnel position. Avg % watched keeps its
          threshold-driven destructive/success — a genuine retention-quality bar. */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 p-4">
        <StatCard
          label="Total plays"
          icon={<PlayCircle className="h-3.5 w-3.5" />}
          value={latest ? fmtNum(latest.total_plays) : "—"}
          chart={(<Sparkline data={spark("total_plays")} />) as any}
        />
        <StatCard
          label="Unique viewers"
          icon={<UsersRound className="h-3.5 w-3.5" />}
          value={latest ? fmtNum(latest.unique_viewers) : "—"}
          spectrum="cold"
          chart={(<Sparkline data={spark("unique_viewers")} />) as any}
        />
        <StatCard
          label="Play rate"
          icon={<Gauge className="h-3.5 w-3.5" />}
          value={latest ? fmtPct(latest.play_rate) : "—"}
          spectrum="mid"
          chart={(<Sparkline data={spark("play_rate")} />) as any}
        />
        <StatCard
          label="Avg % watched"
          icon={<Timer className="h-3.5 w-3.5" />}
          value={latest ? fmtPct(latest.avg_percent_watched) : "—"}
          accent={latest && latest.avg_percent_watched < 40 ? "destructive" : "success"}
          chart={(<Sparkline data={spark("avg_percent_watched")} />) as any}
        />
        <StatCard
          label="Page loads"
          icon={<FileBarChart className="h-3.5 w-3.5" />}
          value={latest ? fmtNum(latest.page_loads) : "—"}
          chart={(<Sparkline data={spark("page_loads")} />) as any}
        />
      </div>

      {insights && <InsightsBlock insights={insights} />}

      <VslFunnelPanel vsl={vsl} />

      <ScriptTranscriptEditor vsl={vsl} />
    </div>
  );
}

function ConfidenceBadge({ confidence }: { confidence: number | null | undefined }) {
  if (typeof confidence !== "number") return null;
  return (
    <span className="ml-1.5 rounded bg-background/60 px-1 py-0.5 font-mono text-3xs text-muted-foreground">
      {Math.round(confidence * 100)}% confidence
    </span>
  );
}

function InsightsBlock({ insights }: { insights: any }) {
  return (
    <div className="border-t border-border p-4 space-y-3 bg-muted/20 animate-in fade-in-0 slide-in-from-top-1 duration-300">
      {insights.headline && <div className="text-sm font-medium">{insights.headline}</div>}
      {insights.largest_leak && (
        <div className="rounded border border-destructive/30 bg-destructive/10 p-2.5 text-xs">
          <div className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-destructive">
            <TrendingDown className="h-3 w-3" /> Largest leak
            <ConfidenceBadge confidence={insights.largest_leak.confidence} />
          </div>
          <div className="mt-1 font-semibold">{insights.largest_leak.stage}</div>
          <div className="mt-0.5 text-muted-foreground">{insights.largest_leak.why}</div>
          {insights.largest_leak.recommendation && (
            <div className="mt-1 text-foreground">→ {insights.largest_leak.recommendation}</div>
          )}
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <div className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-destructive mb-1.5">
            <TrendingDown className="h-3 w-3" /> Bottlenecks
          </div>
          <ul className="space-y-2">
            {(insights.bottlenecks ?? []).map((b: any, i: number) => (
              <li
                key={i}
                className="rounded border border-destructive/20 bg-destructive/5 p-2 text-xs"
              >
                <div className="flex items-center font-semibold">
                  {b.title}
                  <ConfidenceBadge confidence={b.confidence} />
                </div>
                <div className="text-muted-foreground mt-0.5">{b.body}</div>
                {b.evidence && (
                  <div className="mt-1 text-3xs italic text-muted-foreground">
                    Evidence: {b.evidence}
                  </div>
                )}
                {b.recommendation && (
                  <div className="mt-1 text-foreground">→ {b.recommendation}</div>
                )}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-[color:var(--color-success)] mb-1.5">
            <TrendingUp className="h-3 w-3" /> Double down
          </div>
          <ul className="space-y-2">
            {(insights.double_down ?? []).map((b: any, i: number) => (
              <li
                key={i}
                className="rounded border border-[color:var(--color-success)]/20 bg-[color:var(--color-success)]/5 p-2 text-xs"
              >
                <div className="flex items-center font-semibold">
                  {b.title}
                  <ConfidenceBadge confidence={b.confidence} />
                </div>
                <div className="text-muted-foreground mt-0.5">{b.body}</div>
                {b.evidence && (
                  <div className="mt-1 text-3xs italic text-muted-foreground">
                    Evidence: {b.evidence}
                  </div>
                )}
                {b.recommendation && (
                  <div className="mt-1 text-foreground">→ {b.recommendation}</div>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
      {insights.drop_off_moments?.length ? (
        <div>
          <div className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
            Drop-off moments
          </div>
          <div className="flex flex-wrap gap-1.5">
            {insights.drop_off_moments.map((d: any, i: number) => (
              <span
                key={i}
                className="rounded bg-background border border-border px-2 py-1 text-2xs"
              >
                <span className="font-mono text-destructive">{d.timestamp}</span> · {d.why}
                <ConfidenceBadge confidence={d.confidence} />
              </span>
            ))}
          </div>
        </div>
      ) : null}
      {typeof insights.snapshotCount === "number" && (
        <div className="text-3xs text-muted-foreground">
          Based on {insights.snapshotCount} metric snapshot{insights.snapshotCount === 1 ? "" : "s"}
          {insights.snapshotCount === 1
            ? " — trend claims above aren't a real trend yet with only one data point."
            : "."}
        </div>
      )}
    </div>
  );
}

function ImportDialog({ vslId }: { vslId: string }) {
  const qc = useQueryClient();
  const csv = useServerFn(importCsvRows);
  const one = useServerFn(addSnapshot);
  const [open, setOpen] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [form, setForm] = useState({
    total_plays: "",
    unique_viewers: "",
    play_rate: "",
    avg_percent_watched: "",
    page_loads: "",
  });

  const doCsv = useMutation({
    mutationFn: async () => csv({ data: { vsl_id: vslId, csv: csvText } }),
    onSuccess: (r: any) => {
      toast.success(`Imported ${r.inserted} rows`);
      qc.invalidateQueries({ queryKey: ["vsl_snaps", vslId] });
      setOpen(false);
      setCsvText("");
    },
    onError: (e: any) => toast.error(e.message),
  });
  const doOne = useMutation({
    mutationFn: async () =>
      one({
        data: {
          vsl_id: vslId,
          total_plays: Number(form.total_plays) || 0,
          unique_viewers: Number(form.unique_viewers) || 0,
          play_rate: Number(form.play_rate) || 0,
          avg_percent_watched: Number(form.avg_percent_watched) || 0,
          page_loads: Number(form.page_loads) || 0,
        },
      }),
    onSuccess: () => {
      toast.success("Snapshot added");
      qc.invalidateQueries({ queryKey: ["vsl_snaps", vslId] });
      setOpen(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Upload className="h-3.5 w-3.5" />
          Import
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import Wistia metrics</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="csv">
          <TabsList>
            <TabsTrigger value="csv">Paste sheet (CSV)</TabsTrigger>
            <TabsTrigger value="manual">Manual entry</TabsTrigger>
          </TabsList>
          <TabsContent value="csv" className="space-y-2">
            <div className="text-2xs text-muted-foreground">
              Copy-paste rows from your Google Sheet. Recognized columns:{" "}
              <span className="font-mono">
                video_name, plays, unique_visitors, play_rate, avg_percent_watched, page_loads,
                last_updated
              </span>
              . Include the header row.
              <br />
              Optional (only if your export carries them):{" "}
              <span className="font-mono">
                pct_25_reached, pct_50_reached, pct_75_reached, pct_90_reached, pct_100_reached,
                cta_clicks, cta_click_rate, rewatches, skips, referrer, utm_source, utm_medium,
                utm_campaign, device, embed_location, new_vs_returning, identified_viewer_id
              </span>
              . Missing columns stay "Unavailable" rather than being estimated.
            </div>
            <Textarea
              rows={10}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder={
                "video_name,plays,unique_visitors,play_rate,avg_percent_watched,page_loads,last_updated\nMain VSL v3,1240,910,73.4,42.1,1690,2026-07-04"
              }
              className="font-mono text-xs"
            />
            <Button
              className="w-full"
              disabled={!csvText.trim() || doCsv.isPending}
              onClick={() => doCsv.mutate()}
            >
              {doCsv.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Import CSV"}
            </Button>
          </TabsContent>
          <TabsContent value="manual" className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(form) as Array<keyof typeof form>).map((k) => (
                <div key={k}>
                  <Label className="text-2xs capitalize">{k.replace(/_/g, " ")}</Label>
                  <Input
                    type="number"
                    step="any"
                    value={form[k]}
                    onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
            <Button className="w-full" disabled={doOne.isPending} onClick={() => doOne.mutate()}>
              {doOne.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add snapshot"}
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function ScriptTranscriptEditor({ vsl }: { vsl: any }) {
  const qc = useQueryClient();
  const upsert = useServerFn(upsertVsl);
  const trans = useServerFn(transcribeAudio);
  const { devBypass } = useAuth();
  const [script, setScript] = useState<string>(vsl.script || "");
  const [transcriptText, setTranscriptText] = useState<string>(() => {
    const arr = Array.isArray(vsl.transcript_json) ? vsl.transcript_json : [];
    return arr.map((l: any) => `[${mmss(l.t)}] ${l.text}`).join("\n");
  });
  const [uploading, setUploading] = useState(false);

  const parseTranscript = (txt: string) => {
    const out: Array<{ t: number; text: string }> = [];
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^\s*\[?(\d{1,2}):(\d{2})(?::(\d{2}))?\]?\s*(.*)$/);
      if (!m) {
        if (line.trim())
          out.push({ t: out.length ? out[out.length - 1].t + 5 : 0, text: line.trim() });
        continue;
      }
      const h = m[3] ? Number(m[1]) : 0;
      const mm = m[3] ? Number(m[2]) : Number(m[1]);
      const ss = m[3] ? Number(m[3]) : Number(m[2]);
      out.push({ t: h * 3600 + mm * 60 + ss, text: m[4].trim() });
    }
    return out;
  };

  const save = useMutation({
    mutationFn: async () =>
      upsert({
        data: {
          id: vsl.id,
          kind: vsl.kind,
          name: vsl.name,
          wistia_video_id: vsl.wistia_video_id ?? undefined,
          sheet_url: vsl.sheet_url ?? undefined,
          script,
          transcript_json: parseTranscript(transcriptText),
        },
      }),
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["vsls"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const onFile = async (file: File) => {
    if (file.size > 25 * 1024 * 1024) return toast.error("File must be under 25 MB");
    setUploading(true);
    try {
      if (devBypass) {
        const lines = mockTranscriptLines();
        await withMockDelay(undefined);
        setTranscriptText(lines.map((l) => `[${mmss(l.t)}] ${l.text}`).join("\n"));
        toast.success(`Transcribed ${lines.length} lines`);
        return;
      }
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let bin = "";
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      const base64 = btoa(bin);
      const r: any = await trans({
        data: { vsl_id: vsl.id, filename: file.name, mime: file.type || "audio/mpeg", base64 },
      });
      toast.success(`Transcribed ${r.lines} lines`);
      qc.invalidateQueries({ queryKey: ["vsls"] });
    } catch (e: any) {
      toast.error(e.message || "Transcription failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="border-t border-border p-4">
      <Tabs defaultValue="transcript">
        <TabsList>
          <TabsTrigger value="transcript">Transcript · timeline</TabsTrigger>
          <TabsTrigger value="script">Raw script</TabsTrigger>
        </TabsList>
        <TabsContent value="transcript" className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-2xs text-muted-foreground">
              One line per beat. Prefix with <span className="font-mono">[m:ss]</span> to lock a
              timestamp. Match drop-off moments to what's being said.
            </div>
            <div className="flex items-center gap-2">
              <label className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-2.5 py-1 text-xs cursor-pointer hover:bg-muted">
                {uploading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Mic className="h-3.5 w-3.5" />
                )}
                Auto-transcribe
                <input
                  type="file"
                  accept="audio/*,video/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onFile(f);
                    e.currentTarget.value = "";
                  }}
                />
              </label>
              <Button
                size="sm"
                className="gap-1.5"
                onClick={() => save.mutate()}
                disabled={save.isPending}
              >
                {save.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}{" "}
                Save
              </Button>
            </div>
          </div>
          <Textarea
            rows={10}
            value={transcriptText}
            onChange={(e) => setTranscriptText(e.target.value)}
            className="font-mono text-xs"
            placeholder={
              "[0:00] Hook — you're leaving money on the table if…\n[0:12] Story: last month a client…\n[1:04] Objection handle:…"
            }
          />
          <TranscriptPreview txt={transcriptText} />
        </TabsContent>
        <TabsContent value="script" className="space-y-2">
          <Textarea
            rows={12}
            value={script}
            onChange={(e) => setScript(e.target.value)}
            placeholder="Paste the full VSL script (no timestamps needed)."
          />
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => save.mutate()}
            disabled={save.isPending}
          >
            {save.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}{" "}
            Save script
          </Button>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TranscriptPreview({ txt }: { txt: string }) {
  const lines = txt
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .slice(0, 40);
  if (!lines.length) return null;
  return (
    <div className="mt-2 max-h-64 overflow-auto rounded border border-border bg-background/60 divide-y divide-border">
      {lines.map((l, i) => {
        const m = l.match(/^\s*\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?\s*(.*)$/);
        return (
          <div key={i} className="flex gap-3 px-2.5 py-1 text-xs">
            <span className="font-mono text-3xs text-accent w-14 shrink-0 pt-0.5">
              {m ? m[1] : "—"}
            </span>
            <span className="min-w-0">{m ? m[2] : l}</span>
          </div>
        );
      })}
    </div>
  );
}

function TestimonialVideosSection({
  videos,
  range,
  isLoading,
}: {
  videos: any[];
  range: { from: string; to: string };
  isLoading: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(videos[0]?.id ?? null);
  const selected = videos.find((video) => video.id === selectedId) ?? videos[0];

  useEffect(() => {
    if (!selected && videos.length) setSelectedId(videos[0].id);
    if (selected && !videos.some((video) => video.id === selected.id))
      setSelectedId(videos[0]?.id ?? null);
  }, [selected, videos]);

  if (isLoading) return null;
  if (!videos.length) {
    return (
      <EmptyState
        icon={<Video className="h-6 w-6" />}
        title="No testimonial videos yet"
        description="Add testimonial videos to build a multi-video proof library with independent metrics, transcripts, and AI analysis."
      />
    );
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[17rem_minmax(0,1fr)]">
      <div className="h-fit rounded-lg border border-border bg-card p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
            Testimonial library
          </div>
          <div className="font-mono text-2xs text-muted-foreground">{videos.length}</div>
        </div>
        <div className="space-y-1.5">
          {videos.map((video, index) => (
            <button
              key={video.id}
              type="button"
              onClick={() => setSelectedId(video.id)}
              className={cn(
                "w-full rounded-md border px-3 py-2 text-left transition-colors",
                selected?.id === video.id
                  ? "border-primary/60 bg-primary/10"
                  : "border-border bg-background/40 hover:bg-muted/50",
              )}
            >
              <div className="flex items-start gap-2">
                <span className="font-mono text-2xs text-muted-foreground">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="min-w-0 text-xs font-medium leading-snug">{video.name}</span>
              </div>
              <div className="mt-1 pl-6 text-3xs text-muted-foreground">
                {video.wistia_video_id ? `Wistia · ${video.wistia_video_id}` : "No video ID set"}
              </div>
            </button>
          ))}
        </div>
        <div className="mt-3 border-t border-border pt-3">
          <NewVslButton kind="testimonial" />
        </div>
      </div>
      <div className="min-w-0">
        {selected ? <VslCard key={selected.id} vsl={selected} range={range} /> : null}
      </div>
    </div>
  );
}

/**
 * FAQ Videos — the real data source feeding Content Signals' "FAQ clicks" signal
 * (previously mocked). Most-clicked FAQ reveals the audience's dominant subconscious
 * limiting belief, so this is ranked most-clicked first, not by recency.
 */
function FaqVideosSection() {
  const { data: org } = useCurrentOrg();
  const orgId = org?.org_id;
  const { devBypass } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<FaqVideo | null>(null);
  const [statsFor, setStatsFor] = useState<FaqVideo | null>(null);

  const { data: faqs, isLoading } = useQuery({
    queryKey: ["faq-videos", orgId, devBypass],
    enabled: devBypass || !!orgId,
    queryFn: async () => {
      if (devBypass) return mockFaqVideos() as FaqVideo[];
      const { data, error } = await supabase
        .from("faq_videos")
        .select("*")
        .eq("org_id", orgId!)
        .order("clicks", { ascending: false });
      if (error) throw error;
      return (data ?? []) as FaqVideo[];
    },
  });

  const ranked = [...(faqs ?? [])].sort((a, b) => b.clicks - a.clicks);
  const topBelief = ranked[0];

  // Deep-link from the objection instrument ("content that addresses this
  // mechanism") — scroll to the specific FAQ video card on arrival.
  const deepLink = useSearch({ strict: false }) as { faq?: string };
  useEffect(() => {
    if (!deepLink.faq) return;
    const el = document.getElementById(`faq-${deepLink.faq}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [deepLink.faq]);

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("faq_videos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Removed");
      qc.invalidateQueries({ queryKey: ["faq-videos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <SlimHeader
        icon={<HelpCircle className="h-4 w-4" />}
        title="FAQ Videos"
        subtitle="Objection-answer video library. Ranked most-clicked first — the top one is the audience's #1 subconscious limiting belief. (No post-booking delivery surface exists yet — clicks/plays are logged manually below, not from a live delivery flow.)"
        right={
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            Add FAQ video
          </Button>
        }
      />

      {/* Section hero (B1) — the existing "dominant belief" callout, promoted
          into a bento hero. Mechanism chip stays categorical/uncolored (4 equal
          content types), not a funnel-position value. */}
      {topBelief && topBelief.clicks > 0 && (
        <BentoGrid cols={2} rowHeight="7rem">
          <BentoCell span="wide">
            <div className="hover-lift relative flex h-full items-center gap-3 overflow-hidden rounded-2xl border border-border bg-card p-5">
              <div className="glass-highlight pointer-events-none absolute inset-0 rounded-2xl" />
              <TrendingUp className="relative h-5 w-5 shrink-0 text-spectrum-mid" />
              <div className="relative min-w-0">
                <div className="text-3xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Dominant Limiting Belief
                </div>
                <div className="display-serif mt-0.5 text-lg leading-snug">
                  {topBelief.title} —{" "}
                  <span className="font-mono text-base text-spectrum-mid">{topBelief.clicks}</span>{" "}
                  clicks
                </div>
                {topBelief.mechanism && (
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    feeds the{" "}
                    {MECHANISMS[topBelief.mechanism as MechanismKey]?.label ?? topBelief.mechanism}{" "}
                    mix
                  </div>
                )}
              </div>
            </div>
          </BentoCell>
        </BentoGrid>
      )}

      {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
      {!isLoading && ranked.length === 0 && (
        <EmptyState
          icon={<HelpCircle className="h-6 w-6" />}
          title="No FAQ videos yet"
          description="Add the objection-answer videos shown after booking, then log their click/play stats to feed the mechanism mix."
        />
      )}

      {/* Ranked grid of real embedded players — objection, click count, and the
          belief it maps to all sit directly under each video. */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {ranked.map((f, i) => {
          const watchRate = f.clicks > 0 ? Math.round((f.plays / f.clicks) * 100) : 0;
          const deepLinked = deepLink.faq === f.id;
          return (
            <div
              key={f.id}
              id={`faq-${f.id}`}
              className={cn(
                "hover-lift scroll-mt-20 rounded-lg border bg-card overflow-hidden",
                deepLinked ? "border-primary ring-2 ring-primary/40" : "border-border",
              )}
            >
              <div className="relative">
                <VideoEmbed
                  wistiaId={f.wistia_video_id}
                  url={f.video_url}
                  title={f.title}
                  className="rounded-none border-0"
                />
                <div className="absolute left-2 top-2 grid h-6 w-6 place-items-center rounded-md bg-background/80 backdrop-blur text-3xs font-mono font-bold text-foreground ring-1 ring-inset ring-white/10">
                  {i + 1}
                </div>
                {!f.active && (
                  <div className="absolute right-2 top-2 rounded bg-background/80 backdrop-blur px-1.5 py-0.5 text-3xs uppercase tracking-wide text-muted-foreground ring-1 ring-inset ring-white/10">
                    Inactive
                  </div>
                )}
              </div>
              <div className="p-3 space-y-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">{f.title}</div>
                  {f.question && (
                    <div className="text-2xs text-muted-foreground mt-0.5">{f.question}</div>
                  )}
                  {f.mechanism && (
                    <span className="mt-1.5 inline-block rounded bg-accent/15 px-1.5 py-0.5 text-3xs uppercase tracking-wide text-accent">
                      {MECHANISMS[f.mechanism as MechanismKey]?.label ?? f.mechanism}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2 border-t border-border pt-2">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1 font-mono text-xs font-semibold">
                      <MousePointerClick className="h-3 w-3 text-muted-foreground" />
                      {fmtNum(f.clicks)}
                    </div>
                    <div className="flex items-center gap-1 font-mono text-xs font-semibold">
                      <Eye className="h-3 w-3 text-muted-foreground" />
                      {fmtNum(f.plays)}
                    </div>
                    <div className="font-mono text-xs font-semibold">
                      {watchRate}%
                      <span className="text-3xs font-normal text-muted-foreground"> watch</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-2xs"
                      onClick={() => setStatsFor(f)}
                    >
                      Stats
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      onClick={() => {
                        setEditing(f);
                        setOpen(true);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                      onClick={() => {
                        if (confirm(`Remove "${f.title}"?`)) del.mutate(f.id);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <FaqVideoDialog open={open} onOpenChange={setOpen} editing={editing} orgId={orgId} />
      <FaqStatsDialog
        faq={statsFor}
        onOpenChange={(o) => {
          if (!o) setStatsFor(null);
        }}
      />
    </div>
  );
}

function FaqVideoDialog({
  open,
  onOpenChange,
  editing,
  orgId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing: FaqVideo | null;
  orgId: string | undefined;
}) {
  const qc = useQueryClient();
  const [title, setTitle] = useState(editing?.title ?? "");
  const [question, setQuestion] = useState(editing?.question ?? "");
  const [videoUrl, setVideoUrl] = useState(editing?.video_url ?? "");
  const [mechanism, setMechanism] = useState<string>(editing?.mechanism ?? "");

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        title: title.trim(),
        question: question.trim() || null,
        video_url: videoUrl.trim() || null,
        mechanism: mechanism || null,
      };
      if (editing) {
        const { error } = await supabase.from("faq_videos").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("faq_videos").insert({ org_id: orgId!, ...payload });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Updated" : "Added");
      qc.invalidateQueries({ queryKey: ["faq-videos"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent key={editing?.id ?? "new"}>
        <DialogHeader>
          <DialogTitle>{editing ? "Edit FAQ video" : "New FAQ video"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Objection / title</Label>
            <Input
              defaultValue={editing?.title ?? ""}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={'e.g. "Is this a scam?"'}
            />
          </div>
          <div>
            <Label>Question it answers</Label>
            <Textarea
              rows={2}
              defaultValue={editing?.question ?? ""}
              onChange={(e) => setQuestion(e.target.value)}
            />
          </div>
          <div>
            <Label>Video URL</Label>
            <Input
              defaultValue={editing?.video_url ?? ""}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="https://"
            />
          </div>
          <div>
            <Label>Mechanism (optional — which of the 4 this feeds)</Label>
            <Select defaultValue={editing?.mechanism ?? undefined} onValueChange={setMechanism}>
              <SelectTrigger>
                <SelectValue placeholder="Auto-detect from title/question" />
              </SelectTrigger>
              <SelectContent>
                {MECHANISM_KEYS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {MECHANISMS[k].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            className="w-full"
            disabled={!title.trim() || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : editing ? (
              "Save changes"
            ) : (
              "Add FAQ video"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FaqStatsDialog({
  faq,
  onOpenChange,
}: {
  faq: FaqVideo | null;
  onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const [clicks, setClicks] = useState("");
  const [plays, setPlays] = useState("");
  const [watchPct, setWatchPct] = useState("");

  const save = useMutation({
    mutationFn: async () => {
      if (!faq) return;
      const { error } = await supabase
        .from("faq_videos")
        .update({
          clicks: Number(clicks) || 0,
          plays: Number(plays) || 0,
          avg_watch_pct: Number(watchPct) || 0,
        })
        .eq("id", faq.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Stats updated");
      qc.invalidateQueries({ queryKey: ["faq-videos"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={!!faq} onOpenChange={onOpenChange}>
      <DialogContent key={faq?.id ?? "none"}>
        <DialogHeader>
          <DialogTitle>Update stats — {faq?.title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-2xs">Total clicks</Label>
              <Input
                type="number"
                min={0}
                defaultValue={faq?.clicks ?? 0}
                onChange={(e) => setClicks(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-2xs">Total plays</Label>
              <Input
                type="number"
                min={0}
                defaultValue={faq?.plays ?? 0}
                onChange={(e) => setPlays(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-2xs">Avg % watched</Label>
              <Input
                type="number"
                min={0}
                max={100}
                defaultValue={faq?.avg_watch_pct ?? 0}
                onChange={(e) => setWatchPct(e.target.value)}
              />
            </div>
          </div>
          <Button className="w-full" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save stats"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
