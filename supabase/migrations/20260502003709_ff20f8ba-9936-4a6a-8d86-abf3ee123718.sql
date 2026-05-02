-- 1. Add DELETE policy for escalas_geradas
CREATE POLICY "Usuários aprovados excluem suas escalas"
ON public.escalas_geradas
FOR DELETE
TO authenticated
USING ((user_id = auth.uid()) AND (get_user_status(auth.uid()) = 'aprovado'::user_status));

-- 2. Revoke EXECUTE on SECURITY DEFINER helper functions from public/anon/authenticated
-- These are intended to be used inside RLS policies (run as definer), not called directly by clients.
REVOKE EXECUTE ON FUNCTION public.get_user_status(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;