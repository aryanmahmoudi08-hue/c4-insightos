import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, LabelList } from "recharts";
import { Activity } from "lucide-react";
import { SPECTRUM_VAR } from "@/lib/spectrum";
import type { FunnelStage } from "@/lib/funnel-derivation";

/**
 * A real axis-bearing bar chart — matches this app's existing objection-
 * frequency chart convention (`closer.tsx`'s `BarChart layout="vertical"`)
 * rather than a hand-rolled proportional div with no scale reference. One
 * connected instrument for a sequence of related metrics (Dials → Connections
 * → Qualified Convos → Sets), not a card per stage. Conversion-% between
 * consecutive stages is annotated per bar — this IS the "rate tile," folded
 * into the funnel rather than drawn separately.
 */
export function FunnelInstrument({
  title, subtitle, stages, onStageClick,
}: {
  title: string;
  subtitle?: string;
  stages: FunnelStage[];
  /** Opens the metric detail panel for the clicked stage. */
  onStageClick?: (index: number) => void;
}) {
  const allZero = stages.every((s) => s.value === 0);
  // Empty state still needs a real scale to plot against — never collapse the
  // axis to [0,0] just because there's no data yet.
  const domainMax = allZero ? 10 : undefined;
  // Sized to the stages it actually has (3 vs 4 rows) instead of a fixed
  // height every funnel used regardless of row count — the fixed height was
  // taller than 3 rows need, which read as dead space at zero data rather
  // than a deliberately empty design.
  const height = stages.length * 56 + 48;
  const data = stages.map((s, i) => {
    const prev = stages[i - 1];
    const conv = prev && prev.value > 0 ? Math.round((s.value / prev.value) * 100) : null;
    return { label: s.label, value: s.value, spectrum: s.spectrum, conv };
  });

  return (
    <div className="hover-lift relative overflow-hidden rounded-xl border border-border bg-card p-4">
      <div className="glass-highlight pointer-events-none absolute inset-0 rounded-xl" />
      <div className="relative mb-2">
        <div className="text-3xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{title}</div>
        {subtitle && <div className="text-2xs text-muted-foreground">{subtitle}</div>}
      </div>
      <div className="relative" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 4, right: 44, top: 4, bottom: 4 }}>
            <CartesianGrid stroke="var(--border)" horizontal={false} />
            <XAxis type="number" stroke="var(--muted-foreground)" fontSize={10} domain={domainMax ? [0, domainMax] : undefined} allowDecimals={false} />
            <YAxis type="category" dataKey="label" stroke="var(--muted-foreground)" fontSize={11} width={128} tickLine={false} />
            <Tooltip
              cursor={{ fill: "var(--muted)", opacity: 0.3 }}
              contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, boxShadow: "var(--shadow-md)" }}
              formatter={(v: number, _n, p) => [`${v.toLocaleString()}${p.payload.conv !== null ? ` · ${p.payload.conv}% of prior stage` : ""}`, "Count"]}
            />
            <Bar
              dataKey="value"
              radius={[0, 4, 4, 0]}
              maxBarSize={28}
              // A zero-value bar renders no shape at all, which would make an
              // empty stage unclickable — `background` draws a full-track rect
              // regardless of value, so every row stays a real click target.
              background={{ fill: "var(--muted)", fillOpacity: 0.15, radius: 4 }}
              onClick={onStageClick ? (_, index) => onStageClick(index) : undefined}
              cursor={onStageClick ? "pointer" : undefined}
              isAnimationActive={false}
            >
              {data.map((d, i) => <Cell key={i} fill={SPECTRUM_VAR[d.spectrum]} />)}
              <LabelList
                dataKey="value"
                position="right"
                content={(props) => {
                  const { x, y, width, height: h, index } = props as { x: number; y: number; width: number; height: number; index: number };
                  const d = data[index];
                  return (
                    <text x={x + width + 6} y={y + h / 2} dy={4} fontSize={11} fontFamily="var(--font-mono)" fill="var(--foreground)">
                      {d.value.toLocaleString()}{d.conv !== null && <tspan fill="var(--muted-foreground)"> · {d.conv}%</tspan>}
                    </text>
                  );
                }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        {allZero && (
          // Sits over the plot region only (left offset matches the YAxis
          // width + margin so real stage labels on the left stay fully
          // legible, not covered by the empty-state card) — a deliberate,
          // card-sized treatment instead of a small pill stranded in empty
          // space; the axis/scale/labels underneath stay real structure.
          <div className="pointer-events-none absolute inset-y-0 right-0 left-32 flex flex-col items-center justify-center gap-1.5 text-center">
            <div className="grid h-8 w-8 place-items-center rounded-full border border-border bg-card text-muted-foreground shadow-sm">
              <Activity className="h-4 w-4" />
            </div>
            <div className="text-2xs font-medium text-foreground">No activity logged yet</div>
            <div className="max-w-[14rem] text-3xs text-muted-foreground">Log a day to see this funnel fill in.</div>
          </div>
        )}
      </div>
    </div>
  );
}
