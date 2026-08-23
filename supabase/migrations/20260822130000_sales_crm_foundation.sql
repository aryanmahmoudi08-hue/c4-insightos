-- Sales CRM foundation — additive and compatibility-first.
--
-- This migration intentionally does NOT alter, delete, rename, or backfill legacy
-- sales tables. Existing leads, calls, messages, clients, and payments remain
-- authoritative. New CRM records retain optional, FK-backed legacy references.

-- 1. Independent CRM people and account entities.
CREATE TABLE IF NOT EXISTS public.crm_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  legacy_lead_id uuid UNIQUE REFERENCES public.leads(id) ON DELETE RESTRICT,
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  first_name text,
  last_name text,
  display_name text NOT NULL,
  primary_email text,
  primary_phone text,
  social_handle text,
  lifecycle_status text NOT NULL DEFAULT 'new',
  source text,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crm_contacts_display_name_not_blank CHECK (length(btrim(display_name)) > 0)
);
CREATE INDEX IF NOT EXISTS crm_contacts_org_created_idx ON public.crm_contacts(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS crm_contacts_org_owner_idx ON public.crm_contacts(org_id, owner_user_id);
CREATE INDEX IF NOT EXISTS crm_contacts_org_email_idx ON public.crm_contacts(org_id, lower(primary_email));
CREATE INDEX IF NOT EXISTS crm_contacts_org_phone_idx ON public.crm_contacts(org_id, primary_phone);

CREATE TABLE IF NOT EXISTS public.crm_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name text NOT NULL,
  domain text,
  website text,
  industry text,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crm_companies_name_not_blank CHECK (length(btrim(name)) > 0)
);
CREATE INDEX IF NOT EXISTS crm_companies_org_created_idx ON public.crm_companies(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS crm_companies_org_owner_idx ON public.crm_companies(org_id, owner_user_id);
CREATE INDEX IF NOT EXISTS crm_companies_org_name_idx ON public.crm_companies(org_id, lower(name));

CREATE TABLE IF NOT EXISTS public.crm_company_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.crm_companies(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
  title text,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, contact_id)
);
CREATE INDEX IF NOT EXISTS crm_company_contacts_org_contact_idx ON public.crm_company_contacts(org_id, contact_id);
CREATE INDEX IF NOT EXISTS crm_company_contacts_org_company_idx ON public.crm_company_contacts(org_id, company_id);

-- 2. Configurable deal pipelines and an explicit legacy-stage mapping catalogue.
CREATE TABLE IF NOT EXISTS public.crm_pipelines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  is_default boolean NOT NULL DEFAULT false,
  is_archived boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crm_pipelines_name_not_blank CHECK (length(btrim(name)) > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS crm_pipelines_one_default_per_org_idx ON public.crm_pipelines(org_id) WHERE is_default AND NOT is_archived;
CREATE UNIQUE INDEX IF NOT EXISTS crm_pipelines_name_per_org_idx ON public.crm_pipelines(org_id, lower(name));

CREATE TABLE IF NOT EXISTS public.crm_pipeline_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  pipeline_id uuid NOT NULL REFERENCES public.crm_pipelines(id) ON DELETE CASCADE,
  name text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  probability numeric(5,2) NOT NULL DEFAULT 0 CHECK (probability >= 0 AND probability <= 100),
  color text,
  is_closed_won boolean NOT NULL DEFAULT false,
  is_closed_lost boolean NOT NULL DEFAULT false,
  is_archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crm_pipeline_stages_terminal_state_check CHECK (NOT (is_closed_won AND is_closed_lost)),
  CONSTRAINT crm_pipeline_stages_name_not_blank CHECK (length(btrim(name)) > 0),
  UNIQUE(pipeline_id, name),
  UNIQUE(pipeline_id, position)
);
CREATE INDEX IF NOT EXISTS crm_pipeline_stages_org_pipeline_idx ON public.crm_pipeline_stages(org_id, pipeline_id, position);

CREATE TABLE IF NOT EXISTS public.crm_legacy_stage_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  legacy_entity_type text NOT NULL CHECK (legacy_entity_type IN ('lead_status', 'lead_pipeline_stage')),
  legacy_value text NOT NULL,
  pipeline_id uuid REFERENCES public.crm_pipelines(id) ON DELETE SET NULL,
  pipeline_stage_id uuid REFERENCES public.crm_pipeline_stages(id) ON DELETE SET NULL,
  lifecycle_status text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, legacy_entity_type, legacy_value)
);
CREATE INDEX IF NOT EXISTS crm_legacy_stage_mappings_org_idx ON public.crm_legacy_stage_mappings(org_id, legacy_entity_type);

