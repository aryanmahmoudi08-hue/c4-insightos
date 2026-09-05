import { supabase } from "@/integrations/supabase/client";
import type { KpiRole, TargetPeriod, TargetRecord } from "@/lib/kpi-targets";

// rep_kpi_targets is a new, additive table (see
// 20260907090000_rep_kpi_targets.sql) not yet reflected in the generated
// Supabase types — same "as never" precedent already used for team_members
// elsewhere in this app (CLAUDE.md: never hand-edit the generated file).
// RLS is the authorization boundary (read = any org member, write =
// admin/sales_manager/growth_ops/owner), matching the team_members /
// workspace-settings precedent of relying on policies rather than a
// service-role .server.ts for this shape of simple, org-scoped CRUD.

interface TargetRow {
  id: string;
  role: KpiRole;
  team_member_name: string;
  metric_key: string;
  period: TargetPeriod;
  target_value: number;
  is_active: boolean;
  effective_from: string;
  created_at: string;
}

function fromRow(row: TargetRow): TargetRecord {
  return {
    id: row.id,
    role: row.role,
    teamMemberName: row.team_member_name,
    metricKey: row.metric_key,
    period: row.period,
    targetValue: Number(row.target_value),
    isActive: row.is_active,
    effectiveFrom: row.effective_from,
    createdAt: row.created_at,
  };
}

export async function fetchRepKpiTargets(orgId: string, role?: KpiRole): Promise<TargetRecord[]> {
  let query = supabase
    .from("rep_kpi_targets" as never)
    .select(
      "id, role, team_member_name, metric_key, period, target_value, is_active, effective_from, created_at",
    )
    .eq("org_id", orgId)
    .order("effective_from", { ascending: false });
  if (role) query = query.eq("role", role);
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as unknown as TargetRow[]).map(fromRow);
}

export interface SaveTargetInput {
  orgId: string;
  role: KpiRole;
  teamMemberName: string;
  metricKey: string;
  period: TargetPeriod;
  targetValue: number;
  /** Defaults to today; pass explicitly for a scheduled future change. */
  effectiveFrom?: string;
}

const todayISO = () => new Date().toISOString().slice(0, 10);

/**
 * Upserts on (org, role, rep, metric, period, effective_from): saving again
 * the same day edits that day's draft in place, while a genuinely new
 * effective_from always creates a new historical version rather than
 * overwriting a past one.
 */
export async function saveRepKpiTarget(input: SaveTargetInput): Promise<void> {
  const { error } = await supabase.from("rep_kpi_targets" as never).upsert(
    {
      org_id: input.orgId,
      role: input.role,
      team_member_name: input.teamMemberName,
      metric_key: input.metricKey,
      period: input.period,
      target_value: input.targetValue,
      is_active: true,
      effective_from: input.effectiveFrom ?? todayISO(),
    } as never,
    { onConflict: "org_id,role,team_member_name,metric_key,period,effective_from" },
  );
  if (error) throw error;
}

/** Archives a target as of today — a new inactive version, not a delete, so periods before today keep reporting the real prior target. */
export async function archiveRepKpiTarget(input: {
  orgId: string;
  role: KpiRole;
  teamMemberName: string;
  metricKey: string;
  period: TargetPeriod;
  /** The current active target_value, carried onto the archived row (its value is irrelevant once inactive, but the column is NOT NULL). */
  lastTargetValue: number;
}): Promise<void> {
  const { error } = await supabase.from("rep_kpi_targets" as never).upsert(
    {
      org_id: input.orgId,
      role: input.role,
      team_member_name: input.teamMemberName,
      metric_key: input.metricKey,
      period: input.period,
      target_value: input.lastTargetValue,
      is_active: false,
      effective_from: todayISO(),
    } as never,
    { onConflict: "org_id,role,team_member_name,metric_key,period,effective_from" },
  );
  if (error) throw error;
}
