import type { ReactNode } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sparkline } from "@/components/sparkline";

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
  label, value, subLabel, icon, tone = "default",
  deltaPct, spark, sparkVariant = "line",
}: {
  label: string;
  value: ReactNode;
  subLabel?: string;
  icon?: ReactNode;
  tone?: Tone;
  /** Signed percent change vs. the prior period — renders the trend badge. Omit to hide it. */
  deltaPct?: number;
  spark?: number[];
  sparkVariant?: "line" | "bar";
}) {
  const hasDelta = deltaPct !== undefined && Number.isFinite(deltaPct);
  const up = hasDelta && deltaPct > 0.5;
  const down = hasDelta && deltaPct < -0.5;
  const DeltaIcon = up ? TrendingUp : down ? TrendingDown : Minus;
  const deltaTone = up ? "success" : down ? "destructive" : "default";

  return (
    <div className="hover-lift group relative overflow-hidden rounded-xl border border-border bg-card p-4">
      <div className={cn("pointer-events-none absolute inset-0 bg-gradient-to-br to-transparent opacity-70 transition-opacity group-hover:opacity-100", TONE_GLOW[tone])} />
      <div className="glass-highlight pointer-events-none absolute inset-0 rounded-xl" />
      <div className="relative flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {icon && <span className="text-muted-foreground/80">{icon}</span>}
            <span className="truncate">{label}</span>
          </div>
          <div className={cn("mt-1.5 font-mono text-2xl font-bold tabular-nums tracking-tight", TONE_TEXT[tone])}>{value}</div>
          {subLabel && <div className="mt-0.5 text-[11px] text-muted-foreground">{subLabel}</div>}
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
        <div className="relative mt-3 h-8 opacity-80 transition-opacity group-hover:opacity-100">
          <Sparkline
            data={spark}
            variant={sparkVariant}
            width={220}
            height={32}
            stroke={up ? "var(--color-success)" : down ? "var(--destructive)" : "var(--muted-foreground)"}
            fill={up ? "var(--color-success)" : down ? "var(--destructive)" : "var(--muted-foreground)"}
            strokeWidth={1.5}
          />
        </div>
      )}
    </div>
  );
}
