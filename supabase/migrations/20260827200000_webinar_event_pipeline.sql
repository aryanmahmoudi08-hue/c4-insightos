-- Priority 2: provider-neutral webinar event pipeline.
-- Additive only: no existing rows are deleted or rewritten.

ALTER TABLE public.webinar_events
  ADD COLUMN IF NOT EXISTS provider_event_id text,
  ADD COLUMN IF NOT EXISTS registration_source text,
  ADD COLUMN IF NOT EXISTS source_campaign text,
  ADD COLUMN IF NOT EXISTS source_content_id uuid REFERENCES public.content_pieces(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_format text,
  ADD COLUMN IF NOT EXISTS event_key text;

ALTER TABLE public.webinar_events
  DROP CONSTRAINT IF EXISTS webinar_events_event_type_check;

ALTER TABLE public.webinar_events
  ADD CONSTRAINT webinar_events_event_type_check CHECK (
    event_type IN (
      'registered', 'confirmation', 'notification', 'live', 'joined', 'attended',
      'engagement', 'chat', 'question', 'poll', 'cta_click', 'pitch', 'exited',
      'replay_started', 'replay_completed', 'application', 'booked_call', 'show',
      'offer', 'deposit', 'close', 'cash', 'sale', 'refund', 'bump', 'upsell'
    )
  );

CREATE INDEX IF NOT EXISTS webinar_events_provider_idx
  ON public.webinar_events (org_id, webinar_id, provider_event_id)
  WHERE provider_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS webinar_events_event_order_idx
  ON public.webinar_events (org_id, webinar_id, event_type, occurred_at);

CREATE UNIQUE INDEX IF NOT EXISTS webinar_events_event_key_uidx
  ON public.webinar_events (org_id, webinar_id, event_key)
  WHERE event_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS webinar_events_provider_uidx
  ON public.webinar_events (org_id, webinar_id, provider_event_id)
  WHERE provider_event_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.record_webinar_event(
  p_org_id uuid,
  p_webinar_id uuid,
  p_event_type text,
  p_occurred_at timestamptz,
  p_event_key text,
  p_lead_id uuid DEFAULT NULL,
  p_source_platform text DEFAULT NULL,
  p_source_type text DEFAULT NULL,
  p_registration_source text DEFAULT NULL,
  p_source_campaign text DEFAULT NULL,
  p_source_content_id uuid DEFAULT NULL,
  p_source_format text DEFAULT NULL,
  p_provider_event_id text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF p_event_key IS NULL OR length(trim(p_event_key)) = 0 THEN
    RAISE EXCEPTION 'webinar event key is required';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_org_id::text || ':' || p_webinar_id::text || ':' || p_event_key, 0));

  INSERT INTO public.webinar_events (
    org_id, webinar_id, lead_id, event_type, occurred_at, source_platform,
    source_type, registration_source, source_campaign, source_content_id,
    source_format, provider_event_id, event_key, metadata
  ) VALUES (
    p_org_id, p_webinar_id, p_lead_id, p_event_type, p_occurred_at, p_source_platform,
    p_source_type, p_registration_source, p_source_campaign, p_source_content_id,
    p_source_format, p_provider_event_id, p_event_key, COALESCE(p_metadata, '{}'::jsonb)
  )
  ON CONFLICT (org_id, webinar_id, event_key) WHERE event_key IS NOT NULL DO NOTHING;

  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_webinar_event(uuid, uuid, text, timestamptz, text, uuid, text, text, text, text, uuid, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_webinar_event(uuid, uuid, text, timestamptz, text, uuid, text, text, text, text, uuid, text, text, jsonb) TO service_role;
