-- Split "Inbound Dialer" out of the generic "setter" app_role so Access
-- Control (src/lib/permissions.ts / src/routes/_authenticated.permissions.tsx)
-- can manage its own view/edit permissions independently of DM Setter,
-- instead of both sharing one role row. src/lib/eod-rbac.ts already
-- anticipated this exact enum value (CanonicalAppRole's "inbound_dialer"
-- union member) before the database actually had it — this migration is
-- what makes that real.
--
-- New enum values must be committed before they can be referenced in a
-- CASE/comparison (Postgres "unsafe use of new value" restriction), so the
-- follow-up wiring (approve_membership_request's slot-role mapping) is a
-- separate migration file.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'inbound_dialer' AND enumtypid = 'app_role'::regtype) THEN
    ALTER TYPE app_role ADD VALUE 'inbound_dialer';
  END IF;
END $$;
