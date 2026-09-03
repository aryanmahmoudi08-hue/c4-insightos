-- Additive analytics expansion foundation for InsightOS.
-- No existing records or tables are altered destructively.

ALTER TABLE public.content_pieces
  ADD COLUMN IF NOT EXISTS funnel_stage text;

CREATE INDEX IF NOT EXISTS content_pieces_taxonomy_idx
  ON public.content_pieces (org_id, funnel_stage, mechanism, variation, platform);

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS source_platform text,
  ADD COLUMN IF NOT EXISTS source_format text,
  ADD COLUMN IF NOT EXISTS source_content_id uuid REFERENCES public.content_pieces(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_campaign text;

ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS source_platform text,
  ADD COLUMN IF NOT EXISTS source_format text,
  ADD COLUMN IF NOT EXISTS source_content_id uuid REFERENCES public.content_pieces(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_campaign text,
  ADD COLUMN IF NOT EXISTS showed_at timestamptz,
  ADD COLUMN IF NOT EXISTS offer_at timestamptz;

CREATE INDEX IF NOT EXISTS leads_attribution_idx
  ON public.leads (org_id, source_platform, source_format, source_content_id, source_campaign);
CREATE INDEX IF NOT EXISTS calls_attribution_idx
  ON public.calls (org_id, source_platform, source_format, source_content_id, source_campaign);

CREATE TABLE IF NOT EXISTS public.webinars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  name text NOT NULL,
  slug text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  registration_url text,
  starts_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS webinars_org_idx ON public.webinars (org_id, created_at DESC);
ALTER TABLE public.webinars ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "webinars_org_read" ON public.webinars;
CREATE POLICY "webinars_org_read" ON public.webinars FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), org_id));
DROP POLICY IF EXISTS "webinars_org_write" ON public.webinars;
CREATE POLICY "webinars_org_write" ON public.webinars FOR ALL TO authenticated
  USING (public.has_org_role(auth.uid(), org_id, ARRAY['owner','admin','growth_ops']::app_role[]))
  WITH CHECK (public.has_org_role(auth.uid(), org_id, ARRAY['owner','admin','growth_ops']::app_role[]));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.webinars TO authenticated;
GRANT ALL ON public.webinars TO service_role;

CREATE TABLE IF NOT EXISTS public.webinar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  webinar_id uuid NOT NULL REFERENCES public.webinars(id) ON DELETE CASCADE,
  lead_id uuid,
  event_type text NOT NULL CHECK (event_type IN ('registered', 'attended', 'pitch', 'deposit', 'sale', 'refund')),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  source_platform text,
  source_type text CHECK (source_type IS NULL OR source_type IN ('paid', 'organic', 'direct', 'unknown')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS webinar_events_lookup_idx
  ON public.webinar_events (org_id, webinar_id, occurred_at DESC);
ALTER TABLE public.webinar_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "webinar_events_org_read" ON public.webinar_events;
CREATE POLICY "webinar_events_org_read" ON public.webinar_events FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), org_id));
DROP POLICY IF EXISTS "webinar_events_org_write" ON public.webinar_events;
CREATE POLICY "webinar_events_org_write" ON public.webinar_events FOR ALL TO authenticated
  USING (public.has_org_role(auth.uid(), org_id, ARRAY['owner','admin','growth_ops']::app_role[]))
  WITH CHECK (public.has_org_role(auth.uid(), org_id, ARRAY['owner','admin','growth_ops']::app_role[]));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.webinar_events TO authenticated;
GRANT ALL ON public.webinar_events TO service_role;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS source_webinar_id uuid REFERENCES public.webinars(id) ON DELETE SET NULL;
ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS source_webinar_id uuid REFERENCES public.webinars(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS leads_source_webinar_idx ON public.leads (org_id, source_webinar_id);
CREATE INDEX IF NOT EXISTS calls_source_webinar_idx ON public.calls (org_id, source_webinar_id);

CREATE TABLE IF NOT EXISTS public.webinar_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  webinar_id uuid NOT NULL REFERENCES public.webinars(id) ON DELETE CASCADE,
  captured_at timestamptz NOT NULL DEFAULT now(),
  lead_capture_investment_cents integer,
  clicks integer,
  visits_paid integer,
  visits_organic integer,
  paid_leads integer,
  organic_leads integer,
  group_leads integer,
  email_opens integer,
  email_clicks integer,
  registered integer,
  live_attendees integer,
  pitch_attendees integer,
  deposits integer,
  sales integer,
  core_revenue_cents integer,
  refunds_cents integer,
  order_bump_sales integer,
  order_bump_revenue_cents integer,
  upsell_sales integer,
  upsell_revenue_cents integer,
  source text NOT NULL DEFAULT 'manual'
);

