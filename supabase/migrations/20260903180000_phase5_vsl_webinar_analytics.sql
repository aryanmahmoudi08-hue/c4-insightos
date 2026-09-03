-- Phase 5: VSL Analytics / Wistia + Webinar Analytics.
-- Additive only: no existing rows are deleted or rewritten.

-- 1. Fix a real schema/type mismatch: src/lib/vsl.functions.ts's VslKind type has
--    declared "testimonial" as a creatable kind since it shipped, but the vsl_kind
--    enum itself was never extended past ('main','webinar','post_booking') — so
--    creating a Testimonial VSL fails at the database with an invalid-enum error.
ALTER TYPE public.vsl_kind ADD VALUE IF NOT EXISTS 'testimonial';

-- 2. Extend vsl_metric_snapshots with the Wistia-native fields the spec requires
--    (retention milestones, CTA events, rewatch/skip, viewer dimensions) that the
--    schema never carried. All nullable/additive — CSV imports that don't carry a
--    column simply leave it null, which the UI renders as "Unavailable" rather
--    than a fabricated zero.
ALTER TABLE public.vsl_metric_snapshots
  ADD COLUMN IF NOT EXISTS pct_25_reached numeric,
  ADD COLUMN IF NOT EXISTS pct_50_reached numeric,
  ADD COLUMN IF NOT EXISTS pct_75_reached numeric,
  ADD COLUMN IF NOT EXISTS pct_90_reached numeric,
  ADD COLUMN IF NOT EXISTS pct_100_reached numeric,
  ADD COLUMN IF NOT EXISTS cta_clicks numeric,
  ADD COLUMN IF NOT EXISTS cta_click_rate numeric,
  ADD COLUMN IF NOT EXISTS rewatches numeric,
  ADD COLUMN IF NOT EXISTS skips numeric,
  ADD COLUMN IF NOT EXISTS referrer text,
  ADD COLUMN IF NOT EXISTS utm_source text,
  ADD COLUMN IF NOT EXISTS utm_medium text,
  ADD COLUMN IF NOT EXISTS utm_campaign text,
  ADD COLUMN IF NOT EXISTS device text,
  ADD COLUMN IF NOT EXISTS embed_location text,
  ADD COLUMN IF NOT EXISTS new_vs_returning text,
  ADD COLUMN IF NOT EXISTS identified_viewer_id text;

-- 3. A real, queryable VSL -> lead/call link, mirroring the existing
--    source_content_id pattern (20260827090000_analytics_expansion_foundation.sql)
--    used for content attribution. Without this, "application/booking -> show ->
--    close -> cash" can never be a real funnel stage for a VSL — there is no
--    column anywhere connecting a specific video to a specific lead or call. This
--    is the production-ready data model for that connection: honestly empty
--    (source_vsl_id IS NULL) until a booking page or intake form is wired to tag
--    it, at which point the funnel below becomes real rather than fabricated.
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS source_vsl_id uuid REFERENCES public.vsls(id) ON DELETE SET NULL;
ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS source_vsl_id uuid REFERENCES public.vsls(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS leads_source_vsl_idx ON public.leads (org_id, source_vsl_id);
CREATE INDEX IF NOT EXISTS calls_source_vsl_idx ON public.calls (org_id, source_vsl_id);

-- 4. Recommendation-status tracking for the VSL Action Queue. The queue's
--    per-video actions (src/lib/media-intelligence.ts's deriveVideoActionQueue)
--    were computed but never persisted anywhere — there was no "queued / running
--    / won / lost / dismissed" state for a human to move an action through.
CREATE TABLE IF NOT EXISTS public.vsl_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  vsl_id uuid NOT NULL REFERENCES public.vsls(id) ON DELETE CASCADE,
  action text NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'won', 'lost', 'dismissed')),
  confidence numeric,
  evidence_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vsl_id, action)
);

ALTER TABLE public.vsl_recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vsl_recommendations_org_read" ON public.vsl_recommendations FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), org_id));

CREATE POLICY "vsl_recommendations_org_write" ON public.vsl_recommendations FOR ALL TO authenticated
  USING (public.has_org_role(auth.uid(), org_id, ARRAY['owner','admin','growth_ops']::app_role[]))
  WITH CHECK (public.has_org_role(auth.uid(), org_id, ARRAY['owner','admin','growth_ops']::app_role[]));

CREATE INDEX IF NOT EXISTS vsl_recommendations_org_idx ON public.vsl_recommendations (org_id, vsl_id, status);
