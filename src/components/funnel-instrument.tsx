import { Activity } from "lucide-react";
import { SPECTRUM_VAR } from "@/lib/spectrum";
import type { FunnelStage } from "@/lib/funnel-derivation";

/**
 * Funnel stages rendered as full-width horizontal rows. This intentionally
 * avoids the old capsule and constrained chart-column layouts so labels remain
 * readable at every viewport size.
 */
export function FunnelInstrument({
  title,
  subtitle,
  stages,
  onStageClick,
}: {
  title: string;
  subtitle?: string;
  stages: FunnelStage[];
  /** Opens the metric detail panel for the clicked stage. */
  onStageClick?: (index: number) => void;
}) {
  const allZero = stages.every((stage) => stage.value === 0);
  const maxValue = Math.max(1, ...stages.map((stage) => stage.value));

  return (
    <div className="hover-lift relative flex h-full flex-col overflow-hidden rounded-2xl border border-border/80 bg-gradient-to-br from-card via-card to-background/70 p-4 shadow-[0_18px_52px_-40px_rgba(148,163,184,0.55)]">
      <div className="glass-highlight pointer-events-none absolute inset-0 rounded-2xl" />

      <div className="relative flex items-start justify-between gap-3 border-b border-border/70 pb-3">
        <div className="min-w-0">
          <div className="text-3xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {title}
          </div>
          {subtitle && <div className="mt-1 text-sm text-foreground/80">{subtitle}</div>}
        </div>
        <span className="h-2 w-2 shrink-0 rounded-full bg-muted-foreground/70 shadow-[0_0_10px_rgba(148,163,184,0.55)]" />
      </div>

      <div className="relative mt-4 flex w-full flex-col gap-2">
        {stages.map((stage, index) => {
          const previous = stages[index - 1];
          const conversion =
            previous && previous.value > 0 ? (stage.value / previous.value) * 100 : null;
          const progress = stage.value > 0 ? Math.max(8, (stage.value / maxValue) * 100) : 8;

          return (
            <button
              key={stage.key}
              type="button"
              onClick={onStageClick ? () => onStageClick(index) : undefined}
              className="flex w-full items-center justify-between gap-4 rounded-lg border border-border/70 bg-muted/20 p-3 text-left transition-colors hover:border-border hover:bg-muted/30"
            >
              <span className="min-w-0 flex-1">
                <span className="block whitespace-normal text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {stage.label}
                </span>
                {conversion !== null && (
                  <span className="mt-1 inline-flex text-3xs font-medium text-muted-foreground">
                    {conversion.toFixed(1)}% of prior stage
                  </span>
                )}
                <span className="mt-2 block h-1 w-full rounded-full bg-muted/60">
                  <span
                    className="block h-full rounded-full transition-[width]"
                    style={{ width: `${progress}%`, background: SPECTRUM_VAR[stage.spectrum] }}
                  />
                </span>
              </span>
              <span className="shrink-0 font-sans text-2xl font-semibold tabular-nums text-foreground">
                {stage.value.toLocaleString()}
              </span>
            </button>
          );
        })}
      </div>

      {allZero && (
        <div className="relative mt-4 flex w-full items-center gap-3 rounded-lg border border-dashed border-border bg-background/35 px-4 py-3">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-border bg-card text-muted-foreground">
            <Activity className="h-4 w-4" />
          </div>
          <div>
            <div className="text-xs font-medium text-foreground">No activity logged yet</div>
            <div className="mt-0.5 text-3xs text-muted-foreground">
              Log a day to see this funnel fill in.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default FunnelInstrument;
