-- Carry the applicant's photo onto their profile when they are approved.
--
-- `profiles.avatar_url` has existed since the first migration and has never
-- been written to; the request form only started collecting a photo in
-- 20261029130000. Approval already copies `full_name` onto the profile, so the
-- photo belongs in exactly the same place — otherwise the upload is collected,
-- stored, and never seen again.
--
-- The column stores the object path inside the private applicant-photos
-- bucket, not a URL, matching what membership_requests.photo_path holds. A URL
-- would be wrong here twice over: the bucket is private, so any URL is a
-- signed one that expires, and baking an expiring value into a profile row
-- guarantees it is stale by the time anyone reads it.
COMMENT ON COLUMN public.profiles.avatar_url IS
  'Object path inside the applicant-photos bucket (not a URL). Readers sign it on demand; the bucket is private.';

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

    -- COALESCE on the photo, not on the name: re-approving someone who applied
    -- again without a photo should keep the picture they already have rather
    -- than blanking their avatar.
    UPDATE public.profiles
    SET display_name = _req.full_name,
        avatar_url = COALESCE(_req.photo_path, public.profiles.avatar_url)
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
