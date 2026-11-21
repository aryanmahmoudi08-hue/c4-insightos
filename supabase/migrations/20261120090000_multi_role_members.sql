-- More than one role per person: a closer who also dials, a setter who also
-- closes, or the full stack (DM setter + inbound dialer + closer).
--
-- memberships.role stays the one "primary" role every existing check reads
-- (has_org_role, the server functions, the Home dashboard). The extra rep
-- roles go in additional_roles. Only rep roles can be extra: a person is one
-- of owner / admin / sales manager / growth ops / viewer at most, so an
-- extra role can never grant admin access. src/lib/permissions.ts
-- (splitRoles) applies the same rules in the app.
--
-- Permissions for someone with several roles are the union: each page is
-- visible/editable if any of their roles allows it.

ALTER TABLE public.memberships
  ADD COLUMN IF NOT EXISTS additional_roles public.app_role[] NOT NULL DEFAULT '{}';

ALTER TABLE public.memberships
  DROP CONSTRAINT IF EXISTS memberships_additional_roles_rep_only;
ALTER TABLE public.memberships
  ADD CONSTRAINT memberships_additional_roles_rep_only CHECK (
    additional_roles <@ ARRAY['setter', 'inbound_dialer', 'closer']::public.app_role[]
    AND NOT (role = ANY (additional_roles))
  );

COMMENT ON COLUMN public.memberships.additional_roles IS
  'Rep roles held on top of `role` (setter / inbound_dialer / closer). Permissions are the union.';

-- What the applicant asked for, all of it. requested_role stays as the
-- primary one so older readers keep working.
ALTER TABLE public.membership_requests
  ADD COLUMN IF NOT EXISTS requested_roles public.app_role[] NOT NULL DEFAULT '{}';

