import React from "react";
import { useMemo, useState, type CSSProperties } from "react";
import {
  BarChart3,
  Eye,
  Heart,
  Layers3,
  Radio,
  Sparkles,
  Users,
  UserRound,
  Video,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { EmptyState } from "@/components/empty-state";
import { MECHANISMS, MECHANISM_KEYS, type MechanismKey } from "@/lib/content-mechanisms";
import {
  SPECTRUM_VAR,
  type SpectrumPosition,
  type KpiEmphasis,
  kpiGradient,
  kpiGradientBorder,
} from "@/lib/spectrum";
import { cn } from "@/lib/utils";
import type { AttributionModel, CanonicalLifecycleAttributionPath } from "@/lib/acquisition";
import { FUNNEL_STAGES, normalizeTaxonomy } from "@/lib/content-taxonomy";
import { ATTRIBUTION_MODELS, ATTRIBUTION_MODEL_LABELS } from "@/lib/content-attribution";
import { normalizeSocialPlatform, socialPlatformOptions } from "@/lib/social-platform";
import { MetricDetailPanel, type DetailColumn } from "@/components/metric-detail-panel";
import type { Derivation } from "@/lib/funnel-derivation";
import { formatLabel, buildFormatOptions } from "@/lib/platform-format";
import { PlatformIcon } from "@/components/platform-icon";
import { useMoney } from "@/hooks/use-money";
import { ChartTooltip } from "@/components/chart-tooltip";
import {
  ContentSignalsSection,
  type SignalsDemand,
  type SignalsWeekly,
} from "@/components/content-signals-panel";
import type {
  Driver,
  DemandEvidence,
  WeeklyMechanismStat,
  WeeklyDiagnosis,
  BottleneckReadResult,
} from "@/lib/content-taxonomy";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TaxonomySelect } from "@/components/taxonomy-select";
import { TrafficPageContent } from "@/routes/_authenticated.traffic";
import { AttributionPageContent } from "@/routes/_authenticated.attribution";

export type ContentCommandMetric = {
  captured_at?: string | null;
  views?: number | null;
  reach?: number | null;
  likes?: number | null;
  comments?: number | null;
  saves?: number | null;
  shares?: number | null;
  followers_gained?: number | null;
  profile_visits?: number | null;
  dms_generated?: number | null;
  leads_generated?: number | null;
  calls_booked?: number | null;
  closes?: number | null;
  cash_collected_cents?: number | null;
  watch_time_seconds?: number | null;
  avg_watch_pct?: number | null;
  hook_retention_pct?: number | null;
  drop_off_rate_pct?: number | null;
  engagement_rate_pct?: number | null;
};

export type ContentCommandPiece = {
  id: string;
  title: string | null;
  hook?: string | null;
  platform: string;
  /** True brand platform (Instagram/TikTok/YouTube/...), distinct from
   * `platform` above (which is actually a format enum — reel/carousel/etc).
   * Null on pieces logged before this field existed; never backfilled by
   * guessing from the format. */
  source_platform?: string | null;
  post_format?: string | null;
  funnel_stage?: string | null;
  posted_at?: string | null;
  mechanism?: string | null;
  variation?: string | null;
  cta?: string | null;
  content_metrics?: ContentCommandMetric[] | null;
  url?: string | null;
};

/** Best-available real platform signal for a piece — prefers the explicit
 * source_platform tag; falls back to normalizing the format enum (works for
 * unambiguous values like "tiktok"/"youtube", honestly resolves to
 * Unknown/Unattributed for ambiguous ones like "reel"/"carousel" rather than
 * guessing which network). */
function pieceSocialPlatform(piece: ContentCommandPiece) {
  return normalizeSocialPlatform(piece.platform, piece.source_platform);
}

export type ContentDemandSummary = {
  mix: Record<string, number>;
  insufficientData?: boolean;
  totalWeight?: number;
  minTotalWeight?: number;
  counts?: { faq: number; setter_calls: number; intakes: number; reels: number };
  /** Raw demand signals behind the mix (FAQ clicks, setter-call objections,
   * intake answers, strong-performing reels) — same field computeDemand()
   * already returns; carried through so the Content Signals section can show
   * the driver drill-down without a second query. */
  drivers?: Driver[];
  /** Every real record behind each count in `counts` (not just the ones that
   * produced a nonzero driver) — same field computeDemand() already returns;
   * powers the "Built from N X" evidence drill-down. */
  evidence?: DemandEvidence;
};

export type ContentWeeklySummary = {
  reels: number;
  missing: string[];
  untracked: number;
  best: string | null;
  worst: string | null;
  total: number;
  /** Per-mechanism weekly stats (+ "untagged" bucket) and the worst-mechanism
   * diagnosis — same fields computeWeeklyContentCheck() already returns. */
  per?: Record<string, WeeklyMechanismStat>;
  worstDiagnosis?: WeeklyDiagnosis | null;
};

type SortKey = "views" | "reach" | "engagement" | "cash";

// Reuses the exact shape traffic-channel-revenue.ts produces — contracted
// (verified closed-call basis), collected (verified cash), and client LTV
// kept as three separate fields rather than one combined "revenue" number
// (Priority 1 correction).
export type ContentTrafficChannel = {
  id: string;
  name: string;
  category: string | null;
  leads: number;
  clients: number;
  closeRate: number;
  contractedCents: number;
  collectedCents: number;
  clientContractedCents: number;
  revenuePerLeadCents: number;
};

export type ContentTrafficSummary = {
  leads: number;
  clients: number;
  contractedCents: number;
  collectedCents: number;
  clientContractedCents: number;
  revenuePerLeadCents: number;
  noSource: number;
  channels: ContentTrafficChannel[];
  /** True if any calls row's original_currency had no resolvable historical
   * FX rate — excluded from the cents totals above rather than guessed as
   * USD. See docs/ascendos-currency-mixing-audit.md. */
  fxIncomplete?: boolean;
};

