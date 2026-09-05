-- Rep KPI Target Engine (Priority 2). Targets are effective-dated, append-only
-- rows rather than in-place edits: changing a rep's target inserts a NEW row
-- with a later effective_from instead of overwriting the old one, so a target
-- change in October never silently rewrites September's reporting. "Archive"
-- is the same mechanism — insert a new version with is_active=false — so a
-- target that's later archived still resolves correctly for periods before
-- the archive date. Resolving "the current target as of date D" is always
-- "the row with the latest effective_from <= D"; if that row has
-- is_active=false, the correct read is "no target from D forward."
--
-- team_member_name is free text (not a user_id) to match the rest of the
-- rep-activity system: team_members has no populated user_id column anywhere
-- in the app (reps are picked by name in EOD forms, setter_activity and
-- calls key on team_member_name/closer_name, not an auth identity) — so
-- targets key the same way, matching setter_activity.team_member_name and
-- calls.closer_name.
CREATE TABLE IF NOT EXISTS public.rep_kpi_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('dm_setter', 'inbound_dialer', 'closer')),
  team_member_name text NOT NULL,
  -- Kept in sync with the approved KPI_DEFINITIONS catalogue in
  -- src/lib/kpi-targets.ts — only metrics with a defensible real data source
  -- are ever exposed to the admin UI, and this CHECK is defense-in-depth
  -- against a row being inserted outside that UI.
  metric_key text NOT NULL CHECK (metric_key IN (
    -- DM Setter
    'outbound_dms_sent', 'inbound_dms_sent', 'replies', 'qualified_convos_setter',
    'calls_on_calendar_setter', 'live_calls_setter',
    -- Inbound Dialer
    'dials', 'connections', 'leads_contacted', 'qualified_convos_dialer',
    'calls_on_calendar_dialer', 'live_calls_dialer', 'speed_to_lead_sla_pct',
    -- Closer
    'offers_made', 'closes', 'close_rate_pct', 'cash_collected_cents',
    'contract_value_cents', 'follow_ups_logged', 'shows'
  )),
  period text NOT NULL CHECK (period IN ('daily', 'weekly', 'monthly')),
  target_value numeric NOT NULL CHECK (target_value >= 0),
  is_active boolean NOT NULL DEFAULT true,
  effective_from date NOT NULL DEFAULT current_date,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Same-day re-saves upsert onto this row instead of stacking multiple
  -- "versions" for one calendar day; a genuinely new version (a real target
  -- change) always carries a later effective_from.
  UNIQUE (org_id, role, team_member_name, metric_key, period, effective_from)
);

CREATE INDEX IF NOT EXISTS rep_kpi_targets_lookup_idx
  ON public.rep_kpi_targets (org_id, role, team_member_name, metric_key, period, effective_from DESC);

ALTER TABLE public.rep_kpi_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rep_kpi_targets_org_read" ON public.rep_kpi_targets FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), org_id));

-- Admins/managers configure targets; reps (setter/closer/viewer) can see
-- theirs but never write — matches this org's existing has_org_role
-- convention for manager-tier write policies (e.g. vsl_recommendations,
-- funnel_instrument settings).
CREATE POLICY "rep_kpi_targets_manager_write" ON public.rep_kpi_targets FOR ALL TO authenticated
  USING (public.has_org_role(auth.uid(), org_id, ARRAY['owner', 'admin', 'sales_manager', 'growth_ops']::app_role[]))
  WITH CHECK (public.has_org_role(auth.uid(), org_id, ARRAY['owner', 'admin', 'sales_manager', 'growth_ops']::app_role[]));
