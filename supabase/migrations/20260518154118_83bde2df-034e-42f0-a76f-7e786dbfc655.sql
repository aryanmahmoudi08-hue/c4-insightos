
-- Fix mutable search_path on tg_set_updated_at
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$ begin new.updated_at = now(); return new; end; $function$;

-- Revoke broad execute on SECURITY DEFINER helpers; keep handle_new_user invokable by the auth trigger (runs as definer regardless)
REVOKE EXECUTE ON FUNCTION public.is_org_member(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_org_role(uuid, uuid, app_role[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.current_user_orgs() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_orgs() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
