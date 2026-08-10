import { cn } from "@/lib/utils";

/** Generic intensity heatmap — posting-time grids, rep activity grids, variation performance grids. */
export function HeatmapGrid({ rowLabels, colLabels, data, valueFmt, tone = "var(--accent)" }: {
  rowLabels: string[];
  colLabels: string[];
  /** data[row][col] */
  data: number[][];
  valueFmt?: (v: number) => string;
  tone?: string;
}) {
  const max = Math.max(1, ...data.flat());
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate" style={{ borderSpacing: 3 }}>
        <thead>
          <tr>
            <th className="w-16" />
            {colLabels.map((c) => (
              <th key={c} className="pb-1 text-center text-[9px] font-medium uppercase tracking-wider text-muted-foreground">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rowLabels.map((r, ri) => (
            <tr key={r}>
              <td className="pr-2 text-right text-[10px] font-medium text-muted-foreground whitespace-nowrap">{r}</td>
              {colLabels.map((_, ci) => {
                const v = data[ri]?.[ci] ?? 0;
                const alpha = Math.round((v / max) * 85) + (v > 0 ? 10 : 0);
                return (
                  <td key={ci} title={valueFmt ? valueFmt(v) : String(v)}
                    className={cn("h-6 w-6 rounded-[3px] transition-transform hover:scale-110 hover:z-10 relative cursor-default")}
                    style={{ background: `color-mix(in oklch, ${tone} ${alpha}%, var(--muted))` }}
                  />
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