-- 3. Independent opportunities, with optional links to retained legacy entities.
CREATE TABLE IF NOT EXISTS public.crm_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
  company_id uuid REFERENCES public.crm_companies(id) ON DELETE SET NULL,
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  pipeline_id uuid NOT NULL REFERENCES public.crm_pipelines(id) ON DELETE RESTRICT,
  pipeline_stage_id uuid NOT NULL REFERENCES public.crm_pipeline_stages(id) ON DELETE RESTRICT,
  legacy_call_id uuid UNIQUE REFERENCES public.calls(id) ON DELETE SET NULL,
  legacy_client_id uuid UNIQUE REFERENCES public.clients(id) ON DELETE SET NULL,
  name text NOT NULL,
  amount_cents bigint NOT NULL DEFAULT 0 CHECK (amount_cents >= 0),
  currency text NOT NULL DEFAULT 'USD',
  probability numeric(5,2) CHECK (probability >= 0 AND probability <= 100),
  expected_close_date date,
  source text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'won', 'lost')),
  won_at timestamptz,
  lost_at timestamptz,
  lost_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crm_opportunities_name_not_blank CHECK (length(btrim(name)) > 0),
  CONSTRAINT crm_opportunities_status_timestamp_check CHECK (
    (status = 'open' AND won_at IS NULL AND lost_at IS NULL)
    OR (status = 'won' AND won_at IS NOT NULL AND lost_at IS NULL)
    OR (status = 'lost' AND lost_at IS NOT NULL AND won_at IS NULL)
  )
);
CREATE INDEX IF NOT EXISTS crm_opportunities_org_pipeline_stage_idx ON public.crm_opportunities(org_id, pipeline_id, pipeline_stage_id);
CREATE INDEX IF NOT EXISTS crm_opportunities_org_contact_idx ON public.crm_opportunities(org_id, contact_id);
CREATE INDEX IF NOT EXISTS crm_opportunities_org_company_idx ON public.crm_opportunities(org_id, company_id);
CREATE INDEX IF NOT EXISTS crm_opportunities_org_owner_status_idx ON public.crm_opportunities(org_id, owner_user_id, status);
CREATE INDEX IF NOT EXISTS crm_opportunities_org_expected_close_idx ON public.crm_opportunities(org_id, expected_close_date) WHERE status = 'open';

-- 4. Tasks, activities, and notes power the unified operational timeline.
CREATE TABLE IF NOT EXISTS public.crm_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  assignee_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
  company_id uuid REFERENCES public.crm_companies(id) ON DELETE SET NULL,
  opportunity_id uuid REFERENCES public.crm_opportunities(id) ON DELETE SET NULL,
  legacy_lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  legacy_call_id uuid REFERENCES public.calls(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  due_at timestamptz,
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'completed', 'cancelled')),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crm_tasks_title_not_blank CHECK (length(btrim(title)) > 0),
  CONSTRAINT crm_tasks_completion_check CHECK ((status = 'completed' AND completed_at IS NOT NULL) OR (status <> 'completed' AND completed_at IS NULL))
);
CREATE INDEX IF NOT EXISTS crm_tasks_org_assignee_due_idx ON public.crm_tasks(org_id, assignee_user_id, due_at) WHERE status IN ('open', 'in_progress');
CREATE INDEX IF NOT EXISTS crm_tasks_org_contact_idx ON public.crm_tasks(org_id, contact_id);
CREATE INDEX IF NOT EXISTS crm_tasks_org_opportunity_idx ON public.crm_tasks(org_id, opportunity_id);

CREATE TABLE IF NOT EXISTS public.crm_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  activity_type text NOT NULL,
  source_type text NOT NULL DEFAULT 'crm',
  source_id uuid,
  title text NOT NULL,
  body text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS crm_activities_org_occurred_idx ON public.crm_activities(org_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS crm_activities_org_source_idx ON public.crm_activities(org_id, source_type, source_id);

CREATE TABLE IF NOT EXISTS public.crm_activity_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  activity_id uuid NOT NULL REFERENCES public.crm_activities(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN ('contact', 'company', 'opportunity', 'task', 'legacy_lead', 'legacy_call', 'legacy_client', 'legacy_payment', 'communication_thread')),
  entity_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(activity_id, entity_type, entity_id)
);
CREATE INDEX IF NOT EXISTS crm_activity_targets_org_entity_idx ON public.crm_activity_targets(org_id, entity_type, entity_id);

