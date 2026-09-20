import { motion } from "motion/react";
import { Trophy, X } from "lucide-react";
import { AvatarInitials } from "@/components/ui/avatar-initials";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DateRangePicker, type DateRange } from "@/components/date-range-picker";
import { SPRING } from "@/lib/motion-tokens";
import { type SpectrumPosition } from "@/lib/spectrum";

type PodiumStyle = {
  /** The row's ONLY colored surface — a thin medal-colored outline. The
   * fill stays the page's own plain card background (no tint, no gradient)
   * in both themes, so a podium row reads as a normal row with a colored
   * frame around it, not a colored block. */
  border: string;
  /** The coin/badge behind the rank number — unchanged shiny medal gradient. */
  badge: string;
  /** Dark text color for the number INSIDE the badge (contrast against the
   * badge's own bright fill) — unrelated to the row, which uses the page's
   * normal foreground text since its fill is neutral now. */
  badgeText: string;
  ring: string;
};

/** Podium treatment for the top 3 rows — gold/silver/bronze, fixed for both
 * themes (a literal medal color should read the same regardless of page
 * theme). The rank BADGE (the small numbered coin) keeps its original
 * shiny medal-foil gradient, unchanged. The ROW itself is now just a plain
 * row (page's normal card background, normal foreground text) framed by a
 * thin medal-colored border — no fill, no gradient on the row surface. */
const PODIUM_STYLE: PodiumStyle[] = [
  {
    // 1st — gold
    border: "oklch(0.74 0.13 85)",
    badge:
      "radial-gradient(120% 140% at 20% 15%, oklch(1 0.03 96 / 85%), transparent 45%), linear-gradient(135deg, oklch(0.95 0.09 93) 0%, oklch(0.84 0.15 85) 45%, oklch(0.66 0.16 75) 100%)",
    badgeText: "text-[oklch(0.24_0.06_70)]",
    ring: "0 0 0 1px oklch(0.55 0.15 78 / 35%), 0 6px 14px -8px oklch(0.5 0.16 76 / 30%)",
  },
  {
    // 2nd — silver / iron, zero chroma on purpose (any chroma on a cool
    // hue here reads as violet next to this app's violet-tinted surfaces).
    border: "oklch(0.76 0 0)",
    badge:
      "radial-gradient(120% 140% at 20% 15%, oklch(1 0 0 / 85%), transparent 45%), linear-gradient(135deg, oklch(0.97 0 0) 0%, oklch(0.86 0 0) 45%, oklch(0.66 0 0) 100%)",
    badgeText: "text-[oklch(0.24_0_0)]",
    ring: "0 0 0 1px oklch(0.55 0 0 / 30%), 0 6px 14px -8px oklch(0.45 0 0 / 25%)",
  },
  {
    // 3rd — bronze, hue kept well clear of gold's ~85-92 band so it never
    // reads as dark gold.
    border: "oklch(0.6 0.13 45)",
    badge:
      "radial-gradient(120% 140% at 20% 15%, oklch(0.97 0.05 60 / 75%), transparent 45%), linear-gradient(135deg, oklch(0.83 0.12 55) 0%, oklch(0.7 0.15 46) 45%, oklch(0.5 0.13 39) 100%)",
    badgeText: "text-[oklch(0.2_0.04_40)]",
    ring: "0 0 0 1px oklch(0.5 0.13 45 / 35%), 0 6px 14px -8px oklch(0.45 0.13 42 / 30%)",
  },
];

export interface RepMetricOption<P> {
  key: string;
  label: string;
  /** Funnel position (B4) — drives the value color and progress-bar fill for this metric. */
  spectrum: SpectrumPosition;
  primary: (p: P) => string;
  secondary: (p: P) => string;
  rankBy: (p: P) => number;
}

interface RepLeaderboardProps<P extends { name: string }> {
  titlePrefix: string;
  metrics: RepMetricOption<P>[];
  metricKey: string;
  onMetricChange: (key: string) => void;
  people: P[];
  emptyLabel: string;
  dateRange: DateRange;
  onDateRangeChange: (r: DateRange) => void;
  overridden: boolean;
  onResetRange: () => void;
}

/**
 * Shared rep leaderboard (Part C3) — Closer, DM Setter, and Inbound Dialer all
 * render this same component with role-specific metric option lists. Rank,
 * primary figure, progress bar color, and secondary line all follow the
 * selected metric; rows spring-reorder (B5 signature moment) via `layout`.
 * The date range is independent of the page range by default (inherits it
 * until the caller passes an override), with a clear "Custom range" indicator.
 */
export function RepLeaderboard<P extends { name: string }>({
  titlePrefix,
  metrics,
  metricKey,
  onMetricChange,
  people,
  emptyLabel,
  dateRange,
  onDateRangeChange,
  overridden,
  onResetRange,
}: RepLeaderboardProps<P>) {
  const metric = metrics.find((m) => m.key === metricKey) ?? metrics[0];
  const sorted = [...people].sort((a, b) => metric.rankBy(b) - metric.rankBy(a)).slice(0, 6);
  const maxVal = Math.max(1, ...sorted.map(metric.rankBy));

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="border-b border-border bg-muted/30 px-4 py-2.5 space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider">
            <Trophy className="h-3.5 w-3.5 text-[color:var(--color-success)]" />
            {titlePrefix} · by {metric.label}
          </div>
          <Select value={metricKey} onValueChange={onMetricChange}>
            <SelectTrigger className="h-7 w-[172px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {metrics.map((m) => (
                <SelectItem key={m.key} value={m.key}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <DateRangePicker value={dateRange} onChange={onDateRangeChange} />
          {overridden && (
            <button
              type="button"
              onClick={onResetRange}
              className="flex items-center gap-1 rounded-full bg-spectrum-mid/15 px-2 py-0.5 text-3xs font-medium text-spectrum-mid transition-colors hover:bg-spectrum-mid/25"
            >
              Custom range <X className="h-2.5 w-2.5" />
            </button>
          )}
        </div>
      </div>
      <div className="divide-y divide-border">
        {sorted.map((p, i) => {
          const podium = PODIUM_STYLE[i];
          return (
            <motion.div
              key={p.name}
              layout
              transition={SPRING.bouncy}
              className={`hover-lift flex items-center gap-3 px-4 py-2.5 ${
                podium ? "mx-2 my-1.5 rounded-lg border-[1.5px]" : ""
              }`}
              style={podium ? { borderColor: podium.border } : undefined}
            >
              <div
                className={`grid h-6 w-6 shrink-0 place-items-center rounded-md text-3xs font-sans tabular-nums font-bold ${
                  podium ? podium.badgeText : "bg-muted text-muted-foreground"
                }`}
                style={podium ? { background: podium.badge, boxShadow: podium.ring } : undefined}
              >
                {i + 1}
              </div>
              <AvatarInitials name={p.name} size="sm" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate text-foreground">{p.name}</div>
                <div className="mt-1 h-1.5 w-full rounded overflow-hidden bg-muted/40">
                  <motion.div
                    className="h-full rounded bg-foreground"
                    initial={false}
                    animate={{ width: `${Math.min(100, (metric.rankBy(p) / maxVal) * 100)}%` }}
                    transition={SPRING.gentle}
                  />
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-sans tabular-nums text-sm font-semibold text-foreground">
                  {metric.primary(p)}
                </div>
                <div className="text-3xs text-muted-foreground">{metric.secondary(p)}</div>
              </div>
            </motion.div>
          );
        })}
        {sorted.length === 0 && (
          <div className="p-8 text-center text-xs text-muted-foreground">{emptyLabel}</div>
        )}
      </div>
    </div>
  );
}
