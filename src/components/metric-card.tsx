import type { ReactNode } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { InteractiveSparkline } from "@/components/interactive-sparkline";
import { useCountUp } from "@/hooks/use-count-up";
import { SPECTRUM_VAR, SPECTRUM_TEXT_CLASS, type SpectrumPosition } from "@/lib/spectrum";

type Tone = "default" | "success" | "warning" | "destructive" | "accent";

const TONE_TEXT: Record<Tone, string> = {
  default: "text-foreground",
  success: "text-[color:var(--color-success)]",
  warning: "text-[color:var(--color-warning)]",
  destructive: "text-destructive",
  accent: "text-accent",
};
const TONE_GLOW: Record<Tone, string> = {
  default: "from-foreground/10",
  success: "from-[color:var(--color-success)]/15",
  warning: "from-[color:var(--color-warning)]/15",
  destructive: "from-destructive/15",
  accent: "from-accent/15",
};

/**
 * Canonical InsightOS metric tile. The four Content Intelligence outcome cards
 * (Views, Leads Generated, Closes Attributed, Cash Attributed) are the visual
 * source of truth for every KPI surface in the application.
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
  deltaPct,
  trend,
  spark,
  sparkVariant = "line",
  chart,
  numericValue,
  format,
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
  deltaPct?: number;
  trend?: ReactNode;
  spark?: number[];
  sparkVariant?: "line" | "bar";
  chart?: ReactNode;
  numericValue?: number;
  format?: (n: number) => string;
  onClick?: () => void;
  className?: string;
}) {
  const hasDelta = deltaPct !== undefined && Number.isFinite(deltaPct);
  const up = hasDelta && deltaPct > 0.5;
  const down = hasDelta && deltaPct < -0.5;
  const DeltaIcon = up ? TrendingUp : down ? TrendingDown : Minus;
  const deltaTone = up ? "success" : down ? "destructive" : "default";
  const animated = useCountUp(numericValue ?? 0);
  const display: ReactNode =
    numericValue !== undefined ? (format ? format(animated) : Math.round(animated)) : value;
  const accent = accentColor ?? (spectrum ? SPECTRUM_VAR[spectrum] : undefined);
  const sparkColor =
    accent ??
    (up ? "var(--color-success)" : down ? "var(--destructive)" : "var(--muted-foreground)");
  const generatedTrend = hasDelta ? (
    <span
      className={cn(
        "inline-flex items-center gap-1",
        deltaTone === "success" && "text-[color:var(--color-success)]",
        deltaTone === "destructive" && "text-destructive",
        deltaTone === "default" && "text-muted-foreground",
      )}
    >
      <DeltaIcon className="h-2.5 w-2.5" />
      {Math.abs(deltaPct).toFixed(0)}%
    </span>
  ) : undefined;
  const badge = trend ?? generatedTrend;
  const secondary = supporting ?? subLabel;
  const comparison = secondary ? (
    <>
      {hasDelta && generatedTrend}
      {hasDelta && secondary && <span className="mx-1">·</span>}
      {secondary}
    </>
  ) : null;
  const content = (
    <>
      <div className="relative flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-start gap-1.5 text-3xs font-semibold uppercase leading-tight tracking-[0.14em] text-muted-foreground">
            {icon && <span className="mt-0.5 shrink-0 text-muted-foreground/80">{icon}</span>}
            <span className="break-words">{label}</span>
          </div>
          <div
            className={cn(
              "mt-1.5 font-sans text-3xl font-bold tabular-nums tracking-tight md:text-[2.35rem]",
              accent ? undefined : spectrum ? SPECTRUM_TEXT_CLASS[spectrum] : TONE_TEXT[tone],
            )}
            style={accent ? { color: accent } : undefined}
          >
            {display}
          </div>
          {comparison && <div className="mt-1 text-2xs text-muted-foreground">{comparison}</div>}
        </div>
        {badge && (
          <span className="badge-glass shrink-0 font-mono normal-case tracking-normal">
            {badge}
          </span>
        )}
      </div>
      <div className="relative mt-3 min-h-8 rounded-lg border border-border/50 bg-background/20 px-1 py-0.5 opacity-80 transition-opacity group-hover:opacity-100">
        {chart ??
          (spark && spark.length > 1 ? (
            <InteractiveSparkline
              data={spark}
              variant={sparkVariant}
              width={220}
              height={44}
              stroke={sparkColor}
              fill={sparkColor}
              strokeWidth={1.5}
            />
          ) : (
            <div
              className="flex h-8 items-center gap-1 px-2"
              aria-label="No daily series available"
            >
              <span className="h-px flex-1 bg-muted-foreground/30" />
              <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/60">
                No daily series
              </span>
              <span className="h-px flex-1 bg-muted-foreground/30" />
            </div>
          ))}
      </div>
    </>
  );
  const surface = (
    <>
      <div
        className={cn(
          "pointer-events-none absolute inset-0 bg-gradient-to-br to-transparent opacity-70 transition-opacity group-hover:opacity-100",
          accent || spectrum ? undefined : TONE_GLOW[tone],
        )}
        style={
          accent || spectrum
            ? {
                backgroundImage: `linear-gradient(to bottom right, color-mix(in oklch, ${accent ?? SPECTRUM_VAR[spectrum!]} 15%, transparent), transparent)`,
              }
            : undefined
        }
      />
      <div className="glass-highlight pointer-events-none absolute inset-0 rounded-2xl" />
      <div className="relative">{content}</div>
      {accent && (
        <span
          className="absolute inset-x-0 bottom-0 h-1"
          style={{ background: accent, boxShadow: `0 0 18px ${accent}` }}
        />
      )}
    </>
  );
  const classes = cn(
    "group relative w-full overflow-hidden rounded-2xl border border-border bg-card p-4 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-spectrum-mid/60",
    onClick && "cursor-pointer",
    className,
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={classes}>
        {surface}
      </button>
    );
  }
  return <div className={classes}>{surface}</div>;
}
