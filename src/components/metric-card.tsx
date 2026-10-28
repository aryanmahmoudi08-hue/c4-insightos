import { DemoEditableValue } from "@/components/demo-editable-value";
import type { CSSProperties, ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { InteractiveSparkline } from "@/components/interactive-sparkline";
import { useCountUp } from "@/hooks/use-count-up";
import { metricIconFor } from "@/lib/metric-icons";
import {
  SPECTRUM_VAR,
  type SpectrumPosition,
  type KpiEmphasis,
  kpiGradient,
  kpiGradientBorder,
} from "@/lib/spectrum";

type Tone = "default" | "success" | "warning" | "destructive" | "accent";

const TONE_TEXT: Record<Tone, string> = {
  default: "text-foreground",
  success: "text-[color:var(--color-success)]",
  warning: "text-[color:var(--color-warning)]",
  destructive: "text-destructive",
  accent: "text-accent",
};

// Gradient KPI cards derive their color from whichever of `accentColor`/
// `spectrum`/`tone` the card already passes (in that priority — same
// priority `accent` below already uses) — no separate color prop to keep in
// sync. "default" tone has no real semantic hue, so `emphasis` on a card
// with none of the three set is a deliberate no-op, not an arbitrary color.
const TONE_TO_VAR: Partial<Record<Tone, string>> = {
  success: "var(--success)",
  warning: "var(--warning)",
  destructive: "var(--destructive)",
  accent: "var(--accent)",
};

/**
 * Canonical InsightOS metric tile — the single visual source of truth for
 * every KPI surface in the app (StatCard -> KpiCard -> here, KpiBand ->
 * KpiCard -> here).
 *
 * Anatomy, as of the 2026-10 revamp:
 *
 *   ┌──────────────────────────────────────┐
 *   │ [◆]  LABEL                   ↑ 12%   │   chip + label  ·  delta pill
 *   │                                      │
 *   │  $58,800                             │   the figure
 *   │  vs $52,400 prior                    │   supporting line
 *   │ ╱‾╲____________________________╱‾╲   │   full-bleed series
 *   └──────────────────────────────────────┘
 *
 * Three deliberate choices:
 *  - the accent lives in the icon chip and the series, never in the figure
 *    itself, so a row of cards is scannable by colour without any number
 *    being tinted into meaning it doesn't have;
 *  - the series bleeds to all three edges rather than sitting in an inset
 *    box, which is what stops a dense grid reading as cards-inside-cards;
 *  - a tile with no daily series gets a flat accent rule on its bottom edge
 *    instead of a plotted line. The rule carries no value — it keeps the
 *    row's rhythm without inventing a shape for data that doesn't exist.
 *    The "no daily series" caption stays, so the absence is still stated.
 *
 * `emphasis` opts a card into the gradient-KPI-card treatment ("subtle" or
 * "strong" — see kpiGradient() in spectrum.ts) instead of the plain --card
 * surface every card uses by default. It derives its color from whichever
 * of `spectrum`/`tone` the card already passes, so there's no second color
 * prop to keep in sync — omit it (the default) and nothing changes. Reserve
 * it for the 1-3 genuinely top-tier metrics on a page; the scarcity is what
 * makes a colored card read as important.
 */
export function MetricCard({
  label,
  value,
  subLabel,
  supporting,
  icon,
  tone = "default",
  spectrum,
  accentColor,
  emphasis,
  deltaPct,
  trend,
  spark,
  sparkLabels,
  sparkVariant = "line",
  chart,
  numericValue,
  format,
  unavailable = false,
  onClick,
  className,
}: {
  label: string;
  value: ReactNode;
  subLabel?: ReactNode;
  supporting?: ReactNode;
  icon?: ReactNode;
  tone?: Tone;
  spectrum?: SpectrumPosition;
  accentColor?: string;
  emphasis?: KpiEmphasis;
  deltaPct?: number;
  trend?: ReactNode;
  spark?: number[];
  sparkLabels?: string[];
  sparkVariant?: "line" | "bar";
  chart?: ReactNode;
  numericValue?: number;
  format?: (n: number) => string;
  /** `value` is an unavailable-state phrase ("Not tracked"), not a figure —
   * renders it at status scale so an absence of data doesn't out-shout the
   * real numbers beside it, and keeps the card the same height as its row. */
  unavailable?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const hasDelta = deltaPct !== undefined && Number.isFinite(deltaPct);
  const up = hasDelta && deltaPct > 0.5;
  const down = hasDelta && deltaPct < -0.5;
  const DeltaIcon = up ? ArrowUpRight : down ? ArrowDownRight : Minus;
  const animated = useCountUp(numericValue ?? 0);
  const display: ReactNode =
    numericValue !== undefined ? (format ? format(animated) : Math.round(animated)) : value;
  const accent = accentColor ?? (spectrum ? SPECTRUM_VAR[spectrum] : undefined);
  const sparkColor =
    accent ??
    (up ? "var(--color-success)" : down ? "var(--destructive)" : "var(--muted-foreground)");
  // The chip and the bottom rule share one colour with the series, so a
  // card's accent is stated once per card rather than three times in three
  // slightly different values.
  const chipColor = accent ?? TONE_TO_VAR[tone] ?? "var(--muted-foreground)";
  // Separate from `accent` above (which intentionally leaves tone-only cards
  // with no spark color override) — the gradient explicitly also honors
  // `tone`, since a card styled tone="destructive" etc. with no spectrum is
  // exactly the kind of card `emphasis` should still be able to color.
  // Every tile gets a chip, whether or not its call site passes an icon —
  // the chip is the thing that makes a grid of cards scannable, and
  // threading an `icon` prop through several hundred call sites to get one
  // is not a trade worth making. An explicit `icon` always wins.
  const FallbackIcon = metricIconFor(label);
  const mark = icon ?? <FallbackIcon className="h-3.5 w-3.5" />;
  const gradientColor = accent ?? TONE_TO_VAR[tone];
  const gradient = emphasis && gradientColor ? kpiGradient(gradientColor, emphasis) : undefined;
  const gradientBorder =
    emphasis && gradientColor ? kpiGradientBorder(gradientColor, emphasis) : undefined;
  const generatedTrend = hasDelta ? (
    <span
      className="delta-pill"
      style={
        {
          "--pill-color": up
            ? "var(--color-success)"
            : down
              ? "var(--destructive)"
              : "var(--muted-foreground)",
        } as CSSProperties
      }
    >
      <DeltaIcon className="h-3 w-3" />
      {Math.abs(deltaPct).toFixed(0)}%
    </span>
  ) : undefined;
  // A caller-supplied `trend` is already its own styled element (KpiBand
  // builds one with its own invert-aware colouring), so it is wrapped in the
  // pill shell rather than replaced by it.
  const badge = trend ? <span className="delta-pill">{trend}</span> : generatedTrend;
  const secondary = supporting ?? subLabel;
  // The generated delta only repeats in the supporting line when the pill is
  // showing something else — otherwise the same percentage appeared twice on
  // one card, two lines apart.
  const comparison =
    secondary || (hasDelta && trend) ? (
      <>
        {hasDelta && trend && generatedTrend}
        {hasDelta && trend && secondary && <span className="mx-1">·</span>}
        {secondary}
      </>
    ) : null;

  const series =
    chart ??
    (spark && spark.length > 1 ? (
      <div className="h-16 w-full">
        <InteractiveSparkline
          data={spark}
          labels={sparkLabels}
          variant={sparkVariant}
          width={240}
          height={64}
          stroke={sparkColor}
          fill={sparkColor}
          strokeWidth={1.75}
        />
      </div>
    ) : null);

  const content = (
    <>
      <div className="flex items-center justify-between gap-2.5 px-4 pt-4">
        <div className="flex min-w-0 items-center gap-2">
          <span className="metric-chip" aria-hidden>
            {mark}
          </span>
          <span className="min-w-0 break-words text-3xs font-semibold uppercase leading-tight tracking-[0.09em] text-foreground/75">
            {label}
          </span>
        </div>
        {badge}
      </div>

      <div className="px-4 pb-3 pt-2.5">
        <div
          className={cn(
            // The canonical numeric treatment app-wide is font-sans (Geist,
            // same as body text) + tabular-nums, not font-mono; this is the
            // single shared component every KpiCard/KpiBand headline value
            // renders through, so fixing it here is the one place that
            // standardizes every KPI surface in the app.
            "min-w-0 font-sans font-bold",
            // An unavailable state is prose, not a figure: drop the numeric
            // treatment (tabular-nums/tight tracking) and the hero scale.
            unavailable
              ? "text-sm leading-snug text-muted-foreground"
              : "text-[1.75rem] leading-[1.05] tabular-nums tracking-[-0.02em] sm:text-[2rem] md:text-[2.15rem]",
            unavailable ? undefined : tone === "default" ? "text-foreground" : TONE_TEXT[tone],
          )}
        >
          {/* Every KpiCard / StatCard / KpiBand headline value renders
              through here, so wrapping once makes the whole app's KPI
              surface editable under Mock Data — and only under Mock Data.
              DemoEditableValue is a pass-through when demoMode is off, so
              a real workspace renders exactly what it rendered before. An
              unavailable state ("Not tracked") is prose rather than a
              figure and stays unedited. */}
          {unavailable ? display : <DemoEditableValue label={label}>{display}</DemoEditableValue>}
        </div>
        {comparison && (
          <div className="mt-1.5 flex items-center text-2xs leading-tight text-muted-foreground">
            {comparison}
          </div>
        )}
      </div>

      <div className="mt-auto">
        {series ?? (
          <>
            <div className="px-4 pb-1.5 text-[9px] font-medium uppercase tracking-[0.14em] text-muted-foreground/45">
              No daily series
            </div>
            <div className="accent-rule" />
          </>
        )}
      </div>
    </>
  );

  const classes = cn(
    "metric-card group w-full text-left",
    gradient && "kpi-gradient",
    onClick && "cursor-pointer",
    className,
  );
  const style = {
    "--chip-color": chipColor,
    ...(gradient && gradientBorder
      ? {
          background: gradient,
          "--kpi-border": gradientBorder.border,
          "--kpi-border-hover": gradientBorder.borderHover,
        }
      : null),
  } as CSSProperties;
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={classes} style={style}>
        {content}
      </button>
    );
  }
  return (
    <div className={classes} style={style}>
      {content}
    </div>
  );
}
