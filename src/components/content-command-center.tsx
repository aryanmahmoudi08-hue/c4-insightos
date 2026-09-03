import React from "react";
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
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
  Layer,
  Rectangle,
  ResponsiveContainer,
  Sankey,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { EmptyState } from "@/components/empty-state";
import { MECHANISMS, MECHANISM_KEYS, type MechanismKey } from "@/lib/content-mechanisms";
import { SPECTRUM_VAR, type SpectrumPosition } from "@/lib/spectrum";
import { cn } from "@/lib/utils";
import type { AttributionModel, CanonicalLifecycleAttributionPath } from "@/lib/acquisition";
import { FUNNEL_STAGES, normalizeTaxonomy } from "@/lib/content-taxonomy";
import {
  ATTRIBUTION_MODELS,
  ATTRIBUTION_MODEL_LABELS,
  aggregateCashByContent,
} from "@/lib/content-attribution";
import { normalizeSocialPlatform } from "@/lib/social-platform";
import { PlatformIcon } from "@/components/platform-icon";

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
};

export type ContentWeeklySummary = {
  reels: number;
  missing: string[];
  untracked: number;
  best: string | null;
  worst: string | null;
  total: number;
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
};

export type ContentAttributionSummary = {
  touches: number;
  leads: number;
  attributed: number;
  closes: number;
  contractValueCents: number;
  cashCollectedCents: number;
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
};

const fmt = (value: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(value));
const money = (cents: number) =>
  `$${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(cents / 100))}`;
const titleFor = (piece: ContentCommandPiece) => piece.title || piece.hook || "Untitled content";
const platformFor = (platform: string) => platform.replace(/_/g, " ");

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

type MoneySankeyNodePayload = {
  name: string;
  kind: "content" | "platform" | "cash";
  refId: string | null;
};

/** Custom Sankey node — recharts' default renders a bare rectangle with no
 * label. Mirrors the one already proven out on the old standalone Attribution
 * page (same known recharts quirk: no containerWidth prop reaches a custom
 * node renderer, so the terminal-node side is keyed off its name instead).
 * Content/platform nodes are clickable (Priority 4) — they filter the
 * Canonical Content -> Cash table below via real contentId/platform values,
 * not a decorative interaction. The terminal "Cash Collected" node isn't a
 * specific record, so it stays inert. */
function MoneySankeyNode(props: { onSelect?: (payload: MoneySankeyNodePayload) => void }) {
  // recharts clones this element and merges in x/y/width/height/payload/
  // index at render time — none of that reaches our declared prop type, so
  // it's read back out via a cast (same approach the pre-existing
  // attribution.tsx SankeyNodeLabel uses for the same recharts quirk).
  const { x, y, width, height, payload, onSelect } = props as typeof props & {
    x: number;
    y: number;
    width: number;
    height: number;
    payload: MoneySankeyNodePayload;
  };
  const clickable = payload.kind !== "cash" && !!onSelect;
  const isOut = payload.kind === "cash";
  return (
    <Layer>
      <Rectangle
        x={x}
        y={y}
        width={width}
        height={height}
        fill="var(--spectrum-hot)"
        fillOpacity={0.8}
        style={clickable ? { cursor: "pointer" } : undefined}
        onClick={clickable ? () => onSelect!(payload) : undefined}
      />
      <text
        x={isOut ? x - 6 : x + width + 6}
        y={y + height / 2}
        textAnchor={isOut ? "end" : "start"}
        dominantBaseline="middle"
        className={cn("fill-foreground text-[10px]", clickable && "cursor-pointer underline")}
        style={clickable ? { cursor: "pointer" } : undefined}
        onClick={clickable ? () => onSelect!(payload) : undefined}
      >
        {payload.name}
      </text>
    </Layer>
  );
}

