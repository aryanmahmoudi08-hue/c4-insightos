-- Wiring for the new 'inbound_dialer' app_role added in
-- 20260916150000_inbound_dialer_role.sql (kept in a separate migration —
-- a just-added enum value can't be referenced in the same transaction).
--
-- Re-create approve_membership_request so approving someone as Inbound
-- Dialer also creates their team_members roster row, same as
-- setter -> dm_setter and closer -> closer already do.
CREATE OR REPLACE FUNCTION public.approve_membership_request(_request_id uuid, _role app_role)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  _req record;
  _user uuid;
  _slot_role text;
BEGIN
  SELECT * INTO _req FROM public.membership_requests WHERE id = _request_id;
  IF _req IS NULL THEN
    RAISE EXCEPTION 'request not found';
  END IF;

  IF NOT public.has_org_role(auth.uid(), _req.org_id, ARRAY['owner', 'admin']::app_role[]) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT id INTO _user FROM auth.users WHERE lower(email) = lower(_req.email) LIMIT 1;

  IF _user IS NOT NULL THEN
    INSERT INTO public.memberships (org_id, user_id, role)
    VALUES (_req.org_id, _user, _role)
    ON CONFLICT DO NOTHING;

    UPDATE public.profiles
    SET display_name = _req.full_name
    WHERE id = _user;

    _slot_role := CASE _role
      WHEN 'setter' THEN 'dm_setter'
      WHEN 'inbound_dialer' THEN 'inbound_dialer'
      WHEN 'closer' THEN 'closer'
      ELSE NULL
    END;

    IF _slot_role IS NOT NULL THEN
      INSERT INTO public.team_members (org_id, name, role, user_id, active)
      VALUES (_req.org_id, _req.full_name, _slot_role, _user, true)
      ON CONFLICT (org_id, role, name)
      DO UPDATE SET
        active = true,
        user_id = COALESCE(public.team_members.user_id, excluded.user_id),
        updated_at = now();
    END IF;
  END IF;

  UPDATE public.membership_requests
  SET status = 'approved', decided_at = now(), decided_by = auth.uid()
  WHERE id = _request_id;

  INSERT INTO public.access_audit_log (org_id, actor_user_id, action, target_user_id, target_email, detail)
  VALUES (_req.org_id, auth.uid(), 'membership_approved', _user, _req.email,
    jsonb_build_object('role', _role, 'requested_role', _req.requested_role, 'request_id', _request_id));

  RETURN _user;
END
$function$;
