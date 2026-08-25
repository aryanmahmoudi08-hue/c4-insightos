import type { CSSProperties } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCountUp } from "@/hooks/use-count-up";
import { Sparkline } from "@/components/sparkline";
import { SPECTRUM_CHIP_CLASS, SPECTRUM_TEXT_CLASS, SPECTRUM_VAR, spectrumGlowStyle, type SpectrumPosition } from "@/lib/spectrum";

type Tone = "default" | "header" | "money" | "rate";

export function KpiTile({
  label, value, tone = "default", spectrum, hint, numericValue, format,
  spark, deltaPct, emptyHint, empty, weight = "standard",
}: {
  label: string;
  value: string | number;
  tone?: Tone;
  /** Opt-in funnel-position data encoding (B4) — takes precedence over `tone` for the label chip and value color when set. Use for genuinely funnel-positioned metrics only (views=cold, sets/booked=mid, cash/closes=hot), never decoratively. */
  spectrum?: SpectrumPosition;
  /** Secondary caption under the value — also used for a rate tile's denominator ("18 of 24 showed"). */
  hint?: string;
  /** Opt-in: pass the raw number + a formatter to get a count-up animation on change (e.g. date-range switches). Omit to render `value` as-is. */
  numericValue?: number;
  format?: (n: number) => string;
  /** Real day-bucketed trend data. Omit entirely when there's no real series to plot — never fill in a decorative shape. */
  spark?: number[];
  /** Signed % change vs. the prior equivalent period. Omit (not 0) when there's no prior-period baseline. */
  deltaPct?: number;
  /** Shown in place of a bare "0" when the value is genuinely zero — name what to log to populate this tile. */
  emptyHint?: string;
  /** Explicit "no data logged yet" flag — e.g. a rate tile's zero DENOMINATOR, not its rate happening to read 0%. Falls back to `numericValue === 0` (or `value === 0`) when omitted, which is only correct for plain counts. */
  empty?: boolean;
  /** "featured" = money/outcome tiles: larger numerals, more weight. "standard" = volume/activity tiles, quieter. Independent of the BentoCell grid span at the call site. */
  weight?: "standard" | "featured";
}) {
  const animated = useCountUp(numericValue ?? 0);
  const display = numericValue !== undefined ? (format ? format(animated) : Math.round(animated)) : value;
  const isZero = empty !== undefined ? empty : numericValue !== undefined ? numericValue === 0 : value === 0;
  const hasDelta = deltaPct !== undefined && Number.isFinite(deltaPct);
  const up = hasDelta && deltaPct! > 0.5;
  const down = hasDelta && deltaPct! < -0.5;
  const DeltaIcon = up ? TrendingUp : down ? TrendingDown : Minus;
  const sparkColor = spectrum ? SPECTRUM_VAR[spectrum] : "var(--muted-foreground)";
  const glowStyle = spectrum ? ({ "--glow": spectrumGlowStyle(spectrum).boxShadow } as CSSProperties) : undefined;

  return (
    <div
      className={cn("hover-lift group relative rounded-md border border-border bg-card overflow-hidden flex flex-col", spectrum && "hover:shadow-[var(--glow)]")}
      style={glowStyle}
    >
      <div className={cn(
        "px-3 py-1.5 text-3xs font-medium uppercase tracking-wider text-center border-b border-border",
        spectrum ? SPECTRUM_CHIP_CLASS[spectrum] : [
          tone === "money" && "bg-[color:var(--color-success)]/10 text-[color:var(--color-success)]",
          tone === "rate" && "bg-accent/10 text-accent",
          tone === "header" && "bg-primary/15 text-primary",
          tone === "default" && "bg-muted/40 text-muted-foreground",
        ],
      )}>{label}</div>
      <div className={cn("flex-1 flex flex-col justify-center px-3 gap-1 min-h-[64px]", weight === "featured" ? "py-4" : "py-3")}>
        {isZero && emptyHint ? (
          <div className="flex flex-col items-center justify-center text-center gap-1 py-1">
            <div className="text-lg font-mono text-muted-foreground/40">—</div>
            <div className="text-3xs text-muted-foreground/70 leading-tight px-1">{emptyHint}</div>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2">
              <div className={cn("font-mono font-bold tabular-nums", weight === "featured" ? "text-2xl" : "text-lg", spectrum && SPECTRUM_TEXT_CLASS[spectrum])}>{display}</div>
              {hasDelta && (
                <span className={cn(
                  "badge-glass shrink-0 font-mono text-3xs normal-case tracking-normal",
                  up && "text-[color:var(--color-success)]", down && "text-destructive", !up && !down && "text-muted-foreground",
                )}>
                  <DeltaIcon className="h-2.5 w-2.5" />{Math.abs(deltaPct!).toFixed(0)}%
                </span>
              )}
            </div>
            {hint && <div className="text-3xs text-muted-foreground">{hint}</div>}
            {spark && spark.length > 1 && (
              <div className="mt-0.5 opacity-80 transition-opacity group-hover:opacity-100">
                <Sparkline data={spark} width={96} height={18} stroke={sparkColor} fill={sparkColor} strokeWidth={1.25} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
