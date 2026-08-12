import { motion } from "motion/react";
import { Trophy, X } from "lucide-react";
import { AvatarInitials } from "@/components/ui/avatar-initials";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateRangePicker, type DateRange } from "@/components/date-range-picker";
import { SPRING } from "@/lib/motion-tokens";
import { SPECTRUM_VAR, SPECTRUM_TEXT_CLASS, type SpectrumPosition } from "@/lib/spectrum";

export interface RepMetricOption<P> {
  key: string;
  label: string;
  /** Funnel position (B4) — drives the value color and progress-bar fill for this metric. */
  spectrum: SpectrumPosition;
  primary: (p: P) => string;
  secondary: (p: P) => string;
  rankBy: (p: P) => number;
}

interface RepLeaderboardProps<P extends { name: string }> {
  titlePrefix: string;
  metrics: RepMetricOption<P>[];
  metricKey: string;
  onMetricChange: (key: string) => void;
  people: P[];
  emptyLabel: string;
  dateRange: DateRange;
  onDateRangeChange: (r: DateRange) => void;
  overridden: boolean;
  onResetRange: () => void;
}

/**
 * Shared rep leaderboard (Part C3) — Closer, DM Setter, and Inbound Dialer all
 * render this same component with role-specific metric option lists. Rank,
 * primary figure, progress bar color, and secondary line all follow the
 * selected metric; rows spring-reorder (B5 signature moment) via `layout`.
 * The date range is independent of the page range by default (inherits it
 * until the caller passes an override), with a clear "Custom range" indicator.
 */
export function RepLeaderboard<P extends { name: string }>({
  titlePrefix, metrics, metricKey, onMetricChange, people, emptyLabel,
  dateRange, onDateRangeChange, overridden, onResetRange,
}: RepLeaderboardProps<P>) {
  const metric = metrics.find((m) => m.key === metricKey) ?? metrics[0];
  const sorted = [...people].sort((a, b) => metric.rankBy(b) - metric.rankBy(a)).slice(0, 6);
  const maxVal = Math.max(1, ...sorted.map(metric.rankBy));

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="border-b border-border bg-muted/30 px-4 py-2.5 space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider">
            <Trophy className="h-3.5 w-3.5 text-[color:var(--color-success)]" />
            {titlePrefix} · by {metric.label}
          </div>
          <Select value={metricKey} onValueChange={onMetricChange}>
            <SelectTrigger className="h-7 w-[172px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{metrics.map((m) => <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <DateRangePicker value={dateRange} onChange={onDateRangeChange} />
          {overridden && (
            <button type="button" onClick={onResetRange}
              className="flex items-center gap-1 rounded-full bg-spectrum-mid/15 px-2 py-0.5 text-3xs font-medium text-spectrum-mid transition-colors hover:bg-spectrum-mid/25">
              Custom range <X className="h-2.5 w-2.5" />
            </button>
          )}
        </div>
      </div>
      <div className="divide-y divide-border">
        {sorted.map((p, i) => (
          <motion.div key={p.name} layout transition={SPRING.bouncy} className="hover-lift flex items-center gap-3 px-4 py-2.5">
            <div className="grid h-6 w-6 place-items-center rounded-md bg-muted text-3xs font-mono font-bold text-muted-foreground">{i + 1}</div>
            <AvatarInitials name={p.name} size="sm" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{p.name}</div>
              <div className="mt-1 h-1.5 w-full rounded bg-muted/40 overflow-hidden">
                <motion.div
                  className="h-full rounded"
                  style={{ background: SPECTRUM_VAR[metric.spectrum] }}
                  initial={false}
                  animate={{ width: `${Math.min(100, (metric.rankBy(p) / maxVal) * 100)}%` }}
                  transition={SPRING.gentle}
                />
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className={`font-mono text-sm font-semibold ${SPECTRUM_TEXT_CLASS[metric.spectrum]}`}>{metric.primary(p)}</div>
              <div className="text-3xs text-muted-foreground">{metric.secondary(p)}</div>
            </div>
          </motion.div>
        ))}
        {sorted.length === 0 && <div className="p-8 text-center text-xs text-muted-foreground">{emptyLabel}</div>}
      </div>
    </div>
  );
}
