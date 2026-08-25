import { ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";

export interface MoneyPoint {
  d: string;
  cash: number;
  revenue: number;
}

/**
 * Cash Collected and Revenue Generated on one shared, labeled axis — matches
 * `dashboard.tsx`'s daily-cash `AreaChart` conventions (dated x-axis, `$`
 * y-axis, dashed gridlines) rather than two hand-rolled SVG layers with no
 * scale. Cash Collected's own value/delta/prior lives in the KPI band above
 * this chart — this component's job is purely the shape over time.
 */
export function MoneyInstrument({
  series, payoutPct, payoutCents, cashRatePct, onCashClick, fmtMoney,
}: {
  series: MoneyPoint[];
  /** Omit both when there's no single payout rate to show (e.g. a company-wide
   * view blending multiple rep payout percentages) — the line just doesn't render. */
  payoutPct?: number;
  payoutCents?: number;
  /** Cash Collected as % of Revenue Generated — the sheet metric "Cash Collected Rate," shown explicitly here rather than left implicit in the two chart layers. */
  cashRatePct?: number;
  onCashClick?: () => void;
  fmtMoney: (cents: number) => string;
}) {
  const allZero = series.every((p) => p.cash === 0 && p.revenue === 0);
  const domainMax = allZero ? 1000 : undefined;

  return (
    <div className="hover-lift relative overflow-hidden rounded-xl border border-border bg-card p-4">
      <div className="glass-highlight pointer-events-none absolute inset-0 rounded-xl" />
      <div className="relative mb-2 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onCashClick}
          disabled={!onCashClick}
          className={onCashClick ? "cursor-pointer text-left" : "text-left"}
        >
          <div className="text-3xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Cash Collected vs Revenue Generated</div>
        </button>
        <div className="flex items-center gap-3 text-3xs text-muted-foreground">
          <span className="flex items-center gap-1"><span className="h-1.5 w-3 rounded-full bg-spectrum-hot" />Cash</span>
          <span className="flex items-center gap-1"><span className="h-0 w-3 border-t border-dashed border-muted-foreground" />Revenue</span>
        </div>
      </div>
      <div className="relative h-56">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={series} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
            <defs>
              <linearGradient id="moneyCashGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--spectrum-hot)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--spectrum-hot)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="d" stroke="var(--muted-foreground)" fontSize={10} tickLine={false} axisLine={{ stroke: "var(--border)" }} minTickGap={24} />
            <YAxis
              stroke="var(--muted-foreground)" fontSize={10} tickLine={false} axisLine={false} width={52}
              domain={domainMax ? [0, domainMax] : undefined}
              tickFormatter={(v: number) => "$" + Math.round(v / 100).toLocaleString()}
            />
            <Tooltip
              contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, padding: "6px 10px", boxShadow: "var(--shadow-md)" }}
              labelStyle={{ color: "var(--muted-foreground)", fontSize: 10, marginBottom: 2 }}
              formatter={(v: number, name: string) => [fmtMoney(v), name === "cash" ? "Cash" : "Revenue"]}
            />
            <Area type="monotone" dataKey="cash" name="cash" stroke="var(--spectrum-hot)" fill="url(#moneyCashGrad)" strokeWidth={2} isAnimationActive={false} />
            <Line type="monotone" dataKey="revenue" name="revenue" stroke="var(--muted-foreground)" strokeDasharray="4 3" strokeWidth={1.5} dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
        {allZero && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="rounded-full border border-border bg-card/90 px-3 py-1 text-2xs text-muted-foreground">No data in range</span>
          </div>
        )}
      </div>
      <div className="relative mt-2 flex flex-wrap gap-x-4 gap-y-1 border-t border-border/60 pt-2 text-2xs text-muted-foreground">
        {cashRatePct !== undefined && (
          <span>Cash collected rate: <span className="font-mono text-foreground">{cashRatePct.toFixed(1)}%</span></span>
        )}
        {payoutPct !== undefined && payoutCents !== undefined && (
          <span>Payout owed ({payoutPct}%): <span className="font-mono text-foreground">{fmtMoney(payoutCents)}</span></span>
        )}
      </div>
    </div>
  );
}
