import { ResponsiveContainer, LineChart, Line, XAxis, YAxis } from "recharts";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { SPECTRUM_VAR, SPECTRUM_TEXT_CLASS, type SpectrumPosition } from "@/lib/spectrum";

export interface RateChartSpec {
  key: string;
  label: string;
  /** Real per-day ratio points (src/lib/trend.ts `seriesRatePoints`) — dated, never a bare sparkline. */
  points: { d: string; pct: number }[];
  currentPct: number;
  hint?: string;
  deltaPct?: number;
  spectrum: SpectrumPosition;
  onClick?: () => void;
}

/**
 * A dense grid of small, identically-shaped labeled line charts — one per
 * rate — instead of one number-in-a-box per rate. Each maps 1:1 to a funnel
 * connector (Show Rate = Showed/Booked), so `onClick` opens the same detail
 * panel the corresponding funnel stage does.
 */
export function RateSmallMultiples({ charts }: { charts: RateChartSpec[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {charts.map((c) => {
        const hasDelta = c.deltaPct !== undefined && Number.isFinite(c.deltaPct);
        const up = hasDelta && c.deltaPct! > 0.5;
        const down = hasDelta && c.deltaPct! < -0.5;
        const DeltaIcon = up ? TrendingUp : down ? TrendingDown : Minus;
        const color = SPECTRUM_VAR[c.spectrum];
        const noData = c.points.length === 0;
        return (
          <button
            key={c.key}
            type="button"
            onClick={c.onClick}
            disabled={!c.onClick}
            className={cn(
              "hover-lift rounded-lg border border-border bg-card p-2.5 text-left",
              c.onClick && "cursor-pointer",
            )}
          >
            <div className="text-3xs font-semibold uppercase tracking-wider text-muted-foreground truncate">
              {c.label}
            </div>
            {/* Confirmed real bug: the delta badge used to render in the label row,
                above the actual rate — small font aside, that read as "the rate" to
                a quick glance (worse when several deltas round to the same "0%").
                currentPct is now unambiguously first/largest, delta inline right
                after it, same value+delta hierarchy KpiBand already establishes. */}
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <span
                className={cn(
                  "font-mono text-lg font-bold tabular-nums",
                  SPECTRUM_TEXT_CLASS[c.spectrum],
                )}
              >
                {c.currentPct.toFixed(1)}%
              </span>
              {hasDelta && (
                <span
                  className={cn(
                    "flex items-center gap-0.5 text-3xs font-mono",
                    up && "text-[color:var(--color-success)]",
                    down && "text-destructive",
                    !up && !down && "text-muted-foreground",
                  )}
                >
                  <DeltaIcon className="h-2 w-2" />
                  {Math.abs(c.deltaPct!).toFixed(0)}%
                </span>
              )}
            </div>
            {c.hint && <div className="text-3xs text-muted-foreground">{c.hint}</div>}
            <div className="relative mt-1 h-12">
              {noData ? (
                <div className="flex h-full items-center justify-center text-3xs text-muted-foreground">
                  No data in range
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={c.points} margin={{ top: 2, right: 2, left: 2, bottom: 0 }}>
                    <XAxis
                      dataKey="d"
                      fontSize={8}
                      tickLine={false}
                      axisLine={false}
                      stroke="var(--muted-foreground)"
                      minTickGap={20}
                      tick={{ fontSize: 8 }}
                    />
                    <YAxis domain={[0, 100]} hide />
                    <Line
                      type="monotone"
                      dataKey="pct"
                      stroke={color}
                      strokeWidth={1.5}
                      dot={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