-- A rep-role check now also matches someone's extra roles. Extra roles are
-- rep roles only, so this can never widen an owner/admin check.
CREATE OR REPLACE FUNCTION public.has_org_role(_user_id uuid, _org_id uuid, _roles public.app_role[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships
    WHERE user_id = _user_id
      AND org_id = _org_id
      AND (role = ANY (_roles) OR additional_roles && _roles)
  );
$$;

/* ------------------------------------------------------------------ */
/* Submitting a request with several roles                             */
/* ------------------------------------------------------------------ */

-- Replaced, not overloaded: two versions with defaulted arguments make an
-- existing call ambiguous.
DROP FUNCTION IF EXISTS public.submit_membership_request(text, text, text, app_role, text, text);

CREATE OR REPLACE FUNCTION public.submit_membership_request(
  _admin_email text,
  _email text,
  _full_name text,
  _requested_role app_role,
  _phone text DEFAULT NULL,
  _photo_path text DEFAULT NULL,
  _requested_roles app_role[] DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE _admin uuid; _org uuid; _id uuid; _roles app_role[];
BEGIN
  IF _admin_email IS NULL OR _email IS NULL OR _full_name IS NULL THEN
    RAISE EXCEPTION 'missing fields';
  END IF;
  -- Always includes the primary role, never duplicates.
  SELECT coalesce(array_agg(DISTINCT r), '{}') INTO _roles
    FROM unnest(array_append(coalesce(_requested_roles, '{}'), _requested_role)) AS r
    WHERE r IS NOT NULL;
  -- Applicants can never ask for owner/admin, however the form is posted.
  IF _roles && ARRAY['owner', 'admin']::app_role[] THEN
    RAISE EXCEPTION 'that role cannot be requested';
  END IF;
  SELECT id INTO _admin FROM auth.users WHERE lower(email) = lower(_admin_email) LIMIT 1;
  IF _admin IS NULL THEN RAISE EXCEPTION 'admin not found'; END IF;
  SELECT org_id INTO _org FROM public.memberships
    WHERE user_id = _admin AND role IN ('owner','admin')
    ORDER BY created_at ASC LIMIT 1;
  IF _org IS NULL THEN RAISE EXCEPTION 'no workspace for admin'; END IF;
  INSERT INTO public.membership_requests
    (org_id, email, full_name, admin_email, requested_role, requested_roles, status, phone, photo_path)
    VALUES
    (_org, _email, _full_name, _admin_email, _requested_role, _roles, 'pending',
     nullif(btrim(_phone), ''), nullif(btrim(_photo_path), ''))
    RETURNING id INTO _id;
  RETURN _id;
END $$;

REVOKE ALL ON FUNCTION public.submit_membership_request(text, text, text, app_role, text, text, app_role[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_membership_request(text, text, text, app_role, text, text, app_role[]) TO anon, authenticated;

/* ------------------------------------------------------------------ */
/* Rep seats (team_members) follow the roles                           */
/* ------------------------------------------------------------------ */

-- One active team_members seat per rep role the person holds; seats for rep
-- roles they no longer hold are deactivated (kept, so their history and
-- leaderboard rows still have a name), never deleted.
CREATE OR REPLACE FUNCTION public.sync_member_rep_seats(
  _org_id uuid,
  _user_id uuid,
  _name text,
  _roles app_role[]
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _slot text; _r app_role;
BEGIN
  FOREACH _r IN ARRAY ARRAY['setter', 'inbound_dialer', 'closer']::app_role[] LOOP
    _slot := CASE _r WHEN 'setter' THEN 'dm_setter' ELSE _r::text END;
    IF _r = ANY (_roles) THEN
      -- Reuse the seat already linked to this person when there is one,
      -- whatever name it carries; otherwise take (or create) the seat by name.
      IF EXISTS (
        SELECT 1 FROM public.team_members
        WHERE org_id = _org_id AND role = _slot AND user_id = _user_id
      ) THEN
        UPDATE public.team_members SET active = true, updated_at = now()
        WHERE org_id = _org_id AND role = _slot AND user_id = _user_id;
      ELSE
        INSERT INTO public.team_members (org_id, name, role, user_id, active)
        VALUES (_org_id, _name, _slot, _user_id, true)
        ON CONFLICT (org_id, role, name)
        DO UPDATE SET
          active = true,
          user_id = COALESCE(public.team_members.user_id, excluded.user_id),
          updated_at = now();
      END IF;
    ELSE
      UPDATE public.team_members SET active = false, updated_at = now()
      WHERE org_id = _org_id AND role = _slot AND user_id = _user_id AND active;
    END IF;
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.sync_member_rep_seats(uuid, uuid, text, app_role[]) FROM PUBLIC, anon, authenticated;

/* ------------------------------------------------------------------ */
/* Approving with several roles                                        */
/* ------------------------------------------------------------------ */

DROP FUNCTION IF EXISTS public.approve_membership_request(uuid, app_role);

CREATE OR REPLACE FUNCTION public.approve_membership_request(
  _request_id uuid,
  _role app_role,
  _additional_roles app_role[] DEFAULT '{}'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  _req record;
  _user uuid;
  _extra app_role[];
BEGIN
  SELECT * INTO _req FROM public.membership_requests WHERE id = _request_id;
  IF _req IS NULL THEN
    RAISE EXCEPTION 'request not found';
  END IF;

  IF NOT public.has_org_role(auth.uid(), _req.org_id, ARRAY['owner', 'admin']::app_role[]) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT coalesce(array_agg(DISTINCT r), '{}') INTO _extra
    FROM unnest(coalesce(_additional_roles, '{}')) AS r
    WHERE r IS NOT NULL AND r <> _role;
  IF NOT (_extra <@ ARRAY['setter', 'inbound_dialer', 'closer']::app_role[]) THEN
    RAISE EXCEPTION 'only DM setter, inbound dialer and closer can be added as extra roles';
  END IF;

  SELECT id INTO _user FROM auth.users WHERE lower(email) = lower(_req.email) LIMIT 1;

  IF _user IS NOT NULL THEN
    INSERT INTO public.memberships (org_id, user_id, role, additional_roles)
    VALUES (_req.org_id, _user, _role, _extra)
    ON CONFLICT DO NOTHING;

    -- COALESCE on the photo, not on the name: re-approving someone who applied
    -- again without a photo should keep the picture they already have rather
    -- than blanking their avatar.
    UPDATE public.profiles
    SET display_name = _req.full_name,
        avatar_url = COALESCE(_req.photo_path, public.profiles.avatar_url)
    WHERE id = _user;

    PERFORM public.sync_member_rep_seats(
      _req.org_id, _user, _req.full_name, array_prepend(_role, _extra)
    );
  END IF;

  UPDATE public.membership_requests
  SET status = 'approved', decided_at = now(), decided_by = auth.uid()
  WHERE id = _request_id;

  INSERT INTO public.access_audit_log (org_id, actor_user_id, action, target_user_id, target_email, detail)
  VALUES (_req.org_id, auth.uid(), 'membership_approved', _user, _req.email,
    jsonb_build_object(
      'role', _role,
      'additional_roles', _extra,
      'requested_role', _req.requested_role,
      'requested_roles', _req.requested_roles,
      'request_id', _request_id
    ));

  RETURN _user;
END
$function$;

REVOKE ALL ON FUNCTION public.approve_membership_request(uuid, app_role, app_role[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_membership_request(uuid, app_role, app_role[]) TO authenticated;

/* ------------------------------------------------------------------ */
/* Changing an existing member's roles                                 */
/* ------------------------------------------------------------------ */

CREATE OR REPLACE FUNCTION public.set_member_roles(
  _org_id uuid,
  _user_id uuid,
  _role app_role,
  _additional_roles app_role[] DEFAULT '{}'
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  _current record;
  _extra app_role[];
  _name text;
BEGIN
  IF NOT public.has_org_role(auth.uid(), _org_id, ARRAY['owner', 'admin']::app_role[]) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT role, additional_roles INTO _current
    FROM public.memberships WHERE org_id = _org_id AND user_id = _user_id;
  IF _current IS NULL THEN RAISE EXCEPTION 'not a member of this workspace'; END IF;

  -- The account holder stays the account holder, and nobody can take away
  -- their own admin access by accident. Extra rep roles are still fine.
  IF _current.role = 'owner' AND _role <> 'owner' THEN
    RAISE EXCEPTION 'the owner''s main role cannot be changed';
  END IF;
  IF _role = 'owner' AND _current.role <> 'owner' THEN
    RAISE EXCEPTION 'owner cannot be assigned here';
  END IF;
  IF _user_id = auth.uid() AND _role <> _current.role THEN
    RAISE EXCEPTION 'you cannot change your own main role';
  END IF;

  SELECT coalesce(array_agg(DISTINCT r), '{}') INTO _extra
    FROM unnest(coalesce(_additional_roles, '{}')) AS r
    WHERE r IS NOT NULL AND r <> _role;
  IF NOT (_extra <@ ARRAY['setter', 'inbound_dialer', 'closer']::app_role[]) THEN
    RAISE EXCEPTION 'only DM setter, inbound dialer and closer can be added as extra roles';
  END IF;

  UPDATE public.memberships
  SET role = _role, additional_roles = _extra
  WHERE org_id = _org_id AND user_id = _user_id;

  SELECT coalesce(nullif(btrim(p.display_name), ''), u.email) INTO _name
    FROM auth.users u LEFT JOIN public.profiles p ON p.id = u.id
    WHERE u.id = _user_id;

  PERFORM public.sync_member_rep_seats(_org_id, _user_id, _name, array_prepend(_role, _extra));

  INSERT INTO public.access_audit_log (org_id, actor_user_id, action, target_user_id, detail)
  VALUES (_org_id, auth.uid(), 'roles_changed', _user_id,
    jsonb_build_object(
      'from', jsonb_build_object('role', _current.role, 'additional_roles', _current.additional_roles),
      'to', jsonb_build_object('role', _role, 'additional_roles', _extra)
    ));
END $$;

REVOKE ALL ON FUNCTION public.set_member_roles(uuid, uuid, app_role, app_role[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_member_roles(uuid, uuid, app_role, app_role[]) TO authenticated;
