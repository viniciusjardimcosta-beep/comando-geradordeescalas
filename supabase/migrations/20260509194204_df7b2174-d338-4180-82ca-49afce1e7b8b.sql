DROP POLICY IF EXISTS "Usuários excluem seus próprios arquivos de escala" ON storage.objects;

CREATE POLICY "Usuários excluem seus próprios arquivos de escala"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'escalas'
  AND auth.uid()::text = (storage.foldername(name))[1]
  AND get_user_status(auth.uid()) = 'aprovado'::user_status
);