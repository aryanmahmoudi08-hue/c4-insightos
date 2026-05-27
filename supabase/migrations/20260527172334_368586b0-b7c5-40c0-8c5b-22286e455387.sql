
-- 1) Resolve admin org via SECURITY DEFINER and insert membership request safely
CREATE OR REPLACE FUNCTION public.submit_membership_request(
  _admin_email text,
  _email text,
  _full_name text,
  _requested_role app_role
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE _admin uuid; _org uuid; _id uuid;
BEGIN
  IF _admin_email IS NULL OR _email IS NULL OR _full_name IS NULL THEN
    RAISE EXCEPTION 'missing fields';
  END IF;
  SELECT id INTO _admin FROM auth.users WHERE lower(email) = lower(_admin_email) LIMIT 1;
  IF _admin IS NULL THEN RAISE EXCEPTION 'admin not found'; END IF;
  SELECT org_id INTO _org FROM public.memberships
    WHERE user_id = _admin AND role IN ('owner','admin')
    ORDER BY created_at ASC LIMIT 1;
  IF _org IS NULL THEN RAISE EXCEPTION 'no workspace for admin'; END IF;
  INSERT INTO public.membership_requests (org_id, email, full_name, admin_email, requested_role, status)
    VALUES (_org, _email, _full_name, _admin_email, _requested_role, 'pending')
    RETURNING id INTO _id;
  RETURN _id;
END $$;

REVOKE ALL ON FUNCTION public.submit_membership_request(text,text,text,app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_membership_request(text,text,text,app_role) TO anon, authenticated;

-- 2) Drop the open INSERT policy on membership_requests; the function above is the only path
DROP POLICY IF EXISTS "anyone can submit request" ON public.membership_requests;

-- 3) Realtime for membership_requests
ALTER PUBLICATION supabase_realtime ADD TABLE public.membership_requests;

-- 4) Lock down public-readable catalog tables to authenticated only
DROP POLICY IF EXISTS "anyone read connector_registry" ON public.connector_registry;
CREATE POLICY "authenticated read connector_registry" ON public.connector_registry
  FOR SELECT TO authenticated USING (true);
REVOKE SELECT ON public.connector_registry FROM anon;

DROP POLICY IF EXISTS "anyone read formula_variables" ON public.formula_variables;
CREATE POLICY "authenticated read formula_variables" ON public.formula_variables
  FOR SELECT TO authenticated USING (true);
REVOKE SELECT ON public.formula_variables FROM anon;

-- 5) metric_definitions: restrict system-level reads to authenticated
DROP POLICY IF EXISTS "metric_defs read" ON public.metric_definitions;
CREATE POLICY "metric_defs read" ON public.metric_definitions
  FOR SELECT TO authenticated
  USING (org_id IS NULL OR is_org_member(auth.uid(), org_id));
REVOKE SELECT ON public.metric_definitions FROM anon;
