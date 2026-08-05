ALTER TABLE public.nbi_templates
  ADD COLUMN IF NOT EXISTS estado_homologacao TEXT NOT NULL DEFAULT 'homologado',
  ADD COLUMN IF NOT EXISTS subtipo TEXT,
  ADD COLUMN IF NOT EXISTS versao INTEGER NOT NULL DEFAULT 1;

UPDATE public.nbi_templates SET estado_homologacao = 'aguardando_exemplar' WHERE disponivel = false;
UPDATE public.nbi_templates SET subtipo = 'executado' WHERE codigo = 'servico_extraordinario';
UPDATE public.nbi_templates SET subtipo = 'padrao' WHERE codigo = 'nomeacao_comissao';

INSERT INTO public.nbi_templates (codigo, titulo, titulo_documento, ordem, disponivel, descricao, campos, texto_modelo, estado_homologacao, subtipo)
VALUES
  ('servico_extraordinario_convocacao', 'Serviço extraordinário — convocação futura', 'SERVIÇO EXTRAORDINÁRIO', 61, false,
   'Convocação para serviço extraordinário futuro. Aguardando exemplar oficial homologado: nenhuma redação foi criada.',
   '[{"chave":"DATA_SERVICO","label":"Data do serviço","tipo":"data","obrigatorio":true},{"chave":"HORARIO_INICIO","label":"Horário de início","tipo":"texto","obrigatorio":true},{"chave":"HORARIO_FIM","label":"Horário de término","tipo":"texto","obrigatorio":true},{"chave":"MOTIVO","label":"Motivo da convocação","tipo":"texto_longo","obrigatorio":true},{"chave":"MISSAO","label":"Missão","tipo":"texto_longo","obrigatorio":true},{"chave":"UNIDADE","label":"Unidade","tipo":"texto","obrigatorio":false},{"chave":"FUNDAMENTO","label":"Fundamento legal","tipo":"texto_longo","obrigatorio":false}]'::jsonb,
   '', 'aguardando_exemplar', 'convocacao'),
  ('nomeacao_comissao_funcoes', 'Nomeação de comissão — funções especiais', 'NOMEAÇÃO DE COMISSÃO', 121, false,
   'Variante com Secretário e/ou Relator. Aguardando exemplar oficial homologado: nenhuma redação foi criada.',
   '[{"chave":"DATA_INICIO","label":"Data da nomeação","tipo":"data","obrigatorio":true},{"chave":"COMPOSICAO","label":"Composição da comissão","tipo":"texto_longo","obrigatorio":true},{"chave":"FINALIDADE","label":"Finalidade da comissão","tipo":"texto_longo","obrigatorio":true},{"chave":"FUNDAMENTO","label":"Fundamento legal","tipo":"texto_longo","obrigatorio":false}]'::jsonb,
   '', 'aguardando_exemplar', 'funcoes_especiais')
ON CONFLICT (codigo) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.nbi_siglas_institucionais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sigla TEXT NOT NULL,
  descricao_oficial TEXT NOT NULL,
  forma_documental TEXT,
  categoria TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, sigla)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.nbi_siglas_institucionais TO authenticated;
GRANT ALL ON public.nbi_siglas_institucionais TO service_role;
ALTER TABLE public.nbi_siglas_institucionais ENABLE ROW LEVEL SECURITY;
CREATE POLICY "siglas_owner_all" ON public.nbi_siglas_institucionais
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER nbi_siglas_set_updated_at BEFORE UPDATE ON public.nbi_siglas_institucionais
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.nbi_fundamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  codigo_assunto TEXT NOT NULL,
  titulo TEXT NOT NULL,
  texto_oficial TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  padrao BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.nbi_fundamentos TO authenticated;
GRANT ALL ON public.nbi_fundamentos TO service_role;
ALTER TABLE public.nbi_fundamentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fundamentos_owner_all" ON public.nbi_fundamentos
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER nbi_fundamentos_set_updated_at BEFORE UPDATE ON public.nbi_fundamentos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();