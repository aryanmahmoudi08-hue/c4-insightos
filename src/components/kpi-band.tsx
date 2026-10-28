import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { KpiCard } from "@/components/kpi-card";
import type { SpectrumPosition, KpiEmphasis } from "@/lib/spectrum";

export interface KpiBandItem {
  key: string;
  label: string;
  value: string;
  spectrum: SpectrumPosition;
  deltaPct?: number;
  priorValue?: string;
  featured?: boolean;
  /** Opts this one tile into the gradient-KPI-card treatment (see
   * MetricCard) — deliberately separate from `featured`, which several
   * bands set on most/all of their items and was never actually wired to
   * a visual effect. Leave unset (the default, no gradient) unless this is
   * genuinely one of the 1-3 top-tier metrics in the band. */
  emphasis?: KpiEmphasis;
  wide?: boolean;
  empty?: boolean;
  emptyHint?: string;
  onClick?: () => void;
  icon?: React.ReactNode;
  spark?: number[];
  sparkLabels?: string[];
  /** Every other tile in this band is "more is good" (cash, closes, sets —
   * up renders success-green, down renders destructive-red). A handful of
   * metrics (disqualified leads, failed payments, churn) are the opposite —
   * an increase is the bad direction. Set `invert` so the delta color
   * follows the metric's real meaning instead of its raw sign; the arrow
   * itself still points the way the number actually moved. */
  invert?: boolean;
  sparkVariant?: "line" | "bar";
  /** Replaces the whole "vs {priorValue} prior" supporting line verbatim —
   * for a metric whose supporting line needs to carry a rate + its base
   * (e.g. "12.3% of 24 shows"), not the prior-period comparison. Wins over
   * `priorValue` when both are set. */
  supportingOverride?: string;
}

export function KpiBand({
  items,
  title = "Key metrics",
}: {
  items: KpiBandItem[];
  title?: string;
}) {
  return (
    <div className="relative">
      <div className="mb-3.5 flex items-center gap-2.5">
        <span className="h-3.5 w-[3px] rounded-full bg-accent" aria-hidden />
        <span className="text-2xs font-bold uppercase tracking-[0.14em] text-foreground">
          {title}
        </span>
        <span className="h-px flex-1 bg-border" aria-hidden />
      </div>
      <div className="grid gap-3.5 overflow-visible sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {items.map((it) => {
          const hasDelta = it.deltaPct !== undefined && Number.isFinite(it.deltaPct);
          const up = hasDelta && it.deltaPct! > 0.5;
          const down = hasDelta && it.deltaPct! < -0.5;
          const DeltaIcon = up ? ArrowUpRight : down ? ArrowDownRight : Minus;
          const goodDirection = it.invert ? down : up;
          const badDirection = it.invert ? up : down;
          const trend = hasDelta ? (
            <span
              className="inline-flex items-center gap-1"
              style={
                {
                  color: goodDirection
                    ? "var(--color-success)"
                    : badDirection
                      ? "var(--destructive)"
                      : "var(--muted-foreground)",
                } as React.CSSProperties
              }
            >
              <DeltaIcon className="h-3 w-3" />
              {Math.abs(it.deltaPct!).toFixed(0)}%
            </span>
          ) : undefined;
          const supporting = it.empty ? (
            (it.emptyHint ?? "—")
          ) : it.supportingOverride ? (
            it.supportingOverride
          ) : it.priorValue ? (
            <>vs {it.priorValue} prior</>
          ) : undefined;
          return (
            <KpiCard
              key={it.key}
              label={it.label}
              value={it.empty ? "—" : it.value}
              supporting={supporting}
              trend={trend}
              icon={it.icon}
              spark={it.spark}
              sparkLabels={it.sparkLabels}
              sparkVariant={it.sparkVariant}
              spectrum={it.spectrum}
              emphasis={it.emphasis}
              onClick={it.onClick}
              className={it.wide ? "sm:col-span-2" : undefined}
            />
          );
        })}
      </div>
    </div>
  );
}
