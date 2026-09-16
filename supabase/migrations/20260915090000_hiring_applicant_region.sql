-- Hiring: adds a region/location field so sales-candidate applications can
-- be filtered by where the candidate is based. Plain text column, matching
-- this table's existing convention for role_applied/stage — the allowed
-- values are enforced in the app (src/lib/hiring.ts), not a DB check
-- constraint, so the option list can grow without a migration.
ALTER TABLE public.hiring_applicants
  ADD COLUMN IF NOT EXISTS region text;

CREATE INDEX IF NOT EXISTS idx_hiring_applicants_region ON public.hiring_applicants(org_id, region);
