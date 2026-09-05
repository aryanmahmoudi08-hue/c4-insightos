import { cn } from "@/lib/utils";
import { formatKpiValue, STATUS_LABELS, type TargetProgress } from "@/lib/kpi-targets";

const STATUS_TEXT_CLASS: Record<TargetProgress["status"], string> = {
  ahead: "text-[color:var(--color-success)]",
  on_pace: "text-accent",
  behind: "text-[color:var(--color-warning)]",
  at_risk: "text-destructive",
  no_target: "text-muted-foreground",
  insufficient_data: "text-muted-foreground",
};

const STATUS_BAR_CLASS: Record<TargetProgress["status"], string> = {
  ahead: "bg-[color:var(--color-success)]",
  on_pace: "bg-accent",
  behind: "bg-[color:var(--color-warning)]",
  at_risk: "bg-destructive",
  no_target: "bg-muted-foreground/30",
  insufficient_data: "bg-muted-foreground/30",
};

/**
 * Compact target-performance card — same border/bg-card/rounded-md anatomy as
 * KpiTile, extended with a Target/Variance/Pace row (KpiTile's fixed anatomy
 * has no room for that, so this is a sibling component rather than a restyle
 * of an existing one). Handles no_target/insufficient_data as real, distinct
 * states — never a fabricated 0%.
 */
export function KpiTargetCard({
  label,
  progress,
  onClick,
}: {
  label: string;
  progress: TargetProgress;
  onClick?: () => void;
}) {
  const { status, format, targetValue, actualValue, percentOfTarget, reason } = progress;
  const barPct = percentOfTarget != null ? Math.max(2, Math.min(100, percentOfTarget)) : 0;
  const Wrapper = onClick ? "button" : "div";

  return (
    <Wrapper
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "hover-lift group flex w-full flex-col overflow-hidden rounded-md border border-border bg-card text-left",
        onClick && "cursor-pointer",
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/40 px-3 py-1.5">
        <span className="text-3xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <span
          className={cn(
            "rounded px-1.5 py-0.5 text-3xs font-semibold uppercase tracking-wide",
            STATUS_TEXT_CLASS[status],
            "bg-current/10",
          )}
        >
          {STATUS_LABELS[status]}
        </span>
      </div>
      <div className="flex flex-col gap-1.5 px-3 py-2.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-mono text-lg font-bold tabular-nums">
            {actualValue != null ? formatKpiValue(format, actualValue) : "—"}
          </span>
          <span className="text-3xs text-muted-foreground">
            {targetValue != null
              ? `Target ${formatKpiValue(format, targetValue)}`
              : "No target configured"}
          </span>
        </div>
        {targetValue != null && actualValue != null && (
          <div className="h-1.5 w-full overflow-hidden rounded bg-muted/40">
            <div
              className={cn("h-full rounded transition-all", STATUS_BAR_CLASS[status])}
              style={{ width: `${barPct}%` }}
            />
          </div>
        )}
        <div className="text-3xs leading-snug text-muted-foreground">{reason}</div>
      </div>
    </Wrapper>
  );
}
