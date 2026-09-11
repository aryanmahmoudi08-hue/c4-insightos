-- Security: close the self-service access hole in the signup trigger.
--
-- Gap found on inspection: `handle_new_user()` (20260518151934) fires on
-- every `auth.users` INSERT — every email/password signup, every Google
-- OAuth first login — and unconditionally created a brand-new organization
-- and inserted the new user as its 'owner'. That means knowing the app URL
-- and submitting the signup form was enough to get a real, working
-- InsightOS workspace instantly, with no admin approval anywhere in the
-- path. RLS still isolates that auto-created org from C4's real data, but
-- "create your own workspace/dashboard without authorization" is exactly
-- the access the product must not grant.
--
-- The org-scoped approval flow to replace this already exists in full
-- (membership_requests / submit_membership_request / approve_membership_request
-- from 20260525173112 + 20260527*, extended with revoke + audit in
-- 20260903200000) — this migration only removes the trigger's bypass of it.
-- Profile creation is preserved (harmless, still needed for display_name);
-- only the automatic organization + membership insert is removed. A brand
-- new user now lands with zero memberships until an existing admin approves
-- a membership_requests row for them — the client-side gate added alongside
-- this migration (`_authenticated.tsx`) renders "Access Required" for that
-- state instead of the app shell.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (new.id, COALESCE(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;

-- Trigger definition itself (on_auth_user_created) is unchanged — it already
-- points at this function by name, so redefining the function body is
-- sufficient and no data already inserted by the old behavior is touched.
