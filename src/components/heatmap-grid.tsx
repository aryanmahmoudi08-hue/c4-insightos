import { cn } from "@/lib/utils";

/** cold → mid → hot at intensity t (0-1) — two-stop color-mix per half, never all three stops in one mix (B4 rule #4). */
function spectrumColorAt(t: number): string {
  if (t <= 0.5) {
    const pct = Math.round((t / 0.5) * 100);
    return `color-mix(in oklch, var(--spectrum-mid) ${pct}%, var(--spectrum-cold))`;
  }
  const pct = Math.round(((t - 0.5) / 0.5) * 100);
  return `color-mix(in oklch, var(--spectrum-hot) ${pct}%, var(--spectrum-mid))`;
}

/**
 * Generic intensity heatmap — posting-time grids, rep activity grids, variation
 * performance grids. Default `variant="single"` blends one `tone` color at
 * varying alpha (unchanged, existing callers keep this look). Opt-in
 * `variant="spectrum"` instead ramps hue cold→hot with intensity — the
 * cleanest demonstration of the B4 data language (Part C4).
 *
 * Legend (Sales Tracking Part 2): confirmed real gap — this component had no
 * legend at all, so a darker cell had no explained meaning or scale. Renders
 * a real min→max swatch strip with the actual row-max value underneath the
 * grid whenever `valueFmt` is provided (it already carries the unit, e.g.
 * "5 dials" — reused as-is rather than asking the caller to name the unit
 * twice).
 */
export function HeatmapGrid({ rowLabels, colLabels, data, valueFmt, tone = "var(--accent)", variant = "single" }: {
  rowLabels: string[];
  colLabels: string[];
  /** data[row][col] */
  data: number[][];
  valueFmt?: (v: number) => string;
  tone?: string;
  variant?: "single" | "spectrum";
}) {
  const max = Math.max(1, ...data.flat());
  const legendColor = (t: number) => variant === "spectrum" ? spectrumColorAt(t) : tone;
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full border-separate" style={{ borderSpacing: 4 }}>
          <thead>
            <tr>
              <th className="w-16" />
              {colLabels.map((c) => (
                <th key={c} className="pb-1 text-center text-4xs font-medium uppercase tracking-wider text-muted-foreground">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rowLabels.map((r, ri) => (
              <tr key={r}>
                <td className="pr-2 text-right text-3xs font-medium text-muted-foreground whitespace-nowrap">{r}</td>
                {colLabels.map((_, ci) => {
                  const v = data[ri]?.[ci] ?? 0;
                  const t = v / max;
                  const alpha = Math.round(t * 85) + (v > 0 ? 10 : 0);
                  const cellColor = legendColor(t);
                  return (
                    <td key={ci} title={valueFmt ? valueFmt(v) : String(v)}
                      className={cn("h-7 w-7 rounded-[3px] transition-transform hover:scale-110 hover:z-10 relative cursor-default")}
                      style={{ background: `color-mix(in oklch, ${cellColor} ${alpha}%, var(--muted))` }}
                    />
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {valueFmt && (
        <div className="mt-3 flex items-center gap-2 border-t border-border/60 pt-2.5 text-3xs text-muted-foreground">
          <span>Low</span>
          <span
            className="h-2.5 w-24 rounded-full"
            style={{ background: `linear-gradient(to right, ${[0, 0.25, 0.5, 0.75, 1].map((t) => `color-mix(in oklch, ${legendColor(t)} ${Math.round(t * 85) + 10}%, var(--muted))`).join(", ")})` }}
          />
          <span>High · darkest cell = {valueFmt(max)}/day</span>
        </div>
      )}
    </div>
  );
}