CREATE TABLE IF NOT EXISTS public.crm_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  author_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
  company_id uuid REFERENCES public.crm_companies(id) ON DELETE SET NULL,
  opportunity_id uuid REFERENCES public.crm_opportunities(id) ON DELETE SET NULL,
  legacy_lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  legacy_lead_note_id uuid UNIQUE REFERENCES public.lead_notes(id) ON DELETE RESTRICT,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crm_notes_body_not_blank CHECK (length(btrim(body)) > 0)
);
CREATE INDEX IF NOT EXISTS crm_notes_org_contact_idx ON public.crm_notes(org_id, contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS crm_notes_org_opportunity_idx ON public.crm_notes(org_id, opportunity_id, created_at DESC);

-- 5. Custom fields and traceable legacy adapters.
CREATE TABLE IF NOT EXISTS public.crm_custom_field_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN ('contact', 'company', 'opportunity')),
  key text NOT NULL,
  label text NOT NULL,
  field_type text NOT NULL CHECK (field_type IN ('text', 'number', 'currency', 'date', 'datetime', 'boolean', 'select', 'multi_select', 'url')),
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_required boolean NOT NULL DEFAULT false,
  is_archived boolean NOT NULL DEFAULT false,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crm_custom_field_definition_key_valid CHECK (key ~ '^[a-z][a-z0-9_]*$'),
  CONSTRAINT crm_custom_field_definition_label_not_blank CHECK (length(btrim(label)) > 0),
  UNIQUE(org_id, entity_type, key)
);
CREATE INDEX IF NOT EXISTS crm_custom_field_definitions_org_entity_idx ON public.crm_custom_field_definitions(org_id, entity_type, position);

CREATE TABLE IF NOT EXISTS public.crm_custom_field_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  definition_id uuid NOT NULL REFERENCES public.crm_custom_field_definitions(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN ('contact', 'company', 'opportunity')),
  entity_id uuid NOT NULL,
  value jsonb NOT NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(definition_id, entity_type, entity_id)
);
CREATE INDEX IF NOT EXISTS crm_custom_field_values_org_entity_idx ON public.crm_custom_field_values(org_id, entity_type, entity_id);

CREATE TABLE IF NOT EXISTS public.crm_legacy_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  crm_entity_type text NOT NULL CHECK (crm_entity_type IN ('contact', 'company', 'opportunity', 'task', 'activity', 'note', 'communication_thread', 'communication_message')),
  crm_entity_id uuid NOT NULL,
  legacy_entity_type text NOT NULL CHECK (legacy_entity_type IN ('lead', 'lead_event', 'lead_note', 'lead_content_touch', 'conversation', 'message', 'call', 'call_objection', 'client', 'payment', 'client_win', 'onboarding_response', 'setter_call_signal', 'lead_call_transcript', 'lead_video_link')),
  legacy_entity_id uuid NOT NULL,
  relationship_type text NOT NULL DEFAULT 'source',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, crm_entity_type, crm_entity_id, legacy_entity_type, legacy_entity_id, relationship_type)
);
CREATE INDEX IF NOT EXISTS crm_legacy_links_legacy_idx ON public.crm_legacy_links(org_id, legacy_entity_type, legacy_entity_id);
CREATE INDEX IF NOT EXISTS crm_legacy_links_crm_idx ON public.crm_legacy_links(org_id, crm_entity_type, crm_entity_id);

-- 6. Provider-event idempotency. External credential and webhook implementation comes later.
CREATE TABLE IF NOT EXISTS public.crm_external_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider text NOT NULL,
  external_event_id text NOT NULL,
  event_type text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  processing_status text NOT NULL DEFAULT 'received' CHECK (processing_status IN ('received', 'processed', 'failed', 'ignored')),
  error_message text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, provider, external_event_id)
);
CREATE INDEX IF NOT EXISTS crm_external_events_org_status_idx ON public.crm_external_events(org_id, processing_status, received_at DESC);

-- 7. Legacy-contact adapter. This view makes the current leads table visible to
-- CRM reads without a risky production backfill. Once a contact links a lead,
-- that lead is represented by the CRM contact rather than duplicated.
CREATE OR REPLACE VIEW public.crm_contact_legacy_adapter_v
WITH (security_invoker = true)
AS
SELECT
  c.id,
  c.org_id,
  'crm_contact'::text AS record_source,
  c.legacy_lead_id,
  c.display_name,
  c.first_name,
  c.last_name,
  c.primary_email,
  c.primary_phone,
  c.social_handle,
  c.owner_user_id,
  c.lifecycle_status,
  c.source,
  c.created_at,
  c.updated_at
