REVOKE EXECUTE ON FUNCTION public.approve_membership_request(uuid, app_role) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.approve_membership_request(uuid, app_role) FROM anon;
GRANT EXECUTE ON FUNCTION public.approve_membership_request(uuid, app_role) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.reject_membership_request(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reject_membership_request(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.reject_membership_request(uuid) TO authenticated;