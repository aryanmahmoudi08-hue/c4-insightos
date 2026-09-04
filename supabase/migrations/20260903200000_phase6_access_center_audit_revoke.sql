-- Phase 6: Access Center production-readiness.
-- Additive/corrective only — no existing rows are deleted or rewritten.
--
-- Gap found on inspection: there was no way to revoke a departing teammate's
-- access (only approve/reject of a *pending* request existed), and no
-- "important access change" (approve/reject/revoke) left an audit trail
-- beyond membership_requests.decided_by/decided_at for that one workflow.
-- This migration adds a minimal, purpose-built audit log for access
-- governance (not a general-purpose activity log — that would be new
-- architecture beyond Phase 6's scope) and a real revoke function that
-- reuses the exact same has_org_role authorization pattern as every other
-- access-control function in this schema.

CREATE TABLE IF NOT EXISTS public.access_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_user_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('membership_approved', 'membership_rejected', 'access_revoked')),
  target_user_id uuid,
  target_email text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.access_audit_log ENABLE ROW LEVEL SECURITY;

-- Read-only for org admins/owners — rows are only ever written by the
-- SECURITY DEFINER functions below (which bypass RLS as their function
-- owner), so no INSERT/UPDATE/DELETE policy is granted to any client role.
-- This makes the log append-only and tamper-resistant from the client.
DROP POLICY IF EXISTS "access_audit_log_org_read" ON public.access_audit_log;
CREATE POLICY "access_audit_log_org_read" ON public.access_audit_log FOR SELECT TO authenticated
  USING (public.has_org_role(auth.uid(), org_id, ARRAY['owner', 'admin']::app_role[]));

CREATE INDEX IF NOT EXISTS access_audit_log_org_idx ON public.access_audit_log (org_id, created_at DESC);

-- Revoke a teammate's access. Mirrors approve/reject_membership_request's
-- authorization pattern exactly. Refuses to let an admin revoke their own
-- access (avoids accidental self-lockout) or revoke an owner (ownership
-- transfer isn't a workflow this schema has — removing the only owner
-- would orphan the org).
CREATE OR REPLACE FUNCTION public.revoke_membership_access(_org_id uuid, _target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _target_role app_role;
  _target_email text;
BEGIN
  IF NOT public.has_org_role(auth.uid(), _org_id, ARRAY['owner', 'admin']::app_role[]) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF _target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'cannot revoke your own access';
  END IF;

  SELECT role INTO _target_role FROM public.memberships
    WHERE org_id = _org_id AND user_id = _target_user_id;
  IF _target_role IS NULL THEN
    RAISE EXCEPTION 'membership not found';
  END IF;
  IF _target_role = 'owner' THEN
    RAISE EXCEPTION 'cannot revoke an owner';
  END IF;

  SELECT email INTO _target_email FROM auth.users WHERE id = _target_user_id;

  DELETE FROM public.memberships WHERE org_id = _org_id AND user_id = _target_user_id;
  DELETE FROM public.member_permissions WHERE org_id = _org_id AND user_id = _target_user_id;

  INSERT INTO public.access_audit_log (org_id, actor_user_id, action, target_user_id, target_email, detail)
  VALUES (_org_id, auth.uid(), 'access_revoked', _target_user_id, _target_email,
    jsonb_build_object('previous_role', _target_role));
END;
$$;

GRANT EXECUTE ON FUNCTION public.revoke_membership_access(uuid, uuid) TO authenticated;

-- Redefine approve/reject to also write an audit row — same authorization
-- and business logic as the existing function (20260527212141), only the
-- audit insert is new.
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
END;
$function$;

CREATE OR REPLACE FUNCTION public.reject_membership_request(_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _org uuid; _email text;
BEGIN
  SELECT org_id, email INTO _org, _email FROM public.membership_requests WHERE id = _request_id;
  IF _org IS NULL THEN RAISE EXCEPTION 'request not found'; END IF;
  IF NOT public.has_org_role(auth.uid(), _org, ARRAY['owner','admin']::app_role[]) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  UPDATE public.membership_requests
    SET status = 'rejected', decided_at = now(), decided_by = auth.uid()
    WHERE id = _request_id;

  INSERT INTO public.access_audit_log (org_id, actor_user_id, action, target_email, detail)
  VALUES (_org, auth.uid(), 'membership_rejected', _email, jsonb_build_object('request_id', _request_id));
END $$;

GRANT EXECUTE ON FUNCTION public.approve_membership_request(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_membership_request(uuid) TO authenticated;
