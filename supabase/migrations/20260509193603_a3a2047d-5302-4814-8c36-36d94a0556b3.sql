DROP POLICY IF EXISTS "Usuários enviam seus próprios arquivos de escala" ON storage.objects;
DROP POLICY IF EXISTS "Usuários atualizam seus próprios arquivos de escala" ON storage.objects;

CREATE POLICY "Usuários enviam seus próprios arquivos de escala"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'escalas'
  AND (auth.uid())::text = (storage.foldername(name))[1]
  AND public.get_user_status(auth.uid()) = 'aprovado'::public.user_status
);

CREATE POLICY "Usuários atualizam seus próprios arquivos de escala"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'escalas'
  AND (auth.uid())::text = (storage.foldername(name))[1]
  AND public.get_user_status(auth.uid()) = 'aprovado'::public.user_status
)
WITH CHECK (
  bucket_id = 'escalas'
  AND (auth.uid())::text = (storage.foldername(name))[1]
  AND public.get_user_status(auth.uid()) = 'aprovado'::public.user_status
);