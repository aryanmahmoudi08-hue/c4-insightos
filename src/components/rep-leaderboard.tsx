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
import { useTheme } from "@/hooks/use-theme";

type PodiumStyle = {
  row: string;
  /** Inset border framing the row itself — a darker shade of the row's own
   * hue (not a generic neutral), so it reads as an edge/bevel on that
   * specific piece of metal rather than a generic card outline. */
  border: string;
  badge: string;
  /** Dark, per-medal text/track tones — the row fill is now a fixed bright
   * metal regardless of page theme, so podium-row text/line/track needs its
   * own fixed dark treatment too (not the page's usual theme-conditional
   * white/foreground), matched to each metal's own hue for a cohesive look. */
  text: string;
  line: string;
  ring: string;
  track: string;
};

/** Podium treatment for the top 3 rows — a distinct, universally-understood
 * "medal" language (gold/silver/bronze), separate from the spectrum system's
 * funnel-position colors used elsewhere on the row. One fixed set of colors
 * for both dark and light mode — a literal, saturated gold/iron/bronze reads
 * the same regardless of the surrounding page theme, the way an actual medal
 * would. Each row is a multi-band linear gradient (alternating highlight/
 * shadow stops at a fixed hue), not a flat 3-stop fade — that's what gives it
 * a brushed-metal/foil texture instead of a flat color wash. Gold and bronze
 * sit 40+ hue-degrees apart so they never read as the same color; silver is
 * zero-chroma (pure gray/iron) since any chroma on a cool hue reads as violet
 * next to this app's violet-tinted surfaces. The badge is a simpler, glossier
 * 3-stop version of the same hue — the coin itself, distinct from the
 * brushed-foil row it sits on. */
const PODIUM_STYLE: PodiumStyle[] = [
  {
    // Gold
    row: "linear-gradient(100deg, oklch(0.58 0.15 87) 0%, oklch(0.9 0.11 92) 9%, oklch(0.62 0.16 86) 20%, oklch(0.85 0.13 90) 32%, oklch(0.6 0.16 85) 46%, oklch(0.88 0.12 91) 60%, oklch(0.63 0.15 86) 74%, oklch(0.82 0.13 89) 88%, oklch(0.65 0.15 85) 100%)",
    border: "inset 0 0 0 2.5px oklch(0.4 0.15 84 / 75%)",
    badge:
      "radial-gradient(120% 140% at 20% 15%, oklch(1 0.03 96 / 85%), transparent 45%), linear-gradient(135deg, oklch(0.95 0.09 93) 0%, oklch(0.84 0.15 85) 45%, oklch(0.66 0.16 75) 100%)",
    text: "text-[oklch(0.24_0.06_70)]",
    line: "bg-[oklch(0.24_0.06_70)]",
    ring: "0 0 0 1px oklch(0.55 0.15 78 / 35%), 0 6px 14px -8px oklch(0.5 0.16 76 / 30%)",
    track: "bg-black/15",
  },
  {
    // Silver / iron — zero chroma on purpose, see comment above.
    row: "linear-gradient(100deg, oklch(0.68 0 0) 0%, oklch(0.95 0 0) 9%, oklch(0.72 0 0) 20%, oklch(0.92 0 0) 32%, oklch(0.7 0 0) 46%, oklch(0.94 0 0) 60%, oklch(0.73 0 0) 74%, oklch(0.9 0 0) 88%, oklch(0.75 0 0) 100%)",
    border: "inset 0 0 0 2.5px oklch(0.42 0 0 / 75%)",
    badge:
      "radial-gradient(120% 140% at 20% 15%, oklch(1 0 0 / 85%), transparent 45%), linear-gradient(135deg, oklch(0.97 0 0) 0%, oklch(0.86 0 0) 45%, oklch(0.66 0 0) 100%)",
    text: "text-[oklch(0.24_0_0)]",
    line: "bg-[oklch(0.24_0_0)]",
    ring: "0 0 0 1px oklch(0.55 0 0 / 30%), 0 6px 14px -8px oklch(0.45 0 0 / 25%)",
    track: "bg-black/15",
  },
  {
    // Bronze — hue kept well clear of gold's ~85-92 band, green channel near
    // zero throughout (a pure red-copper) so it never reads as dark gold.
    row: "linear-gradient(100deg, oklch(0.48 0.16 42) 0%, oklch(0.78 0.12 48) 9%, oklch(0.52 0.17 41) 20%, oklch(0.74 0.13 46) 32%, oklch(0.5 0.17 40) 46%, oklch(0.76 0.12 47) 60%, oklch(0.53 0.16 41) 74%, oklch(0.7 0.12 45) 88%, oklch(0.55 0.16 40) 100%)",
    border: "inset 0 0 0 2.5px oklch(0.3 0.15 40 / 75%)",
    badge:
      "radial-gradient(120% 140% at 20% 15%, oklch(0.97 0.05 60 / 75%), transparent 45%), linear-gradient(135deg, oklch(0.83 0.12 55) 0%, oklch(0.7 0.15 46) 45%, oklch(0.5 0.13 39) 100%)",
    text: "text-[oklch(0.2_0.04_40)]",
    line: "bg-[oklch(0.2_0.04_40)]",
    ring: "0 0 0 1px oklch(0.5 0.13 45 / 35%), 0 6px 14px -8px oklch(0.45 0.13 42 / 30%)",
    track: "bg-black/15",
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
  const { theme } = useTheme();

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
          const isDark = theme !== "light";
          // Dark mode: always white text/line, on every row — even the
          // brushed-gold/silver/bronze podium rows (a fixed bright fill now,
          // same in both themes). Light mode keeps each podium row's own
          // dark, per-medal text/line (needed for contrast against that same
          // bright fill there); non-podium rows use the page's usual dark
          // foreground text.
          const rowText = isDark ? "text-white" : podium ? podium.text : "text-foreground";
          const rowLine = isDark ? "bg-white" : podium ? podium.line : "bg-foreground/55";
          const rowSecondary = isDark
            ? "text-white/70"
            : podium
              ? `${podium.text} opacity-70`
              : "text-muted-foreground";
          return (
            <motion.div
              key={p.name}
              layout
              transition={SPRING.bouncy}
              className="hover-lift flex items-center gap-3 px-4 py-2.5"
              style={podium ? { background: podium.row, boxShadow: podium.border } : undefined}
            >
              <div
                className={`grid h-6 w-6 shrink-0 place-items-center rounded-md text-3xs font-sans tabular-nums font-bold ${
                  podium ? podium.text : "bg-muted text-muted-foreground"
                }`}
                style={podium ? { background: podium.badge, boxShadow: podium.ring } : undefined}
              >
                {i + 1}
              </div>
              <AvatarInitials name={p.name} size="sm" />
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-medium truncate ${rowText}`}>{p.name}</div>
                <div
                  className={`mt-1 h-1.5 w-full rounded overflow-hidden ${podium ? podium.track : "bg-muted/40"}`}
                >
                  <motion.div
                    className={`h-full rounded ${rowLine}`}
                    initial={false}
                    animate={{ width: `${Math.min(100, (metric.rankBy(p) / maxVal) * 100)}%` }}
                    transition={SPRING.gentle}
                  />
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className={`font-sans tabular-nums text-sm font-semibold ${rowText}`}>
                  {metric.primary(p)}
                </div>
                <div className={`text-3xs ${rowSecondary}`}>{metric.secondary(p)}</div>
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