CREATE INDEX IF NOT EXISTS webinar_metrics_lookup_idx
  ON public.webinar_metrics (org_id, webinar_id, captured_at DESC);
ALTER TABLE public.webinar_metrics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "webinar_metrics_org_read" ON public.webinar_metrics;
CREATE POLICY "webinar_metrics_org_read" ON public.webinar_metrics FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), org_id));
DROP POLICY IF EXISTS "webinar_metrics_org_write" ON public.webinar_metrics;
CREATE POLICY "webinar_metrics_org_write" ON public.webinar_metrics FOR ALL TO authenticated
  USING (public.has_org_role(auth.uid(), org_id, ARRAY['owner','admin','growth_ops']::app_role[]))
  WITH CHECK (public.has_org_role(auth.uid(), org_id, ARRAY['owner','admin','growth_ops']::app_role[]));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.webinar_metrics TO authenticated;
GRANT ALL ON public.webinar_metrics TO service_role;

CREATE TABLE IF NOT EXISTS public.lead_response_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  lead_id uuid NOT NULL,
  rep_id uuid,
  event_type text,
  event_at timestamptz,
  lead_created_at timestamptz,
  lead_assigned_at timestamptz,
  first_attempt_at timestamptz,
  first_connection_at timestamptz,
  source_platform text,
  lead_source text,
  campaign text,
  connected boolean,
  qualified boolean,
  set boolean,
  booked_call boolean,
  showed boolean,
  offer boolean,
  closed boolean,
  content_id uuid REFERENCES public.content_pieces(id) ON DELETE SET NULL,
  format text,
  webinar_id uuid REFERENCES public.webinars(id) ON DELETE SET NULL,
  call_id uuid REFERENCES public.calls(id) ON DELETE SET NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  event_log jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, lead_id)
);

CREATE INDEX IF NOT EXISTS lead_response_events_lookup_idx
  ON public.lead_response_events (org_id, rep_id, source_platform, lead_created_at DESC);
ALTER TABLE public.lead_response_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lead_response_events_org_read" ON public.lead_response_events;
CREATE POLICY "lead_response_events_org_read" ON public.lead_response_events FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), org_id));
DROP POLICY IF EXISTS "lead_response_events_org_write" ON public.lead_response_events;
CREATE POLICY "lead_response_events_org_write" ON public.lead_response_events FOR ALL TO authenticated
  USING (public.has_org_role(auth.uid(), org_id, ARRAY['owner','admin','sales_manager','growth_ops']::app_role[]))
  WITH CHECK (public.has_org_role(auth.uid(), org_id, ARRAY['owner','admin','sales_manager','growth_ops']::app_role[]));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_response_events TO authenticated;
GRANT ALL ON public.lead_response_events TO service_role;

CREATE INDEX IF NOT EXISTS lead_response_events_event_lookup_idx
  ON public.lead_response_events (org_id, event_at DESC, event_type, rep_id);

