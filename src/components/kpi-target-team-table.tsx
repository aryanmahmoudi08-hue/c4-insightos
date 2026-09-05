import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Target } from "lucide-react";
import { GlassTableShell } from "@/components/glass-table";
import { EmptyState } from "@/components/empty-state";
import { cn } from "@/lib/utils";
import {
  computeTargetProgress,
  formatKpiValue,
  kpiDefinition,
  periodWindow,
  STATUS_LABELS,
  type TargetRecord,
} from "@/lib/kpi-targets";
import {
  actualFromCalls,
  actualFromSetterActivity,
  sliceCallsToWindow,
  sliceSetterActivityToWindow,
  type CallActualRow,
  type SetterActivityActualRow,
} from "@/lib/rep-kpi-actuals";

const STATUS_TEXT_CLASS: Record<string, string> = {
  ahead: "text-[color:var(--color-success)]",
  on_pace: "text-accent",
  behind: "text-[color:var(--color-warning)]",
  at_risk: "text-destructive",
  no_target: "text-muted-foreground",
  insufficient_data: "text-muted-foreground",
};

type SortKey = "rep" | "kpi" | "actual" | "attainment" | "variance" | "status";

/**
 * The Priority-9 team/manager comparison view: one row per currently-active
 * target across every rep and role. Actuals are sliced from whatever rows
 * the caller already fetched for the widest window needed (month start →
 * anchor) — each target's own period window is carved out of that in
 * memory, so a daily target and a monthly target on the same rep each get
 * their own correct actual without a second round-trip per row.
 */
export function KpiTargetTeamTable({
  targets,
  setterActivityRows,
  callRows,
  anchorISODate,
  onSelectRow,
}: {
  targets: TargetRecord[];
  setterActivityRows: SetterActivityActualRow[];
  callRows: CallActualRow[];
  anchorISODate: string;
  onSelectRow?: (t: TargetRecord) => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("status");
  const [sortDir, setSortDir] = useState<1 | -1>(1);

  const rows = useMemo(() => {
    return targets.map((t) => {
      const def = kpiDefinition(t.role, t.metricKey);
      const window = periodWindow(t.period, anchorISODate);
      const actual =
        t.role === "closer"
          ? actualFromCalls(
              sliceCallsToWindow(callRows, window.start, window.end),
              t.teamMemberName,
              t.metricKey,
            )
          : actualFromSetterActivity(
              sliceSetterActivityToWindow(setterActivityRows, window.start, window.end),
              t.teamMemberName,
              t.metricKey,
            );
      const progress = computeTargetProgress({
        format: def?.format ?? "count",
        period: t.period,
        anchorISODate,
        targetValue: t.targetValue,
        actualValue: actual,
      });
      return { target: t, def, window, progress };
    });
  }, [targets, setterActivityRows, callRows, anchorISODate]);

  const sorted = useMemo(() => {
    const arr = [...rows];
    const rank: Record<string, number> = {
      at_risk: 0,
      behind: 1,
      on_pace: 2,
      ahead: 3,
      insufficient_data: 4,
      no_target: 5,
    };
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "rep":
          cmp = a.target.teamMemberName.localeCompare(b.target.teamMemberName);
          break;
        case "kpi":
          cmp = (a.def?.label ?? a.target.metricKey).localeCompare(
            b.def?.label ?? b.target.metricKey,
          );
          break;
        case "actual":
          cmp = (a.progress.actualValue ?? -Infinity) - (b.progress.actualValue ?? -Infinity);
          break;
        case "attainment":
          cmp =
            (a.progress.percentOfTarget ?? -Infinity) - (b.progress.percentOfTarget ?? -Infinity);
          break;
        case "variance":
          cmp =
            (a.progress.varianceVsExpected ?? -Infinity) -
            (b.progress.varianceVsExpected ?? -Infinity);
          break;
        case "status":
          cmp = rank[a.progress.status] - rank[b.progress.status];
          break;
      }
      return cmp * sortDir;
    });
    return arr;
  }, [rows, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortKey(key);
      setSortDir(1);
    }
  };

  const Header = ({
    label,
    sk,
    align = "left",
  }: {
    label: string;
    sk: SortKey;
    align?: "left" | "right";
  }) => (
    <th
      className={cn(
        "p-3 cursor-pointer select-none hover:text-foreground",
        align === "right" ? "text-right" : "text-left",
      )}
      onClick={() => toggleSort(sk)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {sortKey === sk ? (
          sortDir === 1 ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-30" />
        )}
      </span>
    </th>
  );

  return (
    <GlassTableShell>
      <table className="w-full text-sm">
        <thead className="sticky-thead bg-muted/40 text-2xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <Header label="Rep" sk="rep" />
            <Header label="KPI" sk="kpi" />
            <Header label="Actual" sk="actual" align="right" />
            <th className="p-3 text-right font-mono">Target</th>
            <Header label="Variance" sk="variance" align="right" />
            <Header label="% to Goal" sk="attainment" align="right" />
            <Header label="Status" sk="status" />
          </tr>
        </thead>
        <tbody>
          {sorted.map(({ target, def, progress }) => (
            <tr
              key={target.id}
              className={cn(
                "border-t border-border/70",
                onSelectRow && "cursor-pointer hover:bg-muted/20",
              )}
              onClick={() => onSelectRow?.(target)}
            >
              <td className="p-3 font-medium">{target.teamMemberName}</td>
              <td className="p-3">{def?.label ?? target.metricKey}</td>
              <td className="p-3 text-right font-mono">
                {progress.actualValue != null
                  ? formatKpiValue(progress.format, progress.actualValue)
                  : "—"}
              </td>
              <td className="p-3 text-right font-mono text-muted-foreground">
                {formatKpiValue(progress.format, target.targetValue)}
              </td>
              <td className="p-3 text-right font-mono">
                {progress.varianceVsExpected != null ? (
                  <span
                    className={
                      progress.varianceVsExpected >= 0
                        ? "text-[color:var(--color-success)]"
                        : "text-destructive"
                    }
                  >
                    {progress.varianceVsExpected >= 0 ? "+" : ""}
                    {formatKpiValue(progress.format, progress.varianceVsExpected)}
                  </span>
                ) : (
                  "—"
                )}
              </td>
              <td className="p-3 text-right font-mono">
                {progress.percentOfTarget != null ? `${progress.percentOfTarget.toFixed(0)}%` : "—"}
              </td>
              <td className="p-3">
                <span
                  className={cn(
                    "text-2xs font-semibold uppercase tracking-wide",
                    STATUS_TEXT_CLASS[progress.status],
                  )}
                >
                  {STATUS_LABELS[progress.status as keyof typeof STATUS_LABELS]}
                </span>
                <div className="text-3xs text-muted-foreground">{progress.reason}</div>
              </td>
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={7}>
                <EmptyState
                  icon={<Target className="h-4 w-4" />}
                  title="No targets configured yet"
                />
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </GlassTableShell>
  );
}
