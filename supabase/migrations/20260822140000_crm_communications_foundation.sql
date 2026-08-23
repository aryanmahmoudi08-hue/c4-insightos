-- Provider-neutral communication foundation for the Sales CRM.
--
-- This migration adds a new communication domain; it does not modify existing
-- conversations, messages, calls, outreach, or provider credentials. Existing
-- history remains authoritative and is exposed through compatibility views.

CREATE TABLE IF NOT EXISTS public.crm_communication_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('gmail', 'twilio', 'outlook', 'other')),
  channel text NOT NULL CHECK (channel IN ('email', 'sms', 'voice')),
  external_account_id text,
  display_name text,
  address_value text NOT NULL,
  connection_status text NOT NULL DEFAULT 'not_configured' CHECK (connection_status IN ('not_configured', 'pending', 'connected', 'error', 'disabled')),
  is_default boolean NOT NULL DEFAULT false,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_synced_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crm_communication_accounts_address_not_blank CHECK (length(btrim(address_value)) > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS crm_communication_accounts_provider_external_idx ON public.crm_communication_accounts(org_id, provider, external_account_id) WHERE external_account_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS crm_communication_accounts_default_idx ON public.crm_communication_accounts(org_id, channel) WHERE is_default AND connection_status = 'connected';
CREATE INDEX IF NOT EXISTS crm_communication_accounts_org_channel_idx ON public.crm_communication_accounts(org_id, channel, connection_status);

CREATE TABLE IF NOT EXISTS public.crm_communication_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  account_id uuid REFERENCES public.crm_communication_accounts(id) ON DELETE SET NULL,
  channel text NOT NULL CHECK (channel IN ('email', 'sms', 'voice', 'instagram_dm', 'other')),
  external_thread_id text,
  contact_id uuid REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
  company_id uuid REFERENCES public.crm_companies(id) ON DELETE SET NULL,
  opportunity_id uuid REFERENCES public.crm_opportunities(id) ON DELETE SET NULL,
  legacy_lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  assigned_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  subject text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'archived')),
  unread_count integer NOT NULL DEFAULT 0 CHECK (unread_count >= 0),
  last_message_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS crm_communication_threads_external_idx ON public.crm_communication_threads(account_id, external_thread_id) WHERE account_id IS NOT NULL AND external_thread_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS crm_communication_threads_org_inbox_idx ON public.crm_communication_threads(org_id, status, last_message_at DESC);
