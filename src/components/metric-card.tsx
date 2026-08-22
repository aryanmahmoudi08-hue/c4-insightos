import type { ReactNode } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sparkline } from "@/components/sparkline";
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
 * "Enterprise" metric visualizer: glass elevation, a live +/- trend badge, a mini
 * bar or line sparkline, and an optional sub-label. Replaces flat KPI boxes wherever
 * a number needs more context than "here's a value" — trend direction and shape matter too.
 */
export function MetricCard({
  label, value, subLabel, icon, tone = "default", spectrum,
  deltaPct, spark, sparkVariant = "line",
  numericValue, format,
}: {
  label: string;
  value: ReactNode;
  subLabel?: string;
  icon?: ReactNode;
  tone?: Tone;
  /** Opt-in funnel-position data encoding (B4) — takes precedence over `tone` for the value color, ambient glow, and sparkline color when set. Leaves the delta badge's up/down semantics untouched — temperature and trend are different signals. */
  spectrum?: SpectrumPosition;
  /** Signed percent change vs. the prior period — renders the trend badge. Omit to hide it. */
  deltaPct?: number;
  spark?: number[];
  sparkVariant?: "line" | "bar";
  /** Opt-in: pass the raw number + a formatter to get a count-up animation on change (e.g. date-range switches). Omit to render `value` as-is. */
  numericValue?: number;
  format?: (n: number) => string;
}) {
  const hasDelta = deltaPct !== undefined && Number.isFinite(deltaPct);
  const up = hasDelta && deltaPct > 0.5;
  const down = hasDelta && deltaPct < -0.5;
  const DeltaIcon = up ? TrendingUp : down ? TrendingDown : Minus;
  const deltaTone = up ? "success" : down ? "destructive" : "default";
  const animated = useCountUp(numericValue ?? 0);
  const display: ReactNode = numericValue !== undefined ? (format ? format(animated) : Math.round(animated)) : value;
  const sparkColor = spectrum ? SPECTRUM_VAR[spectrum] : (up ? "var(--color-success)" : down ? "var(--destructive)" : "var(--muted-foreground)");

  return (
    <div className="hover-lift group relative overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className={cn(
        "pointer-events-none absolute inset-0 bg-gradient-to-br to-transparent opacity-70 transition-opacity group-hover:opacity-100",
        spectrum ? undefined : TONE_GLOW[tone],
      )} style={spectrum ? { backgroundImage: `linear-gradient(to bottom right, color-mix(in oklch, ${SPECTRUM_VAR[spectrum]} 15%, transparent), transparent)` } : undefined} />
      <div className="glass-highlight pointer-events-none absolute inset-0 rounded-2xl" />
      <div className="relative flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-3xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {icon && <span className="text-muted-foreground/80">{icon}</span>}
            <span className="truncate">{label}</span>
          </div>
          <div className={cn("mt-2 font-mono text-2xl font-bold tabular-nums tracking-tight md:text-[1.75rem]", spectrum ? SPECTRUM_TEXT_CLASS[spectrum] : TONE_TEXT[tone])}>{display}</div>
          {subLabel && <div className="mt-0.5 text-2xs text-muted-foreground">{subLabel}</div>}
        </div>
        {hasDelta && (
          <span className={cn(
            "badge-glass shrink-0 font-mono normal-case tracking-normal",
            deltaTone === "success" && "text-[color:var(--color-success)]",
            deltaTone === "destructive" && "text-destructive",
            deltaTone === "default" && "text-muted-foreground",
          )}>
            <DeltaIcon className="h-2.5 w-2.5" />
            {Math.abs(deltaPct).toFixed(0)}%
          </span>
        )}
      </div>
      {spark && spark.length > 1 && (
        <div className="relative mt-4 h-9 rounded-lg border border-border/50 bg-background/20 px-1 py-0.5 opacity-80 transition-opacity group-hover:opacity-100">
          <Sparkline
            data={spark}
            variant={sparkVariant}
            width={220}
            height={30}
            stroke={sparkColor}
            fill={sparkColor}
            strokeWidth={1.5}
          />
        </div>
      )}
    </div>
  );
}