export type ContentAttributionSummary = {
  touches: number;
  leads: number;
  attributed: number;
  closes: number;
  contractValueCents: number;
  cashCollectedCents: number;
};

/** Aggregate story_slides/slide_metrics read — real tables, joined and
 * summed by the caller (see _authenticated.content.tsx's content-stories-
 * summary query). `sequencesTracked === 0` means no story sequence has any
 * slides logged yet, not that the feature is unavailable. */
export type ContentStoriesSummary = {
  sequencesTracked: number;
  totalSlides: number;
  totalViews: number;
  totalExits: number;
  avgExitRatePct: number | null;
  totalTapsForward: number;
  totalTapsBack: number;
  totalReplies: number;
  totalLinkClicks: number;
};

type Props = {
  pieces: ContentCommandPiece[];
  demand?: ContentDemandSummary;
  weekly?: ContentWeeklySummary;
  canonicalPaths?: CanonicalLifecycleAttributionPath[];
  canonicalPathsByModel?: Record<AttributionModel, CanonicalLifecycleAttributionPath[]>;
  traffic?: ContentTrafficSummary;
  attributionSummary?: ContentAttributionSummary;
  /** cash_collected_cents per closed call id — the Sankey's real cash
   * source, joined via canonicalPathsByModel's callId (Priority 2). */
  callCashById?: Record<string, number>;
  stories?: ContentStoriesSummary;
  /** AI Bottleneck Read — undefined until the caller has run analyzeContentSystemFn once. */
  bottleneckRead?: BottleneckReadResult;
  onAnalyzeBottlenecks: () => void;
  analyzingBottlenecks: boolean;
  /** Date range driving the demand/weekly/AI read — display-only here. */
  signalsRange: { from: string; to: string };
  reelTarget: number;
  onReelTargetChange: (n: number) => void;
};

const fmt = (value: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(value));
// Compact axis-tick formatter (12.3K instead of 12,345) so large values don't
// get clipped against the chart's fixed y-axis width — tooltips still show
// the exact value via fmt().
const fmtCompact = (value: number) =>
  new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
const titleFor = (piece: ContentCommandPiece) => piece.title || piece.hook || "Untitled content";

// A format-mix breakdown isn't a sequential funnel — deriveCap/deriveWorking
// don't apply, so this stays an honest "not applicable" rather than forcing
// a funnel-shaped sentence onto a non-funnel metric (same precedent as
// Traffic's NOT_EVALUATED constant).
const NOT_A_FUNNEL_STAGE: Derivation = {
  status: "insufficient_data",
  sentence:
    "A content-format breakdown, not a sequential funnel stage — no upstream constraint to derive.",
};

function metricOf(piece: ContentCommandPiece) {
  return (
    [...(piece.content_metrics ?? [])].sort((a, b) =>
      String(b.captured_at ?? "").localeCompare(String(a.captured_at ?? "")),
    )[0] ?? {}
  );
}

function interactionsOf(metric: ContentCommandMetric) {
  return (metric.likes ?? 0) + (metric.comments ?? 0) + (metric.saves ?? 0) + (metric.shares ?? 0);
}