CREATE INDEX IF NOT EXISTS crm_communication_threads_org_contact_idx ON public.crm_communication_threads(org_id, contact_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS crm_communication_threads_org_legacy_lead_idx ON public.crm_communication_threads(org_id, legacy_lead_id, last_message_at DESC);

CREATE TABLE IF NOT EXISTS public.crm_communication_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  thread_id uuid NOT NULL REFERENCES public.crm_communication_threads(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
  address_value text NOT NULL,
  display_name text,
  participant_role text NOT NULL DEFAULT 'recipient' CHECK (participant_role IN ('sender', 'recipient', 'cc', 'bcc', 'caller', 'callee')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(thread_id, address_value, participant_role)
);
CREATE INDEX IF NOT EXISTS crm_communication_participants_org_address_idx ON public.crm_communication_participants(org_id, lower(address_value));
CREATE INDEX IF NOT EXISTS crm_communication_participants_thread_idx ON public.crm_communication_participants(thread_id);

CREATE TABLE IF NOT EXISTS public.crm_communication_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  thread_id uuid NOT NULL REFERENCES public.crm_communication_threads(id) ON DELETE CASCADE,
  account_id uuid REFERENCES public.crm_communication_accounts(id) ON DELETE SET NULL,
  provider text NOT NULL CHECK (provider IN ('gmail', 'twilio', 'outlook', 'legacy', 'other')),
  external_message_id text,
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound', 'internal')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'queued', 'sending', 'sent', 'delivered', 'opened', 'clicked', 'received', 'failed', 'bounced', 'undelivered', 'read')),
  subject text,
  from_address text,
  to_addresses jsonb NOT NULL DEFAULT '[]'::jsonb,
  cc_addresses jsonb NOT NULL DEFAULT '[]'::jsonb,
  bcc_addresses jsonb NOT NULL DEFAULT '[]'::jsonb,
  body_text text,
  body_html text,
  sent_at timestamptz,
  received_at timestamptz,
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS crm_communication_messages_external_idx ON public.crm_communication_messages(provider, external_message_id) WHERE external_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS crm_communication_messages_org_thread_idx ON public.crm_communication_messages(org_id, thread_id, created_at DESC);
CREATE INDEX IF NOT EXISTS crm_communication_messages_org_status_idx ON public.crm_communication_messages(org_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.crm_communication_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES public.crm_communication_messages(id) ON DELETE CASCADE,
  provider text NOT NULL,
  external_event_id text NOT NULL,
  delivery_status text NOT NULL CHECK (delivery_status IN ('queued', 'sending', 'sent', 'delivered', 'opened', 'clicked', 'received', 'failed', 'bounced', 'undelivered', 'read')),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  error_code text,
  error_message text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider, external_event_id)
);
CREATE INDEX IF NOT EXISTS crm_communication_deliveries_org_message_idx ON public.crm_communication_deliveries(org_id, message_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS public.crm_call_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  account_id uuid REFERENCES public.crm_communication_accounts(id) ON DELETE SET NULL,
  thread_id uuid REFERENCES public.crm_communication_threads(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
  opportunity_id uuid REFERENCES public.crm_opportunities(id) ON DELETE SET NULL,
  legacy_lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  legacy_call_id uuid REFERENCES public.calls(id) ON DELETE SET NULL,
  provider text NOT NULL CHECK (provider IN ('twilio', 'legacy', 'other')),
  external_call_id text,
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'initiated', 'ringing', 'answered', 'completed', 'busy', 'failed', 'no_answer', 'canceled', 'missed')),
  from_address text,
  to_address text,
  started_at timestamptz,
  answered_at timestamptz,
  completed_at timestamptz,
  duration_seconds integer CHECK (duration_seconds >= 0),
  disposition text,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS crm_call_sessions_external_idx ON public.crm_call_sessions(provider, external_call_id);
CREATE INDEX IF NOT EXISTS crm_call_sessions_org_contact_idx ON public.crm_call_sessions(org_id, contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS crm_call_sessions_org_status_idx ON public.crm_call_sessions(org_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.crm_call_recordings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  call_session_id uuid REFERENCES public.crm_call_sessions(id) ON DELETE CASCADE,
  legacy_call_id uuid REFERENCES public.calls(id) ON DELETE SET NULL,
  provider text NOT NULL CHECK (provider IN ('twilio', 'legacy', 'other')),
  external_recording_id text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'available', 'absent', 'failed')),
  recording_url text,
  duration_seconds integer CHECK (duration_seconds >= 0),
  content_type text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS crm_call_recordings_external_idx ON public.crm_call_recordings(provider, external_recording_id);
CREATE INDEX IF NOT EXISTS crm_call_recordings_org_session_idx ON public.crm_call_recordings(org_id, call_session_id);

-- Existing messages/calls stay untouched. This read model exposes them alongside
-- new CRM communication threads for safe incremental inbox rollout.
CREATE OR REPLACE VIEW public.crm_communication_legacy_adapter_v
WITH (security_invoker = true)
AS
SELECT
  t.id,
  t.org_id,
  'crm_thread'::text AS record_source,
  t.channel,
  t.contact_id,
  t.legacy_lead_id,
  t.subject,
  t.status,
  t.unread_count,
  t.last_message_at,
  t.created_at
FROM public.crm_communication_threads t
UNION ALL
SELECT
  c.id,
  c.org_id,
  'legacy_conversation'::text AS record_source,
  c.channel,
  NULL::uuid AS contact_id,
  c.lead_id AS legacy_lead_id,
  NULL::text AS subject,
  c.status,
  0::integer AS unread_count,
  c.last_message_at,
  c.created_at
FROM public.conversations c
WHERE NOT EXISTS (
  SELECT 1 FROM public.crm_legacy_links l
  WHERE l.org_id = c.org_id
    AND l.crm_entity_type = 'communication_thread'
    AND l.legacy_entity_type = 'conversation'
    AND l.legacy_entity_id = c.id
);

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'crm_communication_accounts', 'crm_communication_threads',
    'crm_communication_messages', 'crm_call_sessions', 'crm_call_recordings'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'tg_' || tbl || '_updated', tbl);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at()', 'tg_' || tbl || '_updated', tbl);
  END LOOP;
END $$;

-- Communication records are readable inside their organization. Until
-- per-assignee scope is introduced, configuration and operator writes are
-- manager-only; webhook writes use the service-role backend after signature
-- validation and do not expose provider credentials to client code.
DO $$
DECLARE
  tbl text;
  read_policy text;
  manager_policy text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'crm_communication_accounts', 'crm_communication_threads',
    'crm_communication_participants', 'crm_communication_messages',
    'crm_communication_deliveries', 'crm_call_sessions', 'crm_call_recordings'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
    read_policy := 'crm_comm_read_' || tbl;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = tbl AND policyname = read_policy) THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (public.is_org_member(auth.uid(), org_id))', read_policy, tbl);
    END IF;
    manager_policy := 'crm_comm_manage_' || tbl;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = tbl AND policyname = manager_policy) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL USING (public.has_org_role(auth.uid(), org_id, ARRAY[''owner'', ''admin'', ''sales_manager'']::public.app_role[])) WITH CHECK (public.has_org_role(auth.uid(), org_id, ARRAY[''owner'', ''admin'', ''sales_manager'']::public.app_role[]))',
        manager_policy, tbl
      );
    END IF;
  END LOOP;
END $$;

COMMENT ON TABLE public.crm_communication_accounts IS
  'Provider account metadata only. OAuth tokens, Twilio auth tokens, and client secrets remain server-side environment configuration.';
COMMENT ON VIEW public.crm_communication_legacy_adapter_v IS
  'Compatibility inbox view that keeps legacy conversations visible while new provider-neutral threads are introduced.';
