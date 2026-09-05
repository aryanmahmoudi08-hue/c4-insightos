import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GlassTableShell } from "@/components/glass-table";
import { EmptyState } from "@/components/empty-state";
import { Target, Archive } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import {
  KPI_DEFINITIONS,
  STATUS_LABELS,
  currentTargetsAsOf,
  formatKpiValue,
  kpiDefinition,
  type KpiRole,
  type TargetPeriod,
  type TargetRecord,
} from "@/lib/kpi-targets";
import { archiveRepKpiTarget, fetchRepKpiTargets, saveRepKpiTarget } from "@/lib/rep-kpi-targets";

const ROLE_LABELS: Record<KpiRole, string> = {
  dm_setter: "DM Setter",
  inbound_dialer: "Inbound Dialer",
  closer: "Closer",
};
const PERIOD_LABELS: Record<TargetPeriod, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};
const todayISO = () => new Date().toISOString().slice(0, 10);

// devBypass never has a real Supabase session, so the RLS-scoped queries/
// writes below would come back empty/no-op — same reasoning as every other
// genuinely interactive workflow in this app. Local state makes the whole
// configure → save → see it listed loop actually testable in the sandbox.
let devTargetSeq = 0;

export function KpiTargetAdmin({
  orgId,
  roster,
  canManage,
  devTargets,
  setDevTargets,
}: {
  orgId: string | undefined;
  roster: { name: string; role: KpiRole; active: boolean }[];
  canManage: boolean;
  /**
   * Lifted to the parent (Team page) rather than owned locally, so the same
   * devBypass-only rows also show up in the team-wide KpiTargetTeamTable
   * above this panel — otherwise saving a target here would only ever be
   * visible in this component's own listing.
   */
  devTargets: TargetRecord[];
  setDevTargets: Dispatch<SetStateAction<TargetRecord[]>>;
}) {
  const { devBypass } = useAuth();
  const qc = useQueryClient();

  const [role, setRole] = useState<KpiRole>("closer");
  const [repName, setRepName] = useState<string>("");
  const [metricKey, setMetricKey] = useState<string>(KPI_DEFINITIONS.closer[0].key);
  const [period, setPeriod] = useState<TargetPeriod>("monthly");
  const [targetValue, setTargetValue] = useState<string>("");

  const { data: realTargets } = useQuery({
    queryKey: ["rep-kpi-targets", orgId],
    enabled: !!orgId && !devBypass,
    queryFn: () => fetchRepKpiTargets(orgId!),
  });
  const current = useMemo(
    () => currentTargetsAsOf(devBypass ? devTargets : (realTargets ?? []), todayISO()),
    [devBypass, devTargets, realTargets],
  );

  const repsForRole = roster.filter((r) => r.role === role && r.active);

  const save = useMutation({
    mutationFn: async () => {
      const value = Number(targetValue);
      if (!repName) throw new Error("Select a rep");
      if (!Number.isFinite(value) || value < 0) throw new Error("Enter a valid target value");
      if (devBypass) {
        const id = `dev-${++devTargetSeq}`;
        setDevTargets((prev) => [
          ...prev.filter(
            (t) =>
              !(
                t.role === role &&
                t.teamMemberName === repName &&
                t.metricKey === metricKey &&
                t.period === period &&
                t.effectiveFrom === todayISO()
              ),
          ),
          {
            id,
            role,
            teamMemberName: repName,
            metricKey,
            period,
            targetValue: value,
            isActive: true,
            effectiveFrom: todayISO(),
            createdAt: new Date().toISOString(),
          },
        ]);
        return;
      }
      await saveRepKpiTarget({
        orgId: orgId!,
        role,
        teamMemberName: repName,
        metricKey,
        period,
        targetValue: value,
      });
    },
    onSuccess: () => {
      toast.success("Target saved");
      setTargetValue("");
      if (!devBypass) qc.invalidateQueries({ queryKey: ["rep-kpi-targets", orgId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to save target"),
  });

  const archive = useMutation({
    mutationFn: async (t: TargetRecord) => {
      if (devBypass) {
        setDevTargets((prev) => [
          ...prev.filter(
            (x) =>
              !(
                x.role === t.role &&
                x.teamMemberName === t.teamMemberName &&
                x.metricKey === t.metricKey &&
                x.period === t.period &&
                x.effectiveFrom === todayISO()
              ),
          ),
          {
            ...t,
            id: `dev-${++devTargetSeq}`,
            isActive: false,
            effectiveFrom: todayISO(),
            createdAt: new Date().toISOString(),
          },
        ]);
        return;
      }
      await archiveRepKpiTarget({
        orgId: orgId!,
        role: t.role,
        teamMemberName: t.teamMemberName,
        metricKey: t.metricKey,
        period: t.period,
        lastTargetValue: t.targetValue,
      });
    },
    onSuccess: () => {
      toast.success("Target archived");
      if (!devBypass) qc.invalidateQueries({ queryKey: ["rep-kpi-targets", orgId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to archive target"),
  });

  if (!canManage) {
    return (
      <EmptyState
        icon={<Target className="h-4 w-4" />}
        title="Targets are configured by an admin or sales manager"
      />
    );
  }

  return (
    <div className="space-y-4" data-testid="kpi-target-admin">
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Target className="h-3.5 w-3.5" /> Configure a target
        </div>
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
          <Select
            value={role}
            onValueChange={(v) => {
              const r = v as KpiRole;
              setRole(r);
              setRepName("");
              setMetricKey(KPI_DEFINITIONS[r][0].key);
            }}
          >
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder="Role" />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(ROLE_LABELS) as KpiRole[]).map((r) => (
                <SelectItem key={r} value={r}>
                  {ROLE_LABELS[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={repName} onValueChange={setRepName}>
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder="Rep" />
            </SelectTrigger>
            <SelectContent>
              {repsForRole.length === 0 && (
                <div className="px-2 py-1.5 text-xs text-muted-foreground">
                  No active reps for this role
                </div>
              )}
              {repsForRole.map((r) => (
                <SelectItem key={r.name} value={r.name}>
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={metricKey} onValueChange={setMetricKey}>
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder="KPI" />
            </SelectTrigger>
            <SelectContent>
              {KPI_DEFINITIONS[role].map((d) => (
                <SelectItem key={d.key} value={d.key}>
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={period} onValueChange={(v) => setPeriod(v as TargetPeriod)}>
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder="Period" />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(PERIOD_LABELS) as TargetPeriod[]).map((p) => (
                <SelectItem key={p} value={p}>
                  {PERIOD_LABELS[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex gap-2">
            <Input
              type="number"
              min={0}
              placeholder="Target value"
              value={targetValue}
              onChange={(e) => setTargetValue(e.target.value)}
              className="h-9 text-xs"
            />
            <Button
              size="sm"
              className="h-9 shrink-0"
              disabled={save.isPending}
              onClick={() => save.mutate()}
            >
              Save
            </Button>
          </div>
        </div>
      </div>

      <GlassTableShell>
        <table className="w-full text-sm">
          <thead className="sticky-thead bg-muted/40 text-2xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="p-3 text-left">Rep</th>
              <th className="p-3 text-left">Role</th>
              <th className="p-3 text-left">KPI</th>
              <th className="p-3 text-left">Period</th>
              <th className="p-3 text-right font-mono">Target</th>
              <th className="p-3 text-left">Last updated</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {current
              .slice()
              .sort((a, b) => a.teamMemberName.localeCompare(b.teamMemberName))
              .map((t) => {
                const def = kpiDefinition(t.role, t.metricKey);
                return (
                  <tr key={t.id} className="border-t border-border/70">
                    <td className="p-3 font-medium">{t.teamMemberName}</td>
                    <td className="p-3 text-muted-foreground">{ROLE_LABELS[t.role]}</td>
                    <td className="p-3">{def?.label ?? t.metricKey}</td>
                    <td className="p-3 text-muted-foreground">{PERIOD_LABELS[t.period]}</td>
                    <td className="p-3 text-right font-mono">
                      {def ? formatKpiValue(def.format, t.targetValue) : t.targetValue}
                    </td>
                    <td className="p-3 text-2xs text-muted-foreground">
                      {new Date(t.createdAt).toLocaleDateString()}
                    </td>
                    <td className="p-3 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 gap-1 text-2xs"
                        disabled={archive.isPending}
                        onClick={() => archive.mutate(t)}
                      >
                        <Archive className="h-3 w-3" /> Archive
                      </Button>
                    </td>
                  </tr>
                );
              })}
            {current.length === 0 && (
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
      <div className="text-3xs text-muted-foreground">
        {STATUS_LABELS.no_target} shows on rep dashboards for any KPI without a row here — never a
        fabricated 0%.
      </div>
    </div>
  );
}
