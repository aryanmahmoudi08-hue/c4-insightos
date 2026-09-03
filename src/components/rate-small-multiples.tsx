import { ResponsiveContainer, LineChart, Line, XAxis, YAxis } from "recharts";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { KpiCard } from "@/components/kpi-card";
import { SPECTRUM_VAR, type SpectrumPosition } from "@/lib/spectrum";

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
 * Operating-rate tiles use the canonical Content Dashboard card shell. The
 * existing dated line chart, delta, hint, no-data state, and click behavior
 * remain intact as card content.
 */
export function RateSmallMultiples({ charts }: { charts: RateChartSpec[] }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {charts.map((c) => {
        const hasDelta = c.deltaPct !== undefined && Number.isFinite(c.deltaPct);
        const up = hasDelta && c.deltaPct! > 0.5;
        const down = hasDelta && c.deltaPct! < -0.5;
        const DeltaIcon = up ? TrendingUp : down ? TrendingDown : Minus;
        const color = SPECTRUM_VAR[c.spectrum];
        const noData = c.points.length === 0;
        const trend = hasDelta ? (
          <span
            className={
              up
                ? "text-[color:var(--color-success)]"
                : down
                  ? "text-destructive"
                  : "text-muted-foreground"
            }
          >
            <DeltaIcon className="mr-1 inline h-3 w-3" />
            {Math.abs(c.deltaPct!).toFixed(0)}%
          </span>
        ) : undefined;
        const chart = noData ? (
          <div className="flex h-16 items-center justify-center text-xs text-muted-foreground">
            No data in range
          </div>
        ) : (
          <div className="h-16">
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
          </div>
        );
        return (
          <KpiCard
            key={c.key}
            label={c.label}
            value={`${c.currentPct.toFixed(1)}%`}
            supporting={c.hint}
            trend={trend}
            chart={chart}
            spectrum={c.spectrum}
            onClick={c.onClick}
          />
        );
      })}
    </div>
  );
}
