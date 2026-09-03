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
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { EmptyState } from "@/components/empty-state";
import { MECHANISMS, MECHANISM_KEYS, type MechanismKey } from "@/lib/content-mechanisms";
import { SPECTRUM_VAR, type SpectrumPosition } from "@/lib/spectrum";
import { cn } from "@/lib/utils";
import type { CanonicalLifecycleAttributionPath } from "@/lib/acquisition";
import { FUNNEL_STAGES, normalizeTaxonomy } from "@/lib/content-taxonomy";

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
  post_format?: string | null;
  funnel_stage?: string | null;
  posted_at?: string | null;
  mechanism?: string | null;
  variation?: string | null;
  content_metrics?: ContentCommandMetric[] | null;
  url?: string | null;
};

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

type Props = {
  pieces: ContentCommandPiece[];
  demand?: ContentDemandSummary;
  weekly?: ContentWeeklySummary;
  canonicalPaths?: CanonicalLifecycleAttributionPath[];
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

type FlowNode = {
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
};

type FlowLink = {
  source: [number, number];
  target: [number, number];
  sourceWidth: number;
  targetWidth: number;
  color: string;
  opacity?: number;
  metadata?: {
    pillar: string;
    format: string;
    conversionRate: string;
    leads: string;
    revenue: string;
    attributionModel?: string;
    coverage?: "direct" | "partial" | "inferred" | "unavailable";
    strength?: "high" | "medium" | "low" | "unknown";
    knownTouchpoints?: number;
    sampleWarning?: string | null;
  };
};

const pillars = [
  {
    name: "Educational",
    color: "#38bdf8",
    variations: [
      { name: "Value", percentage: 35 },
      { name: "Problem-Solution", percentage: 65 },
    ],
  },
  {
    name: "Credibility",
    color: "#a855f7",
    variations: [
      { name: "Testimonial", percentage: 30 },
      { name: "Case-Study", percentage: 70 },
    ],
  },
  {
    name: "Authoritative",
    color: "#c084fc",
    variations: [
      { name: "Attention Driven (Lifestyle)", percentage: 42 },
      { name: "Industry Leader", percentage: 58 },
    ],
  },
  {
    name: "Relatability",
    color: "#ec4899",
    variations: [
      { name: "Storytelling", percentage: 55 },
      { name: "Personality", percentage: 45 },
    ],
  },
];

const platforms = [
  {
    platform: "Instagram",
    formats: ["Reels", "Carousels", "Story Sequences", "Static Posts"],
  },
  {
    platform: "YouTube",
    formats: ["Long Form", "Shorts", "Live / Streams"],
  },
  {
    platform: "Twitter / X",
    formats: ["Threads", "Long Form", "Media / Clips"],
  },
  {
    platform: "LinkedIn",
    formats: ["Carousels / PDFs", "Short Video", "Live"],
  },
  {
    platform: "TikTok",
    formats: ["Short Video", "Photo Mode", "Live"],
  },
];

const hooks = [
  { hook: "Client Win: 0 to $20K", retention: 71.0 },
  { hook: "The $50K Month Breakdown", retention: 61.8 },
  { hook: "Why Your Content Isn't Converting", retention: 58.4 },
  { hook: "The Content Strategy We Used", retention: 54.7 },
];

const performance = [
  { date: "Aug 1", views: 42, reach: 32, interactions: 12 },
  { date: "Aug 4", views: 58, reach: 45, interactions: 17 },
  { date: "Aug 7", views: 64, reach: 51, interactions: 21 },
  { date: "Aug 10", views: 52, reach: 43, interactions: 19 },
  { date: "Aug 13", views: 73, reach: 59, interactions: 28 },
  { date: "Aug 16", views: 81, reach: 66, interactions: 31 },
  { date: "Aug 19", views: 76, reach: 62, interactions: 29 },
  { date: "Aug 22", views: 94, reach: 78, interactions: 38 },
];

const heatmap = [
  { pillar: "Educational", variation: "Value", value: 35 },
  { pillar: "Educational", variation: "Problem-Solution", value: 65 },
  { pillar: "Credibility", variation: "Testimonial", value: 30 },
  { pillar: "Credibility", variation: "Case-Study", value: 70 },
  { pillar: "Authoritative", variation: "Attention Driven", value: 42 },
  { pillar: "Authoritative", variation: "Industry Leader", value: 58 },
  { pillar: "Relatability", variation: "Storytelling", value: 55 },
  { pillar: "Relatability", variation: "Personality", value: 45 },
];

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={[
        "w-full rounded-xl border border-gray-800",
        "bg-gray-900/50",
        "shadow-[0_0_40px_rgba(0,0,0,0.18)]",
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}

function SankeyPath({
  source,
  target,
  sourceWidth,
  targetWidth,
  color,
  opacity = 0.42,
  active = false,
  onEnter,
  onLeave,
}: FlowLink & {
  active?: boolean;
  onEnter?: () => void;
  onLeave?: () => void;
}) {
  const [sx, sy] = source;
  const [tx, ty] = target;

  const curve = Math.max(90, (tx - sx) * 0.42);

  const path = `
    M ${sx} ${sy - sourceWidth / 2}
    C ${sx + curve} ${sy - sourceWidth / 2},
      ${tx - curve} ${ty - targetWidth / 2},
      ${tx} ${ty - targetWidth / 2}
    L ${tx} ${ty + targetWidth / 2}
    C ${tx - curve} ${ty + targetWidth / 2},
      ${sx + curve} ${sy + sourceWidth / 2},
      ${sx} ${sy + sourceWidth / 2}
    Z
  `;

  return (
    <path
      d={path}
      fill={color}
      fillOpacity={active ? Math.min(0.9, opacity + 0.34) : opacity}
      stroke={color}
      strokeOpacity={active ? 1 : opacity * 0.55}
      strokeWidth={active ? "2.5" : "1"}
      style={{ cursor: "pointer", filter: active ? `drop-shadow(0 0 8px ${color})` : undefined }}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    />
  );
}

function SankeyDiagram() {
  const width = 1100;
  const height = 600;

  const columnX = {
    pillar: 30,
    variation: 240,
    platform: 490,
    leads: 805,
    cash: 1015,
  };

  const pillarNodes: FlowNode[] = pillars.map((pillar, index) => ({
    label: pillar.name,
    x: columnX.pillar,
    y: 90 + index * 120,
    width: 112,
    height: 42,
    color: pillar.color,
  }));

  const variationNodes: FlowNode[] = pillars.flatMap((pillar, pillarIndex) =>
    pillar.variations.map((variation, variationIndex) => ({
      label: variation.name,
      x: columnX.variation,
      y: 55 + pillarIndex * 135 + variationIndex * 62,
      width: 128,
      height: 34,
      color: pillar.color,
    })),
  );

  const platformRows = platforms.flatMap((group) =>
    group.formats.map((format) => ({
      platform: group.platform,
      format,
    })),
  );

  const platformNodes: FlowNode[] = platformRows.map((item, index) => ({
    label: `${item.platform} · ${item.format}`,
    x: columnX.platform,
    y: 25 + index * 39,
    width: 195,
    height: 27,
    color:
      item.platform === "Instagram"
        ? "#38bdf8"
        : item.platform === "YouTube"
          ? "#a855f7"
          : item.platform === "Twitter / X"
            ? "#c084fc"
            : item.platform === "LinkedIn"
              ? "#60a5fa"
              : "#ec4899",
  }));

  const links: FlowLink[] = [];

  // Pillars -> variations
  pillarNodes.forEach((pillarNode, pillarIndex) => {
    const corresponding = variationNodes.slice(pillarIndex * 2, pillarIndex * 2 + 2);

    corresponding.forEach((variationNode, variationIndex) => {
      links.push({
        source: [pillarNode.x + pillarNode.width, pillarNode.y + pillarNode.height / 2],
        target: [variationNode.x, variationNode.y + variationNode.height / 2],
        sourceWidth: 15,
        targetWidth: 15,
        color: pillarNode.color,
        opacity: 0.46,
      });
    });
  });

  // Variations -> platform taxonomy
  variationNodes.forEach((variationNode, index) => {
    const targetStart = Math.floor((index / variationNodes.length) * platformNodes.length);

    const firstTarget = platformNodes[targetStart % platformNodes.length];

    links.push({
      source: [variationNode.x + variationNode.width, variationNode.y + variationNode.height / 2],
      target: [firstTarget.x, firstTarget.y + firstTarget.height / 2],
      sourceWidth: 11,
      targetWidth: 9,
      color: variationNode.color,
      opacity: 0.25,
    });

    const secondIndex = (targetStart + 1 + (index % 3)) % platformNodes.length;
    const secondTarget = platformNodes[secondIndex];

    links.push({
      source: [variationNode.x + variationNode.width, variationNode.y + variationNode.height / 2],
      target: [secondTarget.x, secondTarget.y + secondTarget.height / 2],
      sourceWidth: 8,
      targetWidth: 7,
      color: variationNode.color,
      opacity: 0.16,
    });
  });

  const leadsNode = {
    x: columnX.leads,
    y: height / 2 - 42,
    width: 110,
    height: 84,
  };

  const cashNode = {
    x: columnX.cash,
    y: height / 2 - 48,
    width: 72,
    height: 96,
  };

  platformNodes.forEach((node, index) => {
    links.push({
      source: [node.x + node.width, node.y + node.height / 2],
      target: [leadsNode.x, leadsNode.y + leadsNode.height / 2],
      sourceWidth: index % 3 === 0 ? 11 : 8,
      targetWidth: index % 3 === 0 ? 9 : 6,
      color: node.color,
      opacity: 0.18,
    });
  });

  links.push({
    source: [leadsNode.x + leadsNode.width, leadsNode.y + leadsNode.height / 2],
    target: [cashNode.x, cashNode.y + cashNode.height / 2],
    sourceWidth: 36,
    targetWidth: 36,
    color: "#ec4899",
    opacity: 0.56,
    metadata: {
      pillar: "All content",
      format: "Leads → Cash",
      conversionRate: "17.4%",
      leads: "46",
      revenue: "$42,500",
    },
  });

  const interactiveLinks = links.map((link, index) => ({
    ...link,
    metadata: link.metadata ?? {
      pillar:
        index < 8
          ? (pillars[Math.floor(index / 2)]?.name ?? "Content")
          : index < 24
            ? (pillars[Math.floor((index - 8) / 4)]?.name ?? "Content")
            : "Distribution",
      format:
        index < 8
          ? (variationNodes[Math.floor(index / 2)]?.label ?? "Variation")
          : index < 24
            ? (platformNodes[Math.floor((index - 8) / 2)]?.label ?? "Platform")
            : "Platform → Leads",
      conversionRate: index < 24 ? "65.0%" : index < links.length - 1 ? "2.8%" : "17.4%",
      leads: index >= 24 ? "46" : "—",
      revenue: index === links.length - 1 ? "$42,500" : "—",
    },
  }));

  const [hoveredLink, setHoveredLink] = useState<number | null>(null);
  const hovered = hoveredLink == null ? null : interactiveLinks[hoveredLink];

  return (
    <div className="w-full overflow-hidden rounded-xl border border-gray-800 bg-[#08090d]">
      <div className="flex items-center justify-between border-b border-gray-800 px-5 py-4">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-100">
            Content → Platform → Cash Flow
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            Five-stage content attribution and conversion architecture
          </p>
        </div>

        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-slate-500">
          <span className="h-2 w-2 rounded-full bg-cyan-400" />
          Reach
          <span className="h-2 w-2 rounded-full bg-purple-500" />
          Conversion
          <span className="h-2 w-2 rounded-full bg-pink-500" />
          Revenue
        </div>
      </div>

      <div className="relative w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-[600px] min-w-[1050px] w-full"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <filter id="neonGlow">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            <linearGradient id="cashGradient" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor="#8b5cf6" />
              <stop offset="100%" stopColor="#ec4899" />
            </linearGradient>
          </defs>

          {interactiveLinks.map((link, index) => (
            <SankeyPath
              key={index}
              {...link}
              active={hoveredLink === index}
              onEnter={() => setHoveredLink(index)}
              onLeave={() => setHoveredLink(null)}
            />
          ))}

          {/* Pillar nodes */}
          {pillarNodes.map((node) => (
            <g key={node.label}>
              <rect
                x={node.x}
                y={node.y}
                width={node.width}
                height={node.height}
                rx="10"
                fill="#10131a"
                stroke={node.color}
                strokeOpacity="0.45"
              />
              <circle
                cx={node.x + 14}
                cy={node.y + node.height / 2}
                r="3"
                fill={node.color}
                filter="url(#neonGlow)"
              />
              <text x={node.x + 25} y={node.y + 26} fill="#f8fafc" fontSize="12" fontWeight="600">
                {node.label}
              </text>
            </g>
          ))}

          {/* Variation nodes */}
          {variationNodes.map((node) => (
            <g key={node.label}>
              <rect
                x={node.x}
                y={node.y}
                width={node.width}
                height={node.height}
                rx="8"
                fill="#0d1017"
                stroke={node.color}
                strokeOpacity="0.3"
              />
              <text x={node.x + 12} y={node.y + 21} fill="#cbd5e1" fontSize="10" fontWeight="500">
                {node.label.length > 21 ? `${node.label.slice(0, 20)}…` : node.label}
              </text>
            </g>
          ))}

          {/* Platform / format nodes */}
          {platformNodes.map((node) => (
            <g key={node.label}>
              <rect
                x={node.x}
                y={node.y}
                width={node.width}
                height={node.height}
                rx="7"
                fill="#0a0d13"
                stroke={node.color}
                strokeOpacity="0.2"
              />
              <circle cx={node.x + 10} cy={node.y + node.height / 2} r="2.5" fill={node.color} />
              <text x={node.x + 19} y={node.y + 17} fill="#94a3b8" fontSize="9">
                {node.label}
              </text>
            </g>
          ))}

          {/* Leads node */}
          <g>
            <rect
              x={leadsNode.x}
              y={leadsNode.y}
              width={leadsNode.width}
              height={leadsNode.height}
              rx="14"
              fill="#13111b"
              stroke="#a855f7"
              strokeWidth="1.5"
              filter="url(#neonGlow)"
            />
            <text
              x={leadsNode.x + leadsNode.width / 2}
              y={leadsNode.y + 36}
              textAnchor="middle"
              fill="#c084fc"
              fontSize="10"
              fontWeight="700"
              letterSpacing="2"
            >
              LEADS
            </text>
            <text
              x={leadsNode.x + leadsNode.width / 2}
              y={leadsNode.y + 57}
              textAnchor="middle"
              fill="#f8fafc"
              fontSize="18"
              fontWeight="700"
            >
              FLOW
            </text>
          </g>

          {/* Cash node */}
          <g>
            <rect
              x={cashNode.x}
              y={cashNode.y}
              width={cashNode.width}
              height={cashNode.height}
              rx="14"
              fill="url(#cashGradient)"
              fillOpacity="0.16"
              stroke="#ec4899"
              strokeWidth="1.5"
              filter="url(#neonGlow)"
            />
            <text
              x={cashNode.x + cashNode.width / 2}
              y={cashNode.y + 42}
              textAnchor="middle"
              fill="#f9a8d4"
              fontSize="9"
              fontWeight="700"
              letterSpacing="1.4"
            >
              CASH
            </text>
            <text
              x={cashNode.x + cashNode.width / 2}
              y={cashNode.y + 58}
              textAnchor="middle"
              fill="#ffffff"
              fontSize="9"
              fontWeight="700"
              letterSpacing="1.4"
            >
              COLLECTED
            </text>
          </g>
        </svg>
        {hovered?.metadata && (
          <div
            className="pointer-events-none absolute z-10 w-56 rounded-xl border border-slate-700/80 bg-slate-950/95 p-3 text-xs text-slate-100 shadow-2xl shadow-black/50 backdrop-blur"
            style={{
              left: `${Math.min(78, Math.max(2, (hovered.target[0] / width) * 100 - 7))}%`,
              top: `${Math.min(78, Math.max(3, (hovered.target[1] / height) * 100 - 8))}%`,
            }}
          >
            <div className="mb-2 flex items-center justify-between gap-2 border-b border-slate-800 pb-2">
              <span className="font-semibold uppercase tracking-[0.12em] text-slate-400">
                Attribution path
              </span>
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: hovered.color }} />
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">Pillar</span>
                <span className="text-right font-medium">{hovered.metadata.pillar}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">Platform / format</span>
                <span className="max-w-[125px] text-right font-medium">
                  {hovered.metadata.format}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">Conversion</span>
                <span className="font-mono text-cyan-300">{hovered.metadata.conversionRate}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">Leads</span>
                <span className="font-mono text-purple-300">{hovered.metadata.leads}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">Revenue</span>
                <span className="font-mono text-pink-300">{hovered.metadata.revenue}</span>
                {hovered.metadata.coverage && (
                  <>
                    <span className="text-slate-500">Attribution</span>
                    <span className="font-mono text-cyan-300">
                      {hovered.metadata.coverage} · {hovered.metadata.strength ?? "unknown"}
                    </span>
                  </>
                )}
                {hovered.metadata.knownTouchpoints != null && (
                  <>
                    <span className="text-slate-500">Touchpoints</span>
                    <span className="font-mono text-slate-200">
                      {hovered.metadata.knownTouchpoints}
                    </span>
                  </>
                )}
                {hovered.metadata.sampleWarning && (
                  <div className="col-span-2 mt-1 text-amber-300">
                    {hovered.metadata.sampleWarning}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MechanismTaxonomy() {
  return (
    <Card className="p-5">
      <div className="mb-5 flex items-start justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Intelligence
          </div>
          <h3 className="mt-1 text-sm font-semibold text-slate-100">
            Mechanism & Variation Taxonomy
          </h3>
        </div>

        <span className="rounded-full border border-purple-500/20 bg-purple-500/10 px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-purple-300">
          4 pillars
        </span>
      </div>

      <div className="space-y-5">
        {pillars.map((pillar) => (
          <div key={pillar.name}>
            <div className="mb-2 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: pillar.color }} />
              <span className="text-xs font-semibold text-slate-200">{pillar.name}</span>
            </div>

            <div className="space-y-2 pl-4">
              {pillar.variations.map((variation) => (
                <div key={variation.name} className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-500">{variation.name}</span>
                  <span className="text-[11px] font-semibold" style={{ color: pillar.color }}>
                    {variation.percentage}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function TopHooks() {
  return (
    <Card className="p-5">
      <div className="mb-5">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          Creative Quality
        </div>
        <h3 className="mt-1 text-sm font-semibold text-slate-100">Top Hooks by Retention</h3>
      </div>

      <div className="space-y-4">
        {hooks.map((item, index) => (
          <div
            key={item.hook}
            className="flex items-center gap-3 border-b border-gray-800/70 pb-3 last:border-0 last:pb-0"
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.03] text-[10px] font-semibold text-slate-500">
              0{index + 1}
            </div>

            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium text-slate-200">{item.hook}</div>

              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-purple-500 to-pink-500"
                  style={{ width: `${item.retention}%` }}
                />
              </div>
            </div>

            <div className="shrink-0 text-sm font-semibold text-pink-400">
              {item.retention.toFixed(1)}%
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function MechanismVariationHeatmap() {
  const intensity = (value: number) => {
    if (value >= 65) return "bg-fuchsia-500";
    if (value >= 55) return "bg-purple-500";
    if (value >= 45) return "bg-purple-700";
    if (value >= 35) return "bg-purple-900";
    return "bg-slate-800";
  };

  return (
    <Card className="p-5">
      <div className="mb-5">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          Creative Intelligence
        </div>
        <h3 className="mt-1 text-sm font-semibold text-slate-100">Mechanism × Variation Heatmap</h3>
      </div>

      <div className="grid grid-cols-[1.1fr_1fr_1fr] gap-2 text-[10px]">
        <div />
        <div className="text-center text-slate-500">Variation A</div>
        <div className="text-center text-slate-500">Variation B</div>

        {pillars.map((pillar) => {
          const rows = heatmap.filter((item) => item.pillar === pillar.name);

          return (
            <React.Fragment key={pillar.name}>
              <div className="flex items-center text-xs text-slate-300">{pillar.name}</div>

              {rows.map((item) => (
                <div
                  key={`${item.pillar}-${item.variation}`}
                  className={`group relative flex min-h-[62px] items-center justify-center rounded-lg border border-white/5 ${intensity(
                    item.value,
                  )}`}
                >
                  <div className="text-center text-sm font-bold text-white">{item.value}</div>

                  <div className="absolute inset-x-2 bottom-1 hidden truncate text-center text-[8px] text-white/65 group-hover:block">
                    {item.variation}
                  </div>
                </div>
              ))}
            </React.Fragment>
          );
        })}
      </div>

      <div className="mt-5">
        <div className="mb-2 flex justify-between text-[9px] uppercase tracking-wider text-slate-600">
          <span>Low</span>
          <span>High performance</span>
        </div>

        <div className="h-2 rounded-full bg-gradient-to-r from-slate-800 via-purple-700 to-fuchsia-500" />
      </div>
    </Card>
  );
}

export function ContentCommandCenter({ pieces, demand, weekly, canonicalPaths = [] }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("views");
  const [selectedPath, setSelectedPath] = useState<CanonicalLifecycleAttributionPath | null>(null);
  const [pathFilters, setPathFilters] = useState({
    platform: "all",
    campaign: "all",
    source: "all",
    content: "all",
  });
  const filteredCanonicalPaths = useMemo(
    () =>
      canonicalPaths.filter((path) => {
        const matches = (filter: string, value: string | null) =>
          filter === "all" || value === filter;
        return (
          matches(pathFilters.platform, path.platform) &&
          matches(pathFilters.campaign, path.campaign) &&
          matches(pathFilters.source, path.source) &&
          matches(pathFilters.content, path.contentId)
        );
      }),
    [canonicalPaths, pathFilters],
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
          <div className="text-3xs text-muted-foreground">
            {filteredCanonicalPaths.length} path{filteredCanonicalPaths.length === 1 ? "" : "s"} ·
            no inferred revenue
          </div>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-4">
          {(["platform", "campaign", "source", "content"] as const).map((key) => {
            const sourceKey = key === "content" ? "contentId" : key;
            const values = Array.from(
              new Set(canonicalPaths.map((path) => path[sourceKey]).filter(Boolean)),
            ) as string[];
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
                                <span>{platformFor(piece.platform)}</span>
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
                                <span>{platformFor(piece.platform)}</span>
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

      <div className="border-t border-border/70 pt-5">
        <div className="mb-4 mt-8 text-sm font-bold uppercase tracking-[0.16em] text-foreground first:mt-0">
          Level 3 · Content-to-cash attribution
        </div>
        <div className="grid w-full grid-cols-12 items-start gap-6">
          <div className="col-span-12 min-w-0 xl:col-span-8">
            <SankeyDiagram />
          </div>
          <div className="col-span-12 min-w-0 xl:col-span-4">
            <div className="flex w-full flex-col gap-6">
              <MechanismTaxonomy />
              <TopHooks />
              <MechanismVariationHeatmap />
            </div>
          </div>
        </div>
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
