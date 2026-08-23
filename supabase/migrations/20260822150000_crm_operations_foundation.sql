-- Sales CRM operations foundation: saved views, auditable bulk operations, and
-- automation rules. This migration is additive and does not alter legacy tables.

CREATE TABLE IF NOT EXISTS public.crm_saved_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  entity_type text NOT NULL CHECK (entity_type IN ('contact', 'company', 'opportunity', 'task', 'thread', 'call')),
  name text NOT NULL,
  description text,
  visibility text NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'shared')),
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  columns jsonb NOT NULL DEFAULT '[]'::jsonb,
  sort jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crm_saved_views_name_not_blank CHECK (length(btrim(name)) > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS crm_saved_views_owner_default_idx ON public.crm_saved_views(org_id, owner_user_id, entity_type) WHERE is_default;
CREATE INDEX IF NOT EXISTS crm_saved_views_org_entity_idx ON public.crm_saved_views(org_id, entity_type, created_at DESC);

CREATE TABLE IF NOT EXISTS public.crm_bulk_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  initiated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  entity_type text NOT NULL CHECK (entity_type IN ('contact', 'company', 'opportunity', 'task')),
  operation_type text NOT NULL CHECK (operation_type IN ('update', 'assign', 'create_task', 'tag', 'move_stage', 'archive')),
  selection_count integer NOT NULL CHECK (selection_count > 0),
  selection_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('queued', 'running', 'completed', 'partial', 'failed')),
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS crm_bulk_operations_org_created_idx ON public.crm_bulk_operations(org_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.crm_automation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  entity_type text NOT NULL CHECK (entity_type IN ('contact', 'company', 'opportunity', 'task', 'thread', 'call')),
  trigger_type text NOT NULL CHECK (trigger_type IN ('record_created', 'record_updated', 'stage_changed', 'task_due', 'message_received', 'call_completed', 'time_elapsed')),
  trigger_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  conditions jsonb NOT NULL DEFAULT '[]'::jsonb,
  actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_enabled boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crm_automation_rules_name_not_blank CHECK (length(btrim(name)) > 0)
);
CREATE INDEX IF NOT EXISTS crm_automation_rules_org_enabled_idx ON public.crm_automation_rules(org_id, is_enabled, entity_type);

CREATE TABLE IF NOT EXISTS public.crm_automation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  rule_id uuid NOT NULL REFERENCES public.crm_automation_rules(id) ON DELETE CASCADE,
  trigger_entity_type text NOT NULL,
  trigger_entity_id uuid,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'skipped', 'failed')),
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS crm_automation_runs_org_rule_created_idx ON public.crm_automation_runs(org_id, rule_id, created_at DESC);

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['crm_saved_views', 'crm_automation_rules']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'tg_' || tbl || '_updated', tbl);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at()', 'tg_' || tbl || '_updated', tbl);
  END LOOP;
END $$;

DO $$
DECLARE
  tbl text;
  read_policy text;
  manager_policy text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['crm_saved_views', 'crm_bulk_operations', 'crm_automation_rules', 'crm_automation_runs']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
    read_policy := 'crm_ops_read_' || tbl;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = tbl AND policyname = read_policy) THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (public.is_org_member(auth.uid(), org_id))', read_policy, tbl);
    END IF;
  END LOOP;
  FOREACH tbl IN ARRAY ARRAY['crm_saved_views', 'crm_bulk_operations', 'crm_automation_rules', 'crm_automation_runs']
  LOOP
    manager_policy := 'crm_ops_manage_' || tbl;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = tbl AND policyname = manager_policy) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL USING (public.has_org_role(auth.uid(), org_id, ARRAY[''owner'', ''admin'', ''sales_manager'']::public.app_role[])) WITH CHECK (public.has_org_role(auth.uid(), org_id, ARRAY[''owner'', ''admin'', ''sales_manager'']::public.app_role[]))',
        manager_policy, tbl
      );
    END IF;
  END LOOP;
END $$;

COMMENT ON TABLE public.crm_bulk_operations IS
  'Audit trail for CRM bulk actions. The selection snapshot keeps operations explainable without changing legacy source records.';
COMMENT ON TABLE public.crm_automation_rules IS
  'Automation definitions. Rules remain disabled by default until a durable execution worker and explicit operator activation are configured.';
