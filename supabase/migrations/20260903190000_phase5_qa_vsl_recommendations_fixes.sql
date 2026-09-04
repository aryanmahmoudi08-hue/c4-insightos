-- Phase 5 QA correction pass: B2 and B10.
-- Additive/corrective only — no data is deleted or rewritten.

-- B2: vsl_recommendations_org_write was created (20260903180000) with
-- ['owner','admin','growth_ops'], but the pre-existing vsls/vsl_metric_snapshots
-- write policies (20260704064935) allow ['owner','admin','sales_manager','growth_ops'].
-- A sales_manager who can create VSLs and import snapshots would get a silent
-- RLS-denied failure changing an Action Queue item's status. Idempotent:
-- drop-and-recreate with the corrected, matching role list. Read policy is
-- unchanged (still every org member) — this only widens who can write, to
-- match an existing, already-broader write policy on sibling tables.
DROP POLICY IF EXISTS "vsl_recommendations_org_write" ON public.vsl_recommendations;
CREATE POLICY "vsl_recommendations_org_write" ON public.vsl_recommendations FOR ALL TO authenticated
  USING (public.has_org_role(auth.uid(), org_id, ARRAY['owner','admin','sales_manager','growth_ops']::app_role[]))
  WITH CHECK (public.has_org_role(auth.uid(), org_id, ARRAY['owner','admin','sales_manager','growth_ops']::app_role[]));

-- B10: bound confidence to a real [0,1] probability at the DB level, not just
-- in application code (buildRecommendationEvidence never invents a value, but
-- the column itself had no defense of its own). Idempotent via drop-if-exists.
ALTER TABLE public.vsl_recommendations DROP CONSTRAINT IF EXISTS vsl_recommendations_confidence_check;
ALTER TABLE public.vsl_recommendations
  ADD CONSTRAINT vsl_recommendations_confidence_check
  CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1));