/** Unified money-origin attribution (spec section 9): Platform → content →
 * cash, as a real flow diagram, plus Traffic channel performance —
 * consolidating what used to be two separate dashboards (standalone
 * Attribution and Traffic pages) into Content Command Center.
 *
 * Priority 2/3 correction: the Sankey no longer reads content_metrics.
 * cash_collected_cents (confirmed to have no write path anywhere in the
 * app). It's built from aggregateCashByContent(canonicalPaths, callCashById)
 * — the SAME model-selected canonical paths driving the table below, joined
 * to calls.cash_collected_cents. This makes the model selector genuinely
 * reshape the diagram, and keeps the diagram and the table unable to
 * disagree about which calls are attributed to which content. */
function MoneyOriginSection({
  attributionSummary,
  traffic,
  canonicalPaths,
  callCashById,
  attributionModel,
  pieces,
  onFilterContent,
  onFilterPlatform,
}: {
  attributionSummary?: ContentAttributionSummary;
  traffic?: ContentTrafficSummary;
  canonicalPaths: CanonicalLifecycleAttributionPath[];
  callCashById: Record<string, number>;
  attributionModel: AttributionModel;
  pieces: ContentCommandPiece[];
  onFilterContent: (contentId: string) => void;
  onFilterPlatform: (platform: string) => void;
}) {
  const pieceById = useMemo(() => new Map(pieces.map((p) => [p.id, p])), [pieces]);
  const attributedCallCount = useMemo(
    () => new Set(canonicalPaths.map((p) => p.callId).filter(Boolean)).size,
    [canonicalPaths],
  );

  const cashRows = useMemo(
    () => aggregateCashByContent(canonicalPaths, callCashById),
    [canonicalPaths, callCashById],
  );

  const sankeyData = useMemo(() => {
    const top = [...cashRows].sort((a, b) => b.cashCents - a.cashCents).slice(0, 8);
    if (top.length === 0) return null;
    const titleFor2 = (contentId: string) => {
      const piece = pieceById.get(contentId);
      const t = (piece ? titleFor(piece) : contentId) || contentId;
      return t.length > 24 ? t.slice(0, 24) + "…" : t;
    };
    const platformFor2 = (contentId: string) => {
      const piece = pieceById.get(contentId);
      return piece ? pieceSocialPlatform(piece) : "Unknown / Unattributed";
    };
    const platformNames: string[] = Array.from(new Set(top.map((r) => platformFor2(r.contentId))));
    const nodes: MoneySankeyNodePayload[] = [
      ...top.map((r) => ({
        name: titleFor2(r.contentId),
        kind: "content" as const,
        refId: r.contentId,
      })),
      ...platformNames.map((pl) => ({ name: pl, kind: "platform" as const, refId: pl })),
      { name: "Cash Collected", kind: "cash" as const, refId: null },
    ];
    const platformIndex = (pl: string) => top.length + platformNames.indexOf(pl);
    const cashNodeIndex = nodes.length - 1;
    const links = [
      ...top.map((r, i) => ({
        source: i,
        target: platformIndex(platformFor2(r.contentId)),
        // Real cents, no dollar rounding and no artificial floor — Priority
        // 5: only rows with cashCents > 0 ever reach this array
        // (aggregateCashByContent already excludes zero/missing cash), so
        // every link here is a genuinely nonzero, real value.
        value: r.cashCents,
      })),
      ...platformNames.map((pl) => ({
        source: platformIndex(pl),
        target: cashNodeIndex,
        value: top
          .filter((r) => platformFor2(r.contentId) === pl)
          .reduce((s, r) => s + r.cashCents, 0),
      })),
    ];
    return { nodes, links, platformNames };
  }, [cashRows, pieceById]);

  const handleNodeSelect = (payload: MoneySankeyNodePayload) => {
    if (payload.kind === "content" && payload.refId) onFilterContent(payload.refId);
    else if (payload.kind === "platform" && payload.refId) onFilterPlatform(payload.refId);
  };

  const emptyDescription = !canonicalPaths.length
    ? `No closed calls have a resolvable ${ATTRIBUTION_MODEL_LABELS[attributionModel].toLowerCase()} content attribution in this range.`
    : `${attributedCallCount} attributed call${attributedCallCount === 1 ? "" : "s"} found for this model, but none have cash_collected_cents logged yet — log cash on the Closer call record to populate this.`;

  return (
    <div className="space-y-3">
      {attributionSummary && (
        <div className="grid grid-cols-2 gap-2 rounded-xl border border-border/70 bg-card/50 p-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            ["Touches", fmt(attributionSummary.touches)],
            ["Leads", fmt(attributionSummary.leads)],
            [
              "Attributed",
              attributionSummary.leads
                ? `${Math.round((attributionSummary.attributed / attributionSummary.leads) * 100)}%`
                : "—",
            ],
            ["Closes", fmt(attributionSummary.closes)],
            ["Contract value", money(attributionSummary.contractValueCents)],
            ["Cash collected", money(attributionSummary.cashCollectedCents)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-border/60 bg-background/40 p-2">
              <div className="text-3xs uppercase tracking-wider text-muted-foreground">{label}</div>
              <div className="mt-0.5 font-mono text-sm font-semibold">{value}</div>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-3 xl:grid-cols-[1.4fr_1fr]">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm md:p-5">
          <div className="mb-2">
            <div className="text-3xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Unified money-origin attribution — {ATTRIBUTION_MODEL_LABELS[attributionModel]} basis
            </div>
            <div className="mt-0.5 text-base font-semibold">
              Content → platform → cash collected
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Reshapes with the attribution model selected below. Click a content or platform node
              to filter the table.
            </p>
            {attributionModel === "assisted_touch" && (
              <p className="mt-1.5 rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1.5 text-3xs text-amber-300">
                Assisted credit is inferred, not direct: the same call's cash can be attributed to
                more than one assisting piece here, so totals will legitimately exceed any single
                call's real amount. Not an aggregate total.
              </p>
            )}
          </div>
          {sankeyData ? (
            <>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <Sankey
                    data={sankeyData}
                    nodePadding={18}
                    nodeWidth={10}
                    linkCurvature={0.5}
                    link={{ stroke: "var(--spectrum-hot)", strokeOpacity: 0.25 }}
                    node={<MoneySankeyNode onSelect={handleNodeSelect} />}
                  >
                    <Tooltip formatter={(v: number) => money(v)} />
                  </Sankey>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-3xs text-muted-foreground">
                {sankeyData.platformNames.map((pl) => (
                  <span key={pl} className="inline-flex items-center gap-1">
                    <PlatformIcon platform={pl} className="h-3 w-3" /> {pl}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <EmptyState
              icon={<ArrowUpRight className="h-4 w-4" />}
              title="No attributed cash for this model"
              description={emptyDescription}
            />
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm md:p-5">
          <div className="mb-2">
            <div className="text-3xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Traffic & channel performance
            </div>
            <div className="mt-0.5 text-base font-semibold">Revenue by traffic source</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Consolidated from the standalone Traffic page — manage sources and tracking URLs
              there. Rows aren't individually clickable: there's no per-channel filtered lead view
              yet to send you to.
            </p>
          </div>
          {traffic && traffic.channels.length ? (
            <div className="space-y-2">
              {traffic.channels.map((c) => (
                <div key={c.id} className="rounded-lg border border-border/60 bg-muted/10 p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 truncate text-xs font-medium">
                      <PlatformIcon platform={normalizeSocialPlatform(c.name)} />
                      {c.name}
                    </span>
                    <span className="font-mono text-xs text-spectrum-hot">
                      {money(c.contractedCents)}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-3xs text-muted-foreground">
                    <span>{c.leads} leads</span>
                    <span>{c.clients} clients</span>
                    <span>{c.closeRate.toFixed(0)}% close</span>
                    <span>{money(c.revenuePerLeadCents)}/lead</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-3xs text-muted-foreground">
                    <span>Collected: {money(c.collectedCents)}</span>
                    {c.clientContractedCents > 0 && (
                      <span>Mentee contract LTV: {money(c.clientContractedCents)}</span>
                    )}
                  </div>
                </div>
              ))}
              {traffic.noSource > 0 && (
                <div className="text-3xs text-muted-foreground">
                  {traffic.noSource} lead{traffic.noSource === 1 ? "" : "s"} with no traffic source
                  attached — unattributed, not guessed.
                </div>
              )}
            </div>
          ) : (
            <EmptyState
              icon={<Radio className="h-4 w-4" />}
              title="No traffic channels yet"
              description="Add traffic sources on the Traffic page and tag leads with a source to populate this."
              action={
                <Link to="/traffic" className="text-xs text-primary hover:underline">
                  Open Traffic →
                </Link>
              }
            />
          )}
        </div>
      </div>
    </div>
  );
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
}: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("views");
  const [selectedPath, setSelectedPath] = useState<CanonicalLifecycleAttributionPath | null>(null);
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
  const taxonomyOptions = useMemo(() => {
    const normalized = pieces.map((piece) =>
      normalizeTaxonomy({
        funnelStage: piece.funnel_stage,
        mechanism: piece.mechanism,
        variation: piece.variation,
        platform: piece.platform,
        format: piece.post_format,
      }),
    );
    return {
      mechanisms: [
        ...new Set(normalized.map((row) => row.mechanism).filter((value) => value !== "unknown")),
      ],
      variations: [
        ...new Set(normalized.map((row) => row.variation).filter((value) => value !== "unknown")),
      ],
      platforms: [
        ...new Set(normalized.map((row) => row.platform).filter((value) => value !== "unknown")),
      ],
      formats: [
        ...new Set(normalized.map((row) => row.format).filter((value) => value !== "unknown")),
      ],
    };
  }, [pieces]);
  const visiblePieces = useMemo(
    () =>
      pieces.filter((piece) => {
        const taxonomy = normalizeTaxonomy({
          funnelStage: piece.funnel_stage,
          mechanism: piece.mechanism,
          variation: piece.variation,
          platform: piece.platform,
          format: piece.post_format,
        });
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
    const hasFollowers = rows.some((row) => row.followers_gained != null);
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

    const typeMap = new Map<string, number>();
    for (const piece of visiblePieces)
      typeMap.set(
        platformFor(piece.platform),
        (typeMap.get(platformFor(piece.platform)) ?? 0) + (metricOf(piece).views ?? 0),
      );
    const types = [...typeMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, views]) => ({ name, views }));

    return {
      totalViews,
      totalReach,
      totalInteractions,
      followersGained,
      profileVisits,
      leads,
      closes,
      cash,
      hasReach,
      hasFollowers,
      averageWatchPct,
      trend,
      types,
    };
  }, [visiblePieces]);

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

  const mix = MECHANISM_KEYS.map((key) => ({
    key,
    label: MECHANISMS[key].label,
    value: demand?.mix?.[key] ?? 0,
  }));

  return (
    <section aria-labelledby="content-command-center-title" className="space-y-4">
      <div className="flex flex-col gap-3 border-l-2 border-spectrum-mid pl-4 sm:flex-row sm:items-end sm:justify-between">
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
            Performance, audience signals, retention, and content demand in one operating view.
            Existing Content Intelligence and Content Signals remain the source of truth.
          </p>
        </div>
        <Link
          to="/content-signals"
          className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-md border border-border px-3 py-2 text-xs font-semibold text-foreground transition hover:bg-muted/40 sm:self-auto"
        >
          Open signal engine <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/70 bg-card/50 p-3">
        <span className="mr-1 text-3xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Filter intelligence
        </span>
        {[
          [
            "funnelStage",
            "Funnel stage",
            FUNNEL_STAGES.map((value) => ({ value, label: value.toUpperCase() })),
          ],
          [
            "mechanism",
            "Mechanism",
            taxonomyOptions.mechanisms.map((value) => ({
              value,
              label: MECHANISMS[value as MechanismKey]?.label ?? value,
            })),
          ],
          [
            "variation",
            "Variation",
            taxonomyOptions.variations.map((value) => ({ value, label: value.replace(/_/g, " ") })),
          ],
          [
            "platform",
            "Platform",
            taxonomyOptions.platforms.map((value) => ({ value, label: platformFor(value) })),
          ],
          [
            "format",
            "Format",
            taxonomyOptions.formats.map((value) => ({ value, label: value.replace(/_/g, " ") })),
          ],
        ].map(([key, label, options]) => (
          <select
            key={key as string}
            aria-label={label as string}
            value={taxonomyFilters[key as keyof typeof taxonomyFilters]}
            onChange={(event) =>
              setTaxonomyFilters((current) => ({ ...current, [key as string]: event.target.value }))
            }
            className="h-8 rounded-md border border-border bg-background px-2 text-xs capitalize text-foreground"
          >
            <option value="all">All {label as string}</option>
            {(options as Array<{ value: string; label: string }>).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ))}
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
        <CommandKpi
          label="Cash attributed"
          value={money(stats.cash)}
          sub={`${fmt(stats.leads)} leads · ${fmt(stats.closes)} closes · ${filteredCanonicalPaths.length} canonical paths`}
          spectrum="hot"
          icon={<Layers3 className="h-4 w-4" />}
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
              <select
                value={attributionModel}
                onChange={(e) => setAttributionModel(e.target.value as AttributionModel)}
                className="h-7 rounded-md border border-border bg-background px-2 text-2xs normal-case tracking-normal text-foreground"
              >
                {ATTRIBUTION_MODELS.map((m) => (
                  <option key={m} value={m}>
                    {ATTRIBUTION_MODEL_LABELS[m]}
                  </option>
                ))}
              </select>
            </label>
            <div className="text-3xs text-muted-foreground">
              {filteredCanonicalPaths.length} path{filteredCanonicalPaths.length === 1 ? "" : "s"} ·{" "}
              {attributionModel === "assisted_touch"
                ? "assisted credit — always inferred, never direct"
                : "no inferred revenue"}
            </div>
          </div>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-4">
          {(["platform", "campaign", "source", "content"] as const).map((key) => {
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
                {key}
                <select
                  value={pathFilters[key]}
                  onChange={(event) =>
                    setPathFilters((current) => ({ ...current, [key]: event.target.value }))
                  }
                  className="mt-1 block w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs normal-case tracking-normal text-foreground"
                >
                  <option value="all">All</option>
                  {values.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
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

      <MoneyOriginSection
        attributionSummary={attributionSummary}
        traffic={traffic}
        canonicalPaths={activeCanonicalPaths}
        callCashById={callCashById}
        attributionModel={attributionModel}
        pieces={pieces}
        onFilterContent={(contentId) => setPathFilters((prev) => ({ ...prev, content: contentId }))}
        onFilterPlatform={(platform) => setPathFilters((prev) => ({ ...prev, platform }))}
      />

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
            </div>
          </div>
          {stats.trend.length > 1 ? (
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats.trend} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
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
                    width={42}
                    tickFormatter={(value) => fmt(value)}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(value: number, name: string) => [
                      fmt(value),
                      name === "views" ? "Views" : name === "reach" ? "Reach" : "Interactions",
                    ]}
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
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(value: number) => [fmt(value), "Views"]}
                  />
                  <Bar dataKey="views" fill={SPECTRUM_VAR.mid} radius={[0, 4, 4, 0]} barSize={16} />
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

      <div className="grid gap-3 xl:grid-cols-[1.25fr_0.75fr]">
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
                    <th className="px-4 py-3 text-right font-medium md:px-5">Cash</th>
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
                                  {platformFor(piece.platform)}
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
                                  {platformFor(piece.platform)}
                                </span>
                                {piece.mechanism && <span>· {piece.mechanism}</span>}
                              </div>
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-xs">
                          {fmt(metric.views ?? 0)}
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-xs">
                          {metric.reach != null && metric.reach > 0 ? fmt(metric.reach) : "—"}
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-xs">
                          {engagement != null && engagement > 0 ? `${engagement.toFixed(1)}%` : "—"}
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-xs">{watch}</td>
                        <td className="px-3 py-3 text-right font-mono text-xs">
                          {replay != null ? `${replay.toFixed(2)}×` : "—"}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-xs md:px-5">
                          {money(metric.cash_collected_cents ?? 0)}
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

        <SignalLayer demand={demand} weekly={weekly} mix={mix} />
      </div>

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
          value="Not connected"
          detail="Active stories, story reach, replies, shares, and exits are not in the current tracker."
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
          value="Not connected"
          detail="Replay rate requires views divided by reach from a source that exposes both."
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
}: {
  label: string;
  value: string;
  sub: string;
  spectrum: SpectrumPosition;
  icon: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-card p-4 shadow-sm",
        muted && "opacity-75",
      )}
    >
      <div className="flex items-center justify-between gap-2 text-3xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        <span>{label}</span>
        <span style={{ color: SPECTRUM_VAR[spectrum] }}>{icon}</span>
      </div>
      <div
        className="mt-3 font-mono text-2xl font-semibold tabular-nums"
        style={{ color: SPECTRUM_VAR[spectrum] }}
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
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-background/45 p-4">
      <div className="flex items-center gap-2 text-3xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-3 text-sm font-semibold text-foreground">{value}</div>
      <div className="mt-1 text-3xs leading-relaxed text-muted-foreground">{detail}</div>
    </div>
  );
}

function SignalLayer({
  demand,
  weekly,
  mix,
}: {
  demand?: ContentDemandSummary;
  weekly?: ContentWeeklySummary;
  mix: { key: MechanismKey; label: string; value: number }[];
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm md:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-3xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-spectrum-mid" /> Content signals
          </div>
          <div className="mt-0.5 text-base font-semibold">What to post next</div>
        </div>
        <Link
          to="/content-signals"
          className="text-3xs text-muted-foreground hover:text-foreground"
        >
          Open full view →
        </Link>
      </div>
      {demand ? (
        <>
          <div className="mt-4 space-y-3">
            {mix.map((item) => (
              <div key={item.key}>
                <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                  <span>{item.label}</span>
                  <span className="font-mono text-muted-foreground">{item.value}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted/60">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.max(0, Math.min(100, item.value))}%`,
                      background:
                        SPECTRUM_VAR[
                          item.key === "educational" || item.key === "relatability"
                            ? "cold"
                            : item.key === "credibility"
                              ? "mid"
                              : "hot"
                        ],
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 border-t border-border/70 pt-3 text-3xs text-muted-foreground">
            <div>
              <span className="font-mono text-foreground">{weekly?.reels ?? 0}</span> reels this
              week
            </div>
            <div>
              <span className="font-mono text-foreground">{weekly?.untracked ?? 0}</span> untracked
            </div>
            <div>
              <span className="font-mono text-foreground">{weekly?.missing?.length ?? 0}</span>{" "}
              categories missing
            </div>
            <div>
              <span className="font-mono text-foreground">{demand.counts?.faq ?? 0}</span> FAQ
              signals
            </div>
          </div>
          {demand.insufficientData && (
            <div className="mt-3 rounded-lg border border-[color:var(--color-warning)]/25 bg-[color:var(--color-warning)]/[0.06] px-3 py-2 text-3xs text-[color:var(--color-warning)]">
              Limited data: this is a real computed mix, but the signal weight is below the
              workspace threshold.
            </div>
          )}
          {(weekly?.best || weekly?.worst) && (
            <div className="mt-3 rounded-lg border border-border/70 bg-background/40 px-3 py-2 text-3xs text-muted-foreground">
              <span className="text-[color:var(--color-success)]">
                Best:{" "}
                {weekly.best
                  ? (MECHANISMS[weekly.best as MechanismKey]?.label ?? weekly.best)
                  : "—"}
              </span>
              <span className="mx-2 text-border">·</span>
              <span className="text-[color:var(--color-warning)]">
                Needs attention:{" "}
                {weekly.worst
                  ? (MECHANISMS[weekly.worst as MechanismKey]?.label ?? weekly.worst)
                  : "—"}
              </span>
            </div>
          )}
        </>
      ) : (
        <EmptyState
          icon={<Sparkles className="h-4 w-4" />}
          title="Signal layer loading"
          description="The existing Content Signals engine will appear here when the workspace data is available."
        />
      )}
    </div>
  );
}
