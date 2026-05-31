
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_user_status(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_active_access(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_status(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_active_access(uuid) TO authenticated;
