CREATE OR REPLACE FUNCTION public.approve_membership_request(_request_id uuid, _role app_role)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE _req record; _user uuid;
BEGIN
  SELECT * INTO _req FROM public.membership_requests WHERE id = _request_id;
  IF _req IS NULL THEN RAISE EXCEPTION 'request not found'; END IF;
  IF NOT public.has_org_role(auth.uid(), _req.org_id, ARRAY['owner','admin']::app_role[]) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  SELECT id INTO _user FROM auth.users WHERE lower(email) = lower(_req.email) LIMIT 1;
  IF _user IS NOT NULL THEN
    INSERT INTO public.memberships (org_id, user_id, role) VALUES (_req.org_id, _user, _role)
      ON CONFLICT DO NOTHING;
    UPDATE public.profiles SET display_name = COALESCE(NULLIF(display_name,''), _req.full_name) WHERE id = _user;
  END IF;
  UPDATE public.membership_requests
    SET status = 'approved', decided_at = now(), decided_by = auth.uid()
    WHERE id = _request_id;
  RETURN _user;
END $$;

CREATE OR REPLACE FUNCTION public.reject_membership_request(_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _org uuid;
BEGIN
  SELECT org_id INTO _org FROM public.membership_requests WHERE id = _request_id;
  IF _org IS NULL THEN RAISE EXCEPTION 'request not found'; END IF;
  IF NOT public.has_org_role(auth.uid(), _org, ARRAY['owner','admin']::app_role[]) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  UPDATE public.membership_requests
    SET status = 'rejected', decided_at = now(), decided_by = auth.uid()
    WHERE id = _request_id;
END $$;