CREATE OR REPLACE FUNCTION public.record_lead_lifecycle_event(
  p_org_id uuid,
  p_lead_id uuid,
  p_event_type text,
  p_event_at timestamptz,
  p_idempotency_key text,
  p_rep_id uuid DEFAULT NULL,
  p_source_platform text DEFAULT NULL,
  p_lead_source text DEFAULT NULL,
  p_campaign text DEFAULT NULL,
  p_content_id uuid DEFAULT NULL,
  p_format text DEFAULT NULL,
  p_webinar_id uuid DEFAULT NULL,
  p_call_id uuid DEFAULT NULL,
  p_client_id uuid DEFAULT NULL,
  p_payment_id uuid DEFAULT NULL,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  inserted boolean := false;
  event_record jsonb;
BEGIN
  event_record := jsonb_build_object(
    'event_type', p_event_type,
    'event_at', p_event_at,
    'idempotency_key', p_idempotency_key,
    'rep_id', p_rep_id,
    'source_platform', p_source_platform,
    'lead_source', p_lead_source,
    'campaign', p_campaign,
    'content_id', p_content_id,
    'format', p_format,
    'webinar_id', p_webinar_id,
    'call_id', p_call_id,
    'client_id', p_client_id,
    'payment_id', p_payment_id,
    'payload', COALESCE(p_payload, '{}'::jsonb)
  );

  INSERT INTO public.lead_response_events (
    org_id, lead_id, rep_id, event_type, event_at,
    source_platform, lead_source, campaign, content_id, format,
    webinar_id, call_id, client_id, payment_id, event_log
  ) VALUES (
    p_org_id, p_lead_id, p_rep_id, p_event_type, p_event_at,
    p_source_platform, p_lead_source, p_campaign, p_content_id, p_format,
    p_webinar_id, p_call_id, p_client_id, p_payment_id, jsonb_build_array(event_record)
  )
  ON CONFLICT (org_id, lead_id) DO UPDATE SET
    rep_id = COALESCE(EXCLUDED.rep_id, public.lead_response_events.rep_id),
    event_type = COALESCE(EXCLUDED.event_type, public.lead_response_events.event_type),
    event_at = COALESCE(EXCLUDED.event_at, public.lead_response_events.event_at),
    lead_created_at = CASE WHEN p_event_type = 'lead_created' THEN COALESCE(public.lead_response_events.lead_created_at, p_event_at) ELSE public.lead_response_events.lead_created_at END,
    lead_assigned_at = CASE WHEN p_event_type = 'lead_assigned' THEN COALESCE(public.lead_response_events.lead_assigned_at, p_event_at) ELSE public.lead_response_events.lead_assigned_at END,
    first_attempt_at = CASE WHEN p_event_type = 'first_attempt' THEN COALESCE(public.lead_response_events.first_attempt_at, p_event_at) ELSE public.lead_response_events.first_attempt_at END,
    first_connection_at = CASE WHEN p_event_type = 'first_connection' THEN COALESCE(public.lead_response_events.first_connection_at, p_event_at) ELSE public.lead_response_events.first_connection_at END,
    connected = CASE WHEN p_event_type = 'first_connection' THEN true ELSE public.lead_response_events.connected END,
    qualified = CASE WHEN p_event_type = 'qualified_conversation' THEN true ELSE public.lead_response_events.qualified END,
    set = CASE WHEN p_event_type = 'set' THEN true ELSE public.lead_response_events.set END,
    booked_call = CASE WHEN p_event_type = 'booked_call' THEN true ELSE public.lead_response_events.booked_call END,
    showed = CASE WHEN p_event_type = 'showed' THEN true ELSE public.lead_response_events.showed END,
    offer = CASE WHEN p_event_type = 'offer' THEN true ELSE public.lead_response_events.offer END,
    closed = CASE WHEN p_event_type = 'close' THEN true ELSE public.lead_response_events.closed END,
    source_platform = COALESCE(EXCLUDED.source_platform, public.lead_response_events.source_platform),
    lead_source = COALESCE(EXCLUDED.lead_source, public.lead_response_events.lead_source),
    campaign = COALESCE(EXCLUDED.campaign, public.lead_response_events.campaign),
    content_id = COALESCE(EXCLUDED.content_id, public.lead_response_events.content_id),
    format = COALESCE(EXCLUDED.format, public.lead_response_events.format),
    webinar_id = COALESCE(EXCLUDED.webinar_id, public.lead_response_events.webinar_id),
    call_id = COALESCE(EXCLUDED.call_id, public.lead_response_events.call_id),
    client_id = COALESCE(EXCLUDED.client_id, public.lead_response_events.client_id),
    payment_id = COALESCE(EXCLUDED.payment_id, public.lead_response_events.payment_id),
    event_log = CASE
      WHEN EXISTS (
        SELECT 1 FROM jsonb_array_elements(public.lead_response_events.event_log) item
        WHERE item->>'idempotency_key' = p_idempotency_key
      ) THEN public.lead_response_events.event_log
      ELSE public.lead_response_events.event_log || jsonb_build_array(event_record)
    END,
    updated_at = now()
  RETURNING true INTO inserted;

  RETURN inserted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_lead_lifecycle_event(uuid, uuid, text, timestamptz, text, uuid, text, text, text, uuid, text, uuid, uuid, uuid, uuid, jsonb) TO authenticated;
