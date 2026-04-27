
-- Adiciona matrícula em militares (para casar com aba Efetivo da planilha)
ALTER TABLE public.militares
  ADD COLUMN IF NOT EXISTS matricula_norm text
  GENERATED ALWAYS AS (regexp_replace(coalesce(matricula,''), '[^0-9]', '', 'g')) STORED;

CREATE INDEX IF NOT EXISTS idx_militares_user_matricula
  ON public.militares (user_id, matricula_norm);

-- Adiciona campos para observações livres e parâmetros estruturados nas escalas geradas
ALTER TABLE public.escalas_geradas
  ADD COLUMN IF NOT EXISTS observacoes_texto text,
  ADD COLUMN IF NOT EXISTS parametros jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS arquivo_saida_path text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pendente';

-- Bucket de storage para guardar planilhas de entrada e saída
INSERT INTO storage.buckets (id, name, public)
VALUES ('escalas', 'escalas', false)
ON CONFLICT (id) DO NOTHING;

-- Policies do bucket: usuário aprovado lê/escreve só sua própria pasta
CREATE POLICY "Usuários veem seus próprios arquivos de escala"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'escalas' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Usuários enviam seus próprios arquivos de escala"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'escalas' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Usuários atualizam seus próprios arquivos de escala"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'escalas' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Usuários excluem seus próprios arquivos de escala"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'escalas' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Admins veem todos os arquivos de escala"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'escalas' AND public.has_role(auth.uid(), 'admin'));