export function ContentCommandCenter({
  pieces,
  demand,
  weekly,
  canonicalPaths = [],
  canonicalPathsByModel,
  traffic,
  attributionSummary,
  callCashById = {},
  stories,
  bottleneckRead,
  onAnalyzeBottlenecks,
  analyzingBottlenecks,
  signalsRange,
  reelTarget,
  onReelTargetChange,
}: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("views");
  const money = useMoney();
  const [selectedPath, setSelectedPath] = useState<CanonicalLifecycleAttributionPath | null>(null);
  // Format Mix drill-down (spec: clicking a format bar must open the real
  // content pieces behind it, preserving every other active filter) — set
  // by the "Views by content type" chart below.
  const [formatMixDrill, setFormatMixDrill] = useState<string | null>(null);
  // Transparent attribution model (spec: "show the strength and quality of
  // every attribution path" across a selectable model). Falls back to the
  // single `canonicalPaths` prop (always first-touch) when the caller hasn't
  // wired the full per-model map — e.g. the devBypass mock path.
  const [attributionModel, setAttributionModel] = useState<AttributionModel>("first_touch");
  const activeCanonicalPaths = canonicalPathsByModel?.[attributionModel] ?? canonicalPaths;
  // Canonical paths never carry a `platform` (buildAttributionPathsForModel
  // has no platform source to set it from) — resolve it here from the real
  // content piece instead, so the platform filter/drill-down works off an
  // actual field rather than a permanently-null one.
  const platformByContentId = useMemo(
    () => new Map(pieces.map((p) => [p.id, pieceSocialPlatform(p)])),
    [pieces],
  );
  const [pathFilters, setPathFilters] = useState({
    platform: "all",
    campaign: "all",
    source: "all",
    content: "all",
  });
  const filteredCanonicalPaths = useMemo(
    () =>
      activeCanonicalPaths.filter((path) => {
        const matches = (filter: string, value: string | null) =>
          filter === "all" || value === filter;
        const platform = path.contentId
          ? (platformByContentId.get(path.contentId) ?? path.platform)
          : path.platform;
        return (
          matches(pathFilters.platform, platform) &&
          matches(pathFilters.campaign, path.campaign) &&
          matches(pathFilters.source, path.source) &&
          matches(pathFilters.content, path.contentId)
        );
      }),
    [activeCanonicalPaths, pathFilters, platformByContentId],
  );
  const [taxonomyFilters, setTaxonomyFilters] = useState({
    funnelStage: "all",
    mechanism: "all",
    variation: "all",
    platform: "all",
    format: "all",
  });
  // Platform vs format: `piece.platform` is a DB enum that conflates the two
  // (see src/lib/platform-format.ts's doc comment for the full story). Until
  // that gets a real schema migration, PLATFORM here always resolves through
  // pieceSocialPlatform() (source_platform-first) and FORMAT reads the
  // `platform` enum column instead — never the other way around.
  const taxonomyOf = (piece: ContentCommandPiece) =>
    normalizeTaxonomy({
      funnelStage: piece.funnel_stage,
      mechanism: piece.mechanism,
      variation: piece.variation,
      platform: pieceSocialPlatform(piece),
      format: piece.platform,
    });
  const taxonomyOptions = useMemo(() => {
    const normalized = pieces.map(taxonomyOf);
    return {
      mechanisms: [
        ...new Set(normalized.map((row) => row.mechanism).filter((value) => value !== "unknown")),
      ],
      variations: [
        ...new Set(normalized.map((row) => row.variation).filter((value) => value !== "unknown")),
      ],
      // Canonical taxonomy (social-platform.ts — the exact same list
      // normalizeSocialPlatform()/pieceSocialPlatform() resolve real pieces
      // into, and the same helper Attribution's own platform filter already
      // reuses), not just whatever happens to be in the currently loaded
      // pieces — a workspace with only YouTube content logged still sees
      // Instagram/TikTok/etc. as real, selectable options; selecting one
      // with no matching pieces just shows the existing honest empty state,
      // never a fabricated row.
      platforms: socialPlatformOptions(),
      // Cascaded: when a platform is selected, only formats real pieces on
      // that platform actually used are offered — never a fixed list, so a
      // platform never shows a format nobody has logged (spec: "only expose
      // formats that are actually supported by the underlying data").
      formats: buildFormatOptions(
        pieces,
        (piece) => taxonomyOf(piece).platform,
        (piece) => taxonomyOf(piece).format,
        taxonomyFilters.platform,
      ).map((option) => option.value),
    };
  }, [pieces, taxonomyFilters.platform]);
  const visiblePieces = useMemo(
    () =>
      pieces.filter((piece) => {
        const taxonomy = taxonomyOf(piece);
        return (
          (taxonomyFilters.funnelStage === "all" ||
            taxonomy.funnelStage === taxonomyFilters.funnelStage) &&
          (taxonomyFilters.mechanism === "all" ||
            taxonomy.mechanism === taxonomyFilters.mechanism) &&
          (taxonomyFilters.variation === "all" ||
            taxonomy.variation === taxonomyFilters.variation) &&
          (taxonomyFilters.platform === "all" || taxonomy.platform === taxonomyFilters.platform) &&
          (taxonomyFilters.format === "all" || taxonomy.format === taxonomyFilters.format)
        );
      }),
    [pieces, taxonomyFilters],
  );
  const stats = useMemo(() => {
    const rows = visiblePieces.map(metricOf);
    const totalViews = rows.reduce((sum, row) => sum + (row.views ?? 0), 0);
    const totalReach = rows.reduce((sum, row) => sum + (row.reach ?? 0), 0);
    const totalInteractions = rows.reduce((sum, row) => sum + interactionsOf(row), 0);
    const followersGained = rows.reduce((sum, row) => sum + (row.followers_gained ?? 0), 0);
    const profileVisits = rows.reduce((sum, row) => sum + (row.profile_visits ?? 0), 0);
    const leads = rows.reduce((sum, row) => sum + (row.leads_generated ?? 0), 0);
    const closes = rows.reduce((sum, row) => sum + (row.closes ?? 0), 0);
    const cash = rows.reduce((sum, row) => sum + (row.cash_collected_cents ?? 0), 0);
    const hasReach = rows.some((row) => row.reach != null && row.reach > 0);
    const hasInteractions = rows.some((row) => interactionsOf(row) > 0);
    const hasFollowers = rows.some((row) => row.followers_gained != null);
    // Replay depth = views ÷ reach, only over pieces that logged both — the
    // exact ratio Post-Level Performance already computes per row (see
    // `replay` below), aggregated here for the Replay Depth availability
    // card instead of a second, differently-scoped definition.
    const replayRows = rows.filter(
      (row) => row.reach != null && row.reach > 0 && row.views != null,
    );
    const replayViewsSum = replayRows.reduce((sum, row) => sum + (row.views ?? 0), 0);
    const replayReachSum = replayRows.reduce((sum, row) => sum + (row.reach ?? 0), 0);
    const averageReplayDepth =
      replayRows.length && replayReachSum > 0 ? replayViewsSum / replayReachSum : null;
    const retentionRows = rows.filter(
      (row) =>
        row.avg_watch_pct != null ||
        row.hook_retention_pct != null ||
        row.watch_time_seconds != null,
    );
    const averageWatchPct = retentionRows.length
      ? retentionRows.reduce(
          (sum, row) => sum + Number(row.avg_watch_pct ?? row.hook_retention_pct ?? 0),
          0,
        ) / retentionRows.length
      : null;

    const dayMap = new Map<
      string,
      { date: string; views: number; reach: number; interactions: number; followers: number }
    >();
    for (const piece of visiblePieces) {
      const metrics = piece.content_metrics?.length ? piece.content_metrics : [metricOf(piece)];
      for (const metric of metrics) {
        const rawDate = metric.captured_at ?? piece.posted_at;
        if (!rawDate) continue;
        const date = rawDate.slice(0, 10);
        const existing = dayMap.get(date) ?? {
          date,
          views: 0,
          reach: 0,
          interactions: 0,
          followers: 0,
        };
        existing.views += metric.views ?? 0;
        existing.reach += metric.reach ?? 0;
        existing.interactions += interactionsOf(metric);
        existing.followers += metric.followers_gained ?? 0;
        dayMap.set(date, existing);
      }
    }
    const trend = [...dayMap.values()]
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-30)
      .map((row) => ({
        ...row,
        label: row.date.slice(5),
      }));

    // Format Mix groups by FORMAT (the `platform` enum column, read as
    // format — see the platform/format note above `taxonomyOf`), with
    // proper capitalized labels instead of a raw underscore-replace.
    const typeMap = new Map<string, number>();
    for (const piece of visiblePieces) {
      const label = formatLabel(piece.platform);
      typeMap.set(label, (typeMap.get(label) ?? 0) + (metricOf(piece).views ?? 0));
    }
    const types = [...typeMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, views]) => ({ name, views }));

    return {
      totalViews,
      totalReach,
      totalInteractions,
      hasInteractions,
      followersGained,
      profileVisits,
      leads,
      closes,
      cash,
      hasReach,
      hasFollowers,
      averageWatchPct,
      averageReplayDepth,
      replaySampleSize: replayRows.length,
      trend,
      types,
    };
  }, [visiblePieces]);

  // Format Mix drill-down rows — scoped to visiblePieces (already filtered
  // by every active Filter Intelligence dimension: funnel stage/mechanism/
  // variation/platform/format), narrowed further to exactly the format bar
  // that was clicked. Never a generic, unfiltered content list.
  const formatMixRows = useMemo(
    () =>
      formatMixDrill
        ? visiblePieces.filter((piece) => formatLabel(piece.platform) === formatMixDrill)
        : [],
    [visiblePieces, formatMixDrill],
  );
  const formatMixColumns: DetailColumn<ContentCommandPiece>[] = [
    { key: "title", label: "Content", render: (p) => titleFor(p) },
    { key: "platform", label: "Platform", render: (p) => pieceSocialPlatform(p) },
    {
      key: "views",
      label: "Views",
      align: "right",
      render: (p) => fmt(metricOf(p).views ?? 0),
    },
    {
      key: "leads",
      label: "Leads",
      align: "right",
      render: (p) => fmt(metricOf(p).leads_generated ?? 0),
    },
    {
      key: "cash",
      label: "Cash",
      align: "right",
      render: (p) => money(metricOf(p).cash_collected_cents ?? 0),
    },
  ];

  const sortedPieces = useMemo(
    () =>
      [...visiblePieces]
        .sort((a, b) => {
          const left = metricOf(a);
          const right = metricOf(b);
          const value = (metric: ContentCommandMetric) => {
            if (sortKey === "reach") return metric.reach ?? -1;
            if (sortKey === "engagement")
              return metric.views ? (interactionsOf(metric) / metric.views) * 100 : -1;
            if (sortKey === "cash") return metric.cash_collected_cents ?? -1;
            return metric.views ?? -1;
          };
          return value(right) - value(left);
        })
        .slice(0, 6),
    [visiblePieces, sortKey],
  );

  return (
    <section aria-labelledby="content-command-center-title" className="space-y-4">
      <div className="flex flex-col gap-3 border-l-2 border-spectrum-mid pl-4">
        <div>
          <div className="flex items-center gap-2 text-3xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-spectrum-mid" /> ContentOS · unified intelligence
          </div>
          <h2
            id="content-command-center-title"
            className="display-serif mt-1 text-2xl tracking-tight md:text-3xl"
          >
            Content Command Center
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Performance, audience signals, retention, content-to-cash attribution, content demand
            signals, and setter-call intelligence — this is the source of truth for content, in one
            operating view.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/70 bg-card/50 p-3">
        <span className="mr-1 text-3xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Filter intelligence
        </span>
        <TaxonomySelect
          label="Funnel stage"
          value={taxonomyFilters.funnelStage}
          options={FUNNEL_STAGES.map((value) => ({ value, label: value.toUpperCase() }))}
          onChange={(value) =>
            setTaxonomyFilters((current) => ({ ...current, funnelStage: value }))
          }
        />
        <TaxonomySelect
          label="Mechanism"
          value={taxonomyFilters.mechanism}
          options={taxonomyOptions.mechanisms.map((value) => ({
            value,
            label: MECHANISMS[value as MechanismKey]?.label ?? value,
          }))}
          onChange={(value) => setTaxonomyFilters((current) => ({ ...current, mechanism: value }))}
        />
        <TaxonomySelect
          label="Variation"
          value={taxonomyFilters.variation}
          options={taxonomyOptions.variations.map((value) => ({
            value,
            label: value.replace(/_/g, " "),
          }))}
          onChange={(value) => setTaxonomyFilters((current) => ({ ...current, variation: value }))}
        />
        {/* Platform means Instagram/TikTok/YouTube/... (source_platform-
            resolved) — never a format. See taxonomyOf() above. Changing
            platform resets format, since the format list is scoped to
            whichever platform is selected. */}
        <TaxonomySelect
          label="Platform"
          value={taxonomyFilters.platform}
          options={taxonomyOptions.platforms.map((value) => ({ value, label: value }))}
          onChange={(value) =>
            setTaxonomyFilters((current) => ({ ...current, platform: value, format: "all" }))
          }
        />
        <TaxonomySelect
          label="Format"
          value={taxonomyFilters.format}
          options={taxonomyOptions.formats.map((value) => ({ value, label: formatLabel(value) }))}
          onChange={(value) => setTaxonomyFilters((current) => ({ ...current, format: value }))}
        />
        {Object.values(taxonomyFilters).some((value) => value !== "all") && (
          <button
            type="button"
            className="text-3xs text-muted-foreground underline-offset-2 hover:underline"
            onClick={() =>
              setTaxonomyFilters({
                funnelStage: "all",
                mechanism: "all",
                variation: "all",
                platform: "all",
                format: "all",
              })
            }
          >
            Clear
          </button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <CommandKpi
          label="Total views"
          value={fmt(stats.totalViews)}
          sub="Tracked content"
          spectrum="cold"
          emphasis="strong"
          icon={<Eye className="h-4 w-4" />}
        />
        <CommandKpi
          label="Total reach"
          value={stats.hasReach ? fmt(stats.totalReach) : "—"}
          sub={stats.hasReach ? "Unique reach" : "Field not populated"}
          spectrum="cold"
          icon={<Radio className="h-4 w-4" />}
          muted={!stats.hasReach}
        />
        <CommandKpi
          label="Engagement rate"
          value={
            stats.totalViews > 0 && stats.totalInteractions > 0
              ? `${((stats.totalInteractions / stats.totalViews) * 100).toFixed(1)}%`
              : "—"
          }
          sub={`${fmt(stats.totalInteractions)} interactions`}
          spectrum="mid"
          emphasis={stats.totalInteractions === 0 ? undefined : "subtle"}
          icon={<Heart className="h-4 w-4" />}
          muted={stats.totalInteractions === 0}
        />
        <CommandKpi
          label="Avg views / post"
          value={visiblePieces.length ? fmt(stats.totalViews / visiblePieces.length) : "—"}
          sub={`${visiblePieces.length} tracked pieces`}
          spectrum="mid"
          icon={<BarChart3 className="h-4 w-4" />}
          muted={!visiblePieces.length}
        />
        <CommandKpi
          label="Followers gained"
          value={stats.hasFollowers ? fmt(stats.followersGained) : "—"}
          sub={stats.hasFollowers ? "From logged content" : "Field not populated"}
          spectrum="hot"
          icon={<UserRound className="h-4 w-4" />}
          muted={!stats.hasFollowers}
        />
        {/* stats.cash/stats.closes sum content_metrics.cash_collected_cents/
            .closes, which have no write path anywhere in the app (same dead
            field the Sankey above was already corrected to stop reading —
            see the Priority 2/3 comment on MoneyOriginSection). Showing
            money(0)/fmt(0) here would read as "this content made zero cash,"
            which is a different claim than "this isn't tracked" — render the
            honest state instead. Remove this override once a real write path
            to these two columns exists. */}
        <CommandKpi
          label="Cash attributed"
          value="Not tracked"
          sub={`${fmt(stats.leads)} leads · content_metrics cash/closes fields aren't logged — see canonical paths below`}
          spectrum="hot"
          icon={<Layers3 className="h-4 w-4" />}
          muted
        />
      </div>

      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-3xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Canonical Content → Cash
            </div>
            <div className="mt-0.5 text-base font-semibold">Verified lifecycle paths</div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <label className="flex items-center gap-1.5 text-3xs uppercase tracking-wider text-muted-foreground">
              Attribution model
              <Select
                value={attributionModel}
                onValueChange={(v) => setAttributionModel(v as AttributionModel)}
              >
                <SelectTrigger className="h-7 w-auto gap-1.5 rounded-md border-border bg-background px-2 text-2xs normal-case tracking-normal text-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ATTRIBUTION_MODELS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {ATTRIBUTION_MODEL_LABELS[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <div className="text-3xs text-muted-foreground">
              {filteredCanonicalPaths.length} path{filteredCanonicalPaths.length === 1 ? "" : "s"} ·{" "}
              {attributionModel === "assisted_touch"
                ? "assisted credit — always inferred, never direct"
                : "no inferred revenue"}
            </div>
          </div>
        </div>
        {/* Platform here already resolves through pieceSocialPlatform() via
            platformByContentId (built above from real source_platform data)
            — genuinely the true platform, not the format-conflated field.
            Campaign/Source stay exactly as recorded on the canonical path
            (no normalized Campaign entity exists yet — see
            src/lib/platform-format.ts and the discovery report's Section 7);
            these filters show real values only, never invented ones. */}
        <div className="mt-3 grid gap-2 sm:grid-cols-4">
          {(
            [
              ["platform", "Platform"],
              ["campaign", "Campaign"],
              ["source", "Source"],
              ["content", "Content"],
            ] as const
          ).map(([key, label]) => {
            const sourceKey = key === "content" ? "contentId" : key;
            const values =
              key === "platform"
                ? (Array.from(
                    new Set(
                      activeCanonicalPaths.map((path) =>
                        path.contentId ? platformByContentId.get(path.contentId) : null,
                      ),
                    ),
                  ).filter(Boolean) as string[])
                : (Array.from(
                    new Set(activeCanonicalPaths.map((path) => path[sourceKey]).filter(Boolean)),
                  ) as string[]);
            return (
              <label key={key} className="text-3xs uppercase tracking-wider text-muted-foreground">
                {label}
                <Select
                  value={pathFilters[key]}
                  onValueChange={(value) =>
                    setPathFilters((current) => ({ ...current, [key]: value }))
                  }
                >
                  <SelectTrigger className="mt-1 h-8 w-full rounded-md border-border bg-background px-2 text-xs normal-case tracking-normal text-foreground">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {values.length === 0 ? (
                      <div className="px-2 py-1.5 text-3xs text-muted-foreground">
                        No {label.toLowerCase()} data yet
                      </div>
                    ) : (
                      values.map((value) => (
                        <SelectItem key={value} value={value}>
                          {value}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </label>
            );
          })}
        </div>
        {filteredCanonicalPaths.length ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[720px] text-xs">
              <thead className="text-left text-3xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="p-2">Content</th>
                  <th className="p-2">Platform</th>
                  <th className="p-2">Lead</th>
                  <th className="p-2">Booking</th>
                  <th className="p-2">Call</th>
                  <th className="p-2">Payment</th>
                  <th className="p-2">Evidence</th>
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody>
                {filteredCanonicalPaths.slice(0, 20).map((path) => (
                  <tr
                    key={`${path.personKey}:${path.outcomeKey ?? "none"}:${path.callId ?? "none"}:${path.paymentId ?? "none"}`}
                    className="border-t border-border/70"
                  >
                    <td className="p-2 font-medium">{path.contentId ?? "Unavailable"}</td>
                    <td className="p-2">{path.platform ?? "Unavailable"}</td>
                    <td className="p-2 font-mono">{path.personKey}</td>
                    <td className="p-2 font-mono">{path.bookingId ?? "—"}</td>
                    <td className="p-2 font-mono">{path.callId ?? "—"}</td>
                    <td className="p-2 font-mono">{path.paymentId ?? "—"}</td>
                    <td className="p-2">
                      <span className="text-spectrum-mid">{path.evidence.coverage}</span>
                      <span className="ml-2 text-muted-foreground">
                        {path.evidence.knownTouchpoints} touchpoint
                        {path.evidence.knownTouchpoints === 1 ? "" : "s"}
                      </span>
                    </td>
                    <td className="p-2 text-right">
                      <button
                        type="button"
                        className="text-spectrum-cold hover:underline"
                        onClick={() => setSelectedPath(path)}
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={<Layers3 className="h-4 w-4" />}
            title="No verified Content-to-Cash paths"
            description="The table will populate only when content, lead, booking/call, and payment identifiers are joined."
          />
        )}
        {selectedPath && (
          <div className="mt-3 rounded-xl border border-spectrum-mid/25 bg-spectrum-mid/5 p-3 text-xs">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-semibold">Evidence for {selectedPath.personKey}</div>
                <div className="mt-1 text-muted-foreground">
                  Model: {selectedPath.evidence.model.replaceAll("_", " ")} · Strength:{" "}
                  {selectedPath.evidence.strength} · Sample:{" "}
                  {selectedPath.evidence.sampleSize ?? "Unavailable"}
                </div>
              </div>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => setSelectedPath(null)}
              >
                Close
              </button>
            </div>
            <div className="mt-2 text-muted-foreground">
              Supporting events:{" "}
              {selectedPath.events.length
                ? selectedPath.events.map((event) => `${event.type} (${event.id})`).join(" · ")
                : "Unavailable"}
            </div>
            {selectedPath.evidence.sampleWarning && (
              <div className="mt-2 text-amber-300">{selectedPath.evidence.sampleWarning}</div>
            )}
          </div>
        )}
      </section>

      {/* Traffic and Attribution used to each get a smaller, separate
          mini-section here (a second Sankey, a static traffic-by-channel
          list) — replaced with the exact same components the standalone
          /traffic and /attribution pages render, so there is one
          implementation of each system, not a competing summarized copy. */}
      <TrafficPageContent embedded />
      <AttributionPageContent embedded />

      <div className="grid gap-3 xl:grid-cols-[1.45fr_0.75fr]">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm md:p-5">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <div className="text-3xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Content performance
              </div>
              <div className="mt-0.5 text-base font-semibold">
                Views, reach, and interactions over time
              </div>
            </div>
            <div className="hidden items-center gap-3 text-3xs text-muted-foreground sm:flex">
              <span className="flex items-center gap-1">
                <i className="h-1.5 w-1.5 rounded-full bg-spectrum-cold" />
                Views
              </span>
              {stats.hasReach && (
                <span className="flex items-center gap-1">
                  <i className="h-1.5 w-1.5 rounded-full bg-spectrum-mid" />
                  Reach
                </span>
              )}
              {stats.hasInteractions && (
                <span className="flex items-center gap-1">
                  <i className="h-1.5 w-1.5 rounded-full bg-spectrum-hot" />
                  Interactions
                </span>
              )}
            </div>
          </div>
          {stats.trend.length > 1 ? (
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats.trend} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="contentViewsFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={SPECTRUM_VAR.cold} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={SPECTRUM_VAR.cold} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    stroke="var(--muted-foreground)"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="var(--muted-foreground)"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    width={52}
                    tickFormatter={(value) => fmtCompact(value)}
                  />
                  <Tooltip
                    content={
                      <ChartTooltip
                        formatter={(value: number, name: string) => [
                          fmt(value),
                          name === "views" ? "Views" : name === "reach" ? "Reach" : "Interactions",
                        ]}
                      />
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey="views"
                    name="views"
                    stroke={SPECTRUM_VAR.cold}
                    fill="url(#contentViewsFill)"
                    strokeWidth={2}
                  />
                  {stats.hasReach && (
                    <Area
                      type="monotone"
                      dataKey="reach"
                      name="reach"
                      stroke={SPECTRUM_VAR.mid}
                      fill="none"
                      strokeWidth={1.5}
                    />
                  )}
                  {stats.hasInteractions && (
                    <Area
                      type="monotone"
                      dataKey="interactions"
                      name="interactions"
                      stroke={SPECTRUM_VAR.hot}
                      fill="none"
                      strokeWidth={1.5}
                    />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState
              icon={<BarChart3 className="h-4 w-4" />}
              title="Build the performance trend"
              description="Log content metrics across more than one date to see daily views, reach, and interaction movement."
            />
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm md:p-5">
          <div className="mb-3 flex items-start justify-between gap-2">
            <div>
              <div className="text-3xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Format mix
              </div>
              <div className="mt-0.5 text-base font-semibold">Views by content type</div>
              <p className="mt-1 text-3xs text-muted-foreground">
                Click a bar to see the content pieces behind it.
              </p>
            </div>
            <Video className="h-4 w-4 text-muted-foreground" />
          </div>
          {stats.types.length ? (
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={stats.types}
                  layout="vertical"
                  margin={{ top: 4, right: 8, left: 8, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" horizontal={false} />
                  <XAxis
                    type="number"
                    stroke="var(--muted-foreground)"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => fmt(value)}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    stroke="var(--muted-foreground)"
                    fontSize={10}
                    width={78}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    content={<ChartTooltip formatter={(value: number) => [fmt(value), "Views"]} />}
                  />
                  <Bar
                    dataKey="views"
                    fill={SPECTRUM_VAR.mid}
                    radius={[0, 4, 4, 0]}
                    barSize={16}
                    cursor="pointer"
                    onClick={(data: { name?: string }) => data.name && setFormatMixDrill(data.name)}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState
              icon={<Video className="h-4 w-4" />}
              title="No formats tracked"
              description="Log a content piece to see which formats are earning distribution."
            />
          )}
        </div>
      </div>

      <MetricDetailPanel<ContentCommandPiece>
        open={!!formatMixDrill}
        onOpenChange={(v) => !v && setFormatMixDrill(null)}
        title={formatMixDrill ?? ""}
        subtitle={
          formatMixDrill
            ? `Content pieces logged as ${formatMixDrill}, current filters applied`
            : undefined
        }
        columns={formatMixColumns}
        rows={formatMixRows}
        rowKey={(p) => p.id}
        cap={NOT_A_FUNNEL_STAGE}
        working={NOT_A_FUNNEL_STAGE}
        emptyRowsLabel="No content pieces for this format in the current filters."
      />

      <div>
        <div className="rounded-2xl border border-border bg-card shadow-sm">
          <div className="flex flex-col gap-3 border-b border-border/70 px-4 py-3 md:flex-row md:items-center md:justify-between md:px-5">
            <div>
              <div className="text-3xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Post-level performance
              </div>
              <div className="mt-0.5 text-base font-semibold">
                Top content in the current tracker
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(["views", "reach", "engagement", "cash"] as SortKey[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSortKey(key)}
                  className={cn(
                    "rounded border px-2 py-1 text-3xs font-medium capitalize transition",
                    sortKey === key
                      ? "border-foreground bg-foreground text-background"
                      : "border-border text-muted-foreground hover:bg-muted/40",
                  )}
                >
                  {key}
                </button>
              ))}
            </div>
          </div>
          {sortedPieces.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[930px] text-sm">
                <thead className="bg-muted/20 text-3xs uppercase tracking-[0.12em] text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium md:px-5">Content</th>
                    <th className="px-3 py-3 text-right font-medium">Views</th>
                    <th className="px-3 py-3 text-right font-medium">Reach</th>
                    <th className="px-3 py-3 text-right font-medium">Engagement</th>
                    <th className="px-3 py-3 text-right font-medium">Watch / retention</th>
                    <th className="px-3 py-3 text-right font-medium">Replay</th>
                    <th
                      className="px-4 py-3 text-right font-medium md:px-5"
                      title="content_metrics.cash_collected_cents isn't logged anywhere — see the Canonical Content → Cash table above for real, attributed cash"
                    >
                      Cash
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedPieces.map((piece) => {
                    const metric = metricOf(piece);
                    const engagement = metric.views
                      ? (interactionsOf(metric) / metric.views) * 100
                      : null;
                    const replay =
                      metric.reach && metric.reach > 0 && metric.views != null
                        ? metric.views / metric.reach
                        : null;
                    const watch =
                      metric.watch_time_seconds != null
                        ? `${metric.watch_time_seconds.toFixed(1)}s`
                        : metric.avg_watch_pct != null
                          ? `${metric.avg_watch_pct.toFixed(1)}%`
                          : metric.hook_retention_pct != null
                            ? `${metric.hook_retention_pct.toFixed(1)}%`
                            : "—";
                    return (
                      <tr
                        key={piece.id}
                        className="border-t border-border/70 transition hover:bg-muted/15"
                      >
                        <td className="max-w-[300px] px-4 py-3 md:px-5">
                          {piece.url ? (
                            <a
                              href={piece.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block max-w-full text-left"
                            >
                              <div className="truncate text-xs font-semibold hover:text-spectrum-mid">
                                {titleFor(piece)}
                              </div>
                              <div className="mt-1 flex items-center gap-2 text-3xs capitalize text-muted-foreground">
                                <span className="inline-flex items-center gap-1">
                                  <PlatformIcon platform={pieceSocialPlatform(piece)} />
                                  {pieceSocialPlatform(piece)} · {formatLabel(piece.platform)}
                                </span>
                                {piece.mechanism && <span>· {piece.mechanism}</span>}
                                <span>· open post ↗</span>
                              </div>
                            </a>
                          ) : (
                            <div className="block max-w-full text-left">
                              <div className="truncate text-xs font-semibold">
                                {titleFor(piece)}
                              </div>
                              <div className="mt-1 flex items-center gap-2 text-3xs capitalize text-muted-foreground">
                                <span className="inline-flex items-center gap-1">
                                  <PlatformIcon platform={pieceSocialPlatform(piece)} />
                                  {pieceSocialPlatform(piece)} · {formatLabel(piece.platform)}
                                </span>
                                {piece.mechanism && <span>· {piece.mechanism}</span>}
                              </div>
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right font-sans tabular-nums text-xs">
                          {fmt(metric.views ?? 0)}
                        </td>
                        <td className="px-3 py-3 text-right font-sans tabular-nums text-xs">
                          {metric.reach != null && metric.reach > 0 ? fmt(metric.reach) : "—"}
                        </td>
                        <td className="px-3 py-3 text-right font-sans tabular-nums text-xs">
                          {engagement != null && engagement > 0 ? `${engagement.toFixed(1)}%` : "—"}
                        </td>
                        <td className="px-3 py-3 text-right font-sans tabular-nums text-xs">
                          {watch}
                        </td>
                        <td className="px-3 py-3 text-right font-sans tabular-nums text-xs">
                          {replay != null ? `${replay.toFixed(2)}×` : "—"}
                        </td>
                        {/* content_metrics.cash_collected_cents has no write path — see the
                            "Cash attributed" CommandKpi above for the same override. */}
                        <td className="px-4 py-3 text-right font-sans tabular-nums text-xs text-muted-foreground md:px-5">
                          Not tracked
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              icon={<Eye className="h-4 w-4" />}
              title="No posts to rank"
              description="Log content and add metrics to build the post-level performance table."
            />
          )}
        </div>
      </div>

      <ContentSignalsSection
        demand={demand as SignalsDemand | undefined}
        weekly={weekly as SignalsWeekly | undefined}
        bottleneckRead={bottleneckRead}
        onAnalyze={onAnalyzeBottlenecks}
        analyzing={analyzingBottlenecks}
        rangeLabel={`${signalsRange.from} → ${signalsRange.to}`}
        reelTarget={reelTarget}
        onReelTargetChange={onReelTargetChange}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AvailabilityCard
          icon={<Users className="h-4 w-4" />}
          label="Audience snapshot"
          value="Not connected"
          detail="Followers, demographics, countries, and cities need an account-level source."
        />
        <AvailabilityCard
          icon={<Radio className="h-4 w-4" />}
          label="Stories"
          value={
            stories && stories.sequencesTracked > 0
              ? `${fmt(stories.totalViews)} slide views`
              : "No data yet"
          }
          detail={
            stories && stories.sequencesTracked > 0
              ? `${stories.sequencesTracked} sequence${stories.sequencesTracked === 1 ? "" : "s"} · ${stories.totalSlides} slides · ${
                  stories.avgExitRatePct != null
                    ? `${stories.avgExitRatePct.toFixed(1)}% avg exit`
                    : "exit rate: insufficient data"
                }`
              : "Real data source (story_slides / slide_metrics) — log a story sequence with slides in the content table to populate this card."
          }
        />
        <AvailabilityCard
          icon={<BarChart3 className="h-4 w-4" />}
          label="Retention"
          value={
            stats.averageWatchPct != null ? `${stats.averageWatchPct.toFixed(1)}%` : "Not populated"
          }
          detail={
            stats.averageWatchPct != null
              ? "Average watch / hook retention from logged metrics."
              : "Add watch time or retention fields to enable this layer."
          }
        />
        <AvailabilityCard
          icon={<Sparkles className="h-4 w-4" />}
          label="Replay depth"
          value={
            stats.averageReplayDepth != null
              ? `${stats.averageReplayDepth.toFixed(2)}×`
              : "Insufficient data"
          }
          detail={
            stats.averageReplayDepth != null
              ? `Views ÷ reach across ${stats.replaySampleSize} tracked piece${stats.replaySampleSize === 1 ? "" : "s"} with both fields logged, within the current filters.`
              : "Needs at least one visible piece with both views and reach logged."
          }
          title="Replay depth = views ÷ reach — how many times, on average, the content was replayed relative to unique reach. Same calculation as the Replay column in Post-level performance."
        />
      </div>
    </section>
  );
}

function CommandKpi({
  label,
  value,
  sub,
  spectrum,
  icon,
  muted,
  emphasis,
}: {
  label: string;
  value: string;
  sub: string;
  spectrum: SpectrumPosition;
  icon: React.ReactNode;
  muted?: boolean;
  /** Opts this tile into the gradient-KPI-card treatment (see MetricCard) —
   * reserve for the 1-2 genuinely top-tier metrics in the row. Never set
   * alongside `muted` (an unavailable/untracked metric shouldn't visually
   * compete for attention). */
  emphasis?: KpiEmphasis;
}) {
  const gradient = emphasis && !muted ? kpiGradient(SPECTRUM_VAR[spectrum], emphasis) : undefined;
  const gradientBorder =
    emphasis && !muted ? kpiGradientBorder(SPECTRUM_VAR[spectrum], emphasis) : undefined;
  // "Strong" already makes the color unmistakable via the fill itself —
  // keep the value neutral there (same reasoning as MetricCard/CashHero) so
  // it doesn't sit same-hue-on-same-hue at reduced contrast. "Subtle" stays
  // close enough to the plain card that the existing spectrum-tinted value
  // text keeps comfortable contrast, so it's left as-is.
  const valueColor = emphasis === "strong" ? undefined : SPECTRUM_VAR[spectrum];
  return (
    <div
      className={cn(
        "rounded-2xl border p-4 shadow-sm",
        gradient ? "kpi-gradient" : "border-border bg-card",
        muted && "opacity-75",
      )}
      style={
        gradient
          ? ({
              background: gradient,
              "--kpi-border": gradientBorder!.border,
              "--kpi-border-hover": gradientBorder!.borderHover,
            } as CSSProperties)
          : undefined
      }
    >
      <div className="flex items-center justify-between gap-2 text-3xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        <span>{label}</span>
        <span style={{ color: SPECTRUM_VAR[spectrum] }}>{icon}</span>
      </div>
      <div
        className={cn(
          "mt-3 font-sans font-semibold",
          // `muted` means the value is an unavailable-state phrase, not a
          // figure — render it as prose at status scale so it doesn't
          // out-shout the real numbers beside it.
          muted ? "text-sm leading-snug text-muted-foreground" : "text-2xl tabular-nums",
          !muted && valueColor === undefined && "text-foreground",
        )}
        style={!muted && valueColor ? { color: valueColor } : undefined}
      >
        {value}
      </div>
      <div className="mt-1 text-3xs text-muted-foreground">{sub}</div>
    </div>
  );
}

function AvailabilityCard({
  icon,
  label,
  value,
  detail,
  title,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
  /** Native tooltip — used for cards that need to spell out a calculation. */
  title?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-background/45 p-4" title={title}>
      <div className="flex items-center gap-2 text-3xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-3 text-sm font-semibold text-foreground">{value}</div>
      <div className="mt-1 text-3xs leading-relaxed text-muted-foreground">{detail}</div>
    </div>
  );
}
