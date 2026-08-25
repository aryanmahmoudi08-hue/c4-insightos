import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { SPECTRUM_TEXT_CLASS, type SpectrumPosition } from "@/lib/spectrum";

export interface KpiBandItem {
  key: string;
  label: string;
  value: string;
  spectrum: SpectrumPosition;
  deltaPct?: number;
  priorValue?: string;
  /** Money/outcome metrics read larger within the band — this is where "Cash Collected reads several times larger" lives now, via type scale in one row rather than a standalone hero card. */
  featured?: boolean;
  /** Confirmed real bug (Sales Tracking Part 2): a featured money value like
   * "$114,000.00" genuinely overflows the grid's 130px-min column at
   * text-2xl with no truncate/step-down safeguard. Spans 2 grid columns
   * instead of shrinking the font — real room, not a fit-to-box hack. Only
   * meaningful on featured items; a no-op otherwise. */
  wide?: boolean;
  empty?: boolean;
  emptyHint?: string;
  onClick?: () => void;
}

/**
 * One thin, hairline-divided row — value + delta% + prior-period value inline
 * per metric — instead of a grid of tall boxes. Every primary count/money
 * metric for the page lives here, cold→hot order.
 *
 * Wrapped in the same card shell (`hover-lift` + `glass-highlight` inset +
 * a text-label header) `FunnelInstrument`/`MoneyInstrument` use — this band
 * sits directly beside those on the page and previously had no header at
 * all, reading as a flat placeholder strip instead of a titled card like
 * every sibling around it.
 */
export function KpiBand({
  items,
  title = "Key metrics",
}: {
  items: KpiBandItem[];
  title?: string;
}) {
  return (
    <div className="hover-lift relative overflow-hidden rounded-xl border border-border bg-card p-4">
      <div className="glass-highlight pointer-events-none absolute inset-0 rounded-xl" />
      <div className="relative mb-2 text-3xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {title}
      </div>
      <div
        className="relative grid overflow-hidden rounded-lg border border-border/60"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))" }}
      >
        {items.map((it, i) => {
          const hasDelta = it.deltaPct !== undefined && Number.isFinite(it.deltaPct);
          const up = hasDelta && it.deltaPct! > 0.5;
          const down = hasDelta && it.deltaPct! < -0.5;
          const DeltaIcon = up ? TrendingUp : down ? TrendingDown : Minus;
          return (
            <button
              key={it.key}
              type="button"
              onClick={it.onClick}
              disabled={!it.onClick}
              style={it.wide ? { gridColumn: "span 2" } : undefined}
              className={cn(
                "border-border/60 px-4 py-3.5 text-left transition-colors",
                i > 0 && "border-l",
                it.onClick && "cursor-pointer hover:bg-muted/20",
              )}
            >
              <div
                title={it.label}
                className="truncate text-3xs font-semibold uppercase tracking-wider text-muted-foreground"
              >
                {it.label}
              </div>
              {it.empty ? (
                <div className="mt-1 text-3xs leading-tight text-muted-foreground/70">
                  {it.emptyHint ?? "—"}
                </div>
              ) : (
                <>
                  <div className="mt-1 flex flex-wrap items-baseline gap-1.5">
                    <span
                      className={cn(
                        "font-mono font-bold tabular-nums",
                        it.featured ? "text-2xl" : "text-lg",
                        SPECTRUM_TEXT_CLASS[it.spectrum],
                      )}
                    >
                      {it.value}
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
                        {Math.abs(it.deltaPct!).toFixed(0)}%
                      </span>
                    )}
                  </div>
                  {it.priorValue && (
                    <div className="mt-0.5 text-3xs text-muted-foreground">
                      vs {it.priorValue} prior
                    </div>
                  )}
                </>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
