
-- Clients schema additions
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS invested_to_date_cents bigint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS expected_next_payment_cents bigint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS expected_next_payment_date date,
  ADD COLUMN IF NOT EXISTS pre_close_summary text,
  ADD COLUMN IF NOT EXISTS pre_close_raw jsonb DEFAULT '{}'::jsonb;

-- Extend app_role enum (idempotent guards)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel='setter' AND enumtypid='app_role'::regtype) THEN
    ALTER TYPE app_role ADD VALUE 'setter';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel='closer' AND enumtypid='app_role'::regtype) THEN
    ALTER TYPE app_role ADD VALUE 'closer';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel='sales_manager' AND enumtypid='app_role'::regtype) THEN
    ALTER TYPE app_role ADD VALUE 'sales_manager';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel='growth_ops' AND enumtypid='app_role'::regtype) THEN
    ALTER TYPE app_role ADD VALUE 'growth_ops';
  END IF;
END $$;

-- Membership requests table
CREATE TABLE IF NOT EXISTS public.membership_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  email text NOT NULL,
  full_name text NOT NULL,
  requested_role app_role NOT NULL DEFAULT 'viewer',
  status text NOT NULL DEFAULT 'pending',
  admin_email text,
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.membership_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anyone can submit request" ON public.membership_requests;
CREATE POLICY "anyone can submit request" ON public.membership_requests
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "admins read requests" ON public.membership_requests;
CREATE POLICY "admins read requests" ON public.membership_requests
  FOR SELECT TO authenticated
  USING (has_org_role(auth.uid(), org_id, ARRAY['owner'::app_role,'admin'::app_role]));

DROP POLICY IF EXISTS "admins update requests" ON public.membership_requests;
CREATE POLICY "admins update requests" ON public.membership_requests
  FOR UPDATE TO authenticated
  USING (has_org_role(auth.uid(), org_id, ARRAY['owner'::app_role,'admin'::app_role]));

CREATE INDEX IF NOT EXISTS idx_membership_requests_org ON public.membership_requests(org_id, status);