FROM public.crm_contacts c
UNION ALL
SELECT
  l.id,
  l.org_id,
  'legacy_lead'::text AS record_source,
  l.id AS legacy_lead_id,
  COALESCE(NULLIF(l.full_name, ''), NULLIF(l.handle, ''), NULLIF(l.email, ''), 'Untitled lead') AS display_name,
  NULL::text AS first_name,
  NULL::text AS last_name,
  l.email AS primary_email,
  l.phone AS primary_phone,
  l.handle AS social_handle,
  NULL::uuid AS owner_user_id, -- legacy assigned_setter_id is roster-scoped and is not assumed to be auth.users-compatible

  l.status::text AS lifecycle_status,
  l.source_connector AS source,
  l.created_at,
  l.updated_at
FROM public.leads l
WHERE NOT EXISTS (
  SELECT 1 FROM public.crm_contacts c WHERE c.legacy_lead_id = l.id
);

-- 8. Keep time-based fields current using the existing hardened trigger function.
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'crm_contacts', 'crm_companies', 'crm_pipelines', 'crm_pipeline_stages',
    'crm_legacy_stage_mappings', 'crm_opportunities', 'crm_tasks', 'crm_notes',
    'crm_custom_field_definitions', 'crm_custom_field_values'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'tg_' || tbl || '_updated', tbl);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at()', 'tg_' || tbl || '_updated', tbl);
  END LOOP;
END $$;

-- 9. RLS. Read access remains organization-scoped. Routine CRM work is limited
-- to sales managers while setter/closer ownership scopes are implemented in
-- the workflow phase. Structural configuration and deletion require the same
-- manager-level role. External events remain server-side only.
DO $$
DECLARE
  tbl text;
  read_policy text;
  operator_policy text;
  manager_policy text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'crm_contacts', 'crm_companies', 'crm_company_contacts', 'crm_pipelines',
    'crm_pipeline_stages', 'crm_legacy_stage_mappings', 'crm_opportunities',
    'crm_tasks', 'crm_activities', 'crm_activity_targets', 'crm_notes',
    'crm_custom_field_definitions', 'crm_custom_field_values', 'crm_legacy_links',
    'crm_external_events'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
    read_policy := 'crm_read_' || tbl;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = tbl AND policyname = read_policy) THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (public.is_org_member(auth.uid(), org_id))', read_policy, tbl);
    END IF;
  END LOOP;

  FOREACH tbl IN ARRAY ARRAY[
    'crm_contacts', 'crm_companies', 'crm_company_contacts', 'crm_opportunities',
    'crm_tasks', 'crm_activities', 'crm_activity_targets', 'crm_notes',
    'crm_custom_field_values', 'crm_legacy_links'
  ]
  LOOP
    operator_policy := 'crm_create_' || tbl;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = tbl AND policyname = operator_policy) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR INSERT WITH CHECK (public.has_org_role(auth.uid(), org_id, ARRAY[''owner'', ''admin'', ''sales_manager'']::public.app_role[]))',
        operator_policy, tbl
      );
    END IF;
    operator_policy := 'crm_update_' || tbl;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = tbl AND policyname = operator_policy) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR UPDATE USING (public.has_org_role(auth.uid(), org_id, ARRAY[''owner'', ''admin'', ''sales_manager'']::public.app_role[])) WITH CHECK (public.has_org_role(auth.uid(), org_id, ARRAY[''owner'', ''admin'', ''sales_manager'']::public.app_role[]))',
        operator_policy, tbl
      );
    END IF;
    manager_policy := 'crm_manage_delete_' || tbl;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = tbl AND policyname = manager_policy) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR DELETE USING (public.has_org_role(auth.uid(), org_id, ARRAY[''owner'', ''admin'', ''sales_manager'']::public.app_role[]))',
        manager_policy, tbl
      );
    END IF;
  END LOOP;

  FOREACH tbl IN ARRAY ARRAY['crm_pipelines', 'crm_pipeline_stages', 'crm_legacy_stage_mappings', 'crm_custom_field_definitions']
  LOOP
    manager_policy := 'crm_manage_' || tbl;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = tbl AND policyname = manager_policy) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL USING (public.has_org_role(auth.uid(), org_id, ARRAY[''owner'', ''admin'', ''sales_manager'']::public.app_role[])) WITH CHECK (public.has_org_role(auth.uid(), org_id, ARRAY[''owner'', ''admin'', ''sales_manager'']::public.app_role[]))',
        manager_policy, tbl
      );
    END IF;
  END LOOP;
END $$;

COMMENT ON VIEW public.crm_contact_legacy_adapter_v IS
  'Compatibility view: presents unmigrated legacy leads and native CRM contacts as one read model without mutating legacy records.';
COMMENT ON TABLE public.crm_legacy_links IS
  'Traceability mapping from additive CRM entities to existing InsightOS sales records; does not replace legacy tables.';
COMMENT ON TABLE public.crm_external_events IS
  'Provider callback idempotency and processing log. Inserts are server-side only; provider credentials remain outside the database and client bundle.';
