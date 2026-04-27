
-- search_path em todas as funções
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Revogar EXECUTE público das funções internas (mantendo apenas para o owner/postgres + triggers)
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;

-- has_role e get_user_status precisam ser chamáveis por authenticated (usadas em RLS)
-- mas não devem estar disponíveis para anon
REVOKE EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_user_status(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_status(UUID) TO authenticated;
