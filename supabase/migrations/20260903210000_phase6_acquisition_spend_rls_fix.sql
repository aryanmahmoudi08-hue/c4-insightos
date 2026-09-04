-- Phase 6, section F (security/RLS review): acquisition_spend was created
-- (20260827210000_acquisition_spend_foundation.sql) with real org-scoped
-- financial data — ad spend, campaign IDs, impressions/clicks — but no RLS
-- was ever enabled on it and no policy exists anywhere in the migration
-- history. With RLS off, every row is visible/writable to any authenticated
-- user regardless of organization. This is a real cross-org data exposure,
-- fixed here with the same policy shape already used for the sibling
-- webinar_events/webinar_metrics tables from the same feature set.

ALTER TABLE public.acquisition_spend ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "acquisition_spend_org_read" ON public.acquisition_spend;
CREATE POLICY "acquisition_spend_org_read" ON public.acquisition_spend FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), org_id));

DROP POLICY IF EXISTS "acquisition_spend_org_write" ON public.acquisition_spend;
CREATE POLICY "acquisition_spend_org_write" ON public.acquisition_spend FOR ALL TO authenticated
  USING (public.has_org_role(auth.uid(), org_id, ARRAY['owner','admin','growth_ops']::app_role[]))
  WITH CHECK (public.has_org_role(auth.uid(), org_id, ARRAY['owner','admin','growth_ops']::app_role[]));
