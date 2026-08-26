CREATE OR REPLACE FUNCTION public.finalizar_senha_temporaria()
RETURNS TABLE(id uuid, password_temporary boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_exists BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT TRUE INTO v_exists FROM public.profiles AS p WHERE p.id = v_uid;
  IF NOT COALESCE(v_exists, FALSE) THEN
    RAISE EXCEPTION 'Perfil não encontrado';
  END IF;

  -- Superfície mínima: apenas password_temporary, apenas do próprio usuário.
  UPDATE public.profiles AS p
     SET password_temporary = FALSE
   WHERE p.id = v_uid
     AND p.password_temporary IS DISTINCT FROM FALSE;

  RETURN QUERY
    SELECT p.id, p.password_temporary
      FROM public.profiles AS p
      WHERE p.id = v_uid;
END;
$$;

REVOKE ALL ON FUNCTION public.finalizar_senha_temporaria() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalizar_senha_temporaria() FROM anon;
GRANT EXECUTE ON FUNCTION public.finalizar_senha_temporaria() TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalizar_senha_temporaria() TO service_role;