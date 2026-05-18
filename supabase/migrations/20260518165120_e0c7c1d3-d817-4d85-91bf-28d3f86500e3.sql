GRANT EXECUTE ON FUNCTION public.has_org_role(uuid, uuid, app_role[]) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_org_member(uuid, uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.current_user_orgs() TO authenticated, anon;