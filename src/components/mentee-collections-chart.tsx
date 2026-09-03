import { useMemo } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { expectedVsActualSeries } from "@/lib/mentee-payments";

type Range = "7d" | "30d" | "mtd" | "quarter" | "custom";

const RANGE_LABELS: Record<Range, string> = {
  "7d": "7d",
  "30d": "30d",
  mtd: "MTD",
  quarter: "Quarter",
  custom: "Custom",
};

function rangeToDates(range: Range, customFrom: string, customTo: string) {
  const today = new Date();
  const toStr = (d: Date) => d.toISOString().slice(0, 10);
  if (range === "custom") return { from: customFrom || toStr(today), to: customTo || toStr(today) };
  if (range === "mtd") {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from: toStr(start), to: toStr(today) };
  }
  if (range === "quarter") {
    const start = new Date(today);
    start.setDate(start.getDate() - 90);
    return { from: toStr(start), to: toStr(today) };
  }
  const days = range === "7d" ? 6 : 29;
  const start = new Date(today);
  start.setDate(start.getDate() - days);
  return { from: toStr(start), to: toStr(today) };
}

export function CollectionsChart({
  scheduleItems,
  payments,
  range,
  onRangeChange,
  customFrom,
  customTo,
  onCustomFrom,
  onCustomTo,
}: {
  scheduleItems: { due_date: string; amount_cents: number }[];
  payments: { collected_at: string; amount_cents: number; status: string }[];
  range: Range;
  onRangeChange: (r: Range) => void;
  customFrom: string;
  customTo: string;
  onCustomFrom: (v: string) => void;
  onCustomTo: (v: string) => void;
}) {
  const { from, to } = rangeToDates(range, customFrom, customTo);
  const series = useMemo(
    () => expectedVsActualSeries(scheduleItems, payments, from, to),
    [scheduleItems, payments, from, to],
  );
  const chartData = series.map((p) => ({
    date: p.date.slice(5),
    Expected: Math.round(p.expectedCents / 100),
    Actual: Math.round(p.actualCents / 100),
    slipped: p.expectedCents > 0 && p.actualCents < p.expectedCents,
  }));
  const totalExpected = series.reduce((s, p) => s + p.expectedCents, 0);
  const totalActual = series.reduce((s, p) => s + p.actualCents, 0);
  const slippedDays = chartData.filter((d) => d.slipped).length;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">Expected vs Actual Cash Collections</div>
          <div className="mt-1 text-xs text-muted-foreground">
            Expected = scheduled payment-plan installments · Actual = payments logged as paid
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {(Object.keys(RANGE_LABELS) as Range[]).map((r) => (
            <button
              key={r}
              onClick={() => onRangeChange(r)}
              className={`rounded border px-2 py-1 text-2xs ${range === r ? "border-primary bg-primary/10" : "border-border text-muted-foreground hover:bg-muted/40"}`}
            >
              {RANGE_LABELS[r]}
            </button>
          ))}
          {range === "custom" && (
            <>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => onCustomFrom(e.target.value)}
                className="h-7 rounded border border-input bg-background px-1.5 text-2xs"
              />
              <span className="text-2xs text-muted-foreground">→</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => onCustomTo(e.target.value)}
                className="h-7 rounded border border-input bg-background px-1.5 text-2xs"
              />
            </>
          )}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-xs sm:max-w-md">
        <div className="rounded-lg border border-border/60 bg-background/40 p-2">
          <div className="text-3xs uppercase tracking-wider text-muted-foreground">Expected</div>
          <div className="mt-1 font-mono font-semibold">
            ${Math.round(totalExpected / 100).toLocaleString()}
          </div>
        </div>
        <div className="rounded-lg border border-border/60 bg-background/40 p-2">
          <div className="text-3xs uppercase tracking-wider text-muted-foreground">Actual</div>
          <div className="mt-1 font-mono font-semibold">
            ${Math.round(totalActual / 100).toLocaleString()}
          </div>
        </div>
        <div className="rounded-lg border border-border/60 bg-background/40 p-2">
          <div className="text-3xs uppercase tracking-wider text-muted-foreground">
            Slipped days
          </div>
          <div className="mt-1 font-mono font-semibold text-destructive">{slippedDays}</div>
        </div>
      </div>
      {chartData.length ? (
        <div className="mt-4 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
              <XAxis dataKey="date" fontSize={10} stroke="var(--muted-foreground)" />
              <YAxis fontSize={10} stroke="var(--muted-foreground)" />
              <Tooltip
                contentStyle={{
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  fontSize: 12,
                }}
                formatter={(value: number) => `$${value.toLocaleString()}`}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Expected" fill="var(--spectrum-mid)" opacity={0.4} />
              <Line type="monotone" dataKey="Actual" stroke="var(--spectrum-hot)" strokeWidth={2} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="mt-4 rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
          No expected or collected cash in this range yet. Expected cash comes from each mentee's
          generated payment schedule (set a payment plan on a mentee to populate it).
        </div>
      )}
    </div>
  );
}
