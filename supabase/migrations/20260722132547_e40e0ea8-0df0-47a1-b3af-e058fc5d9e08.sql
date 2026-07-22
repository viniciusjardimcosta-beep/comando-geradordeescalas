
-- 1) Campos complementares em militares (opcionais)
ALTER TABLE public.militares
  ADD COLUMN IF NOT EXISTS quadro TEXT,
  ADD COLUMN IF NOT EXISTS lotacao_nbi TEXT,
  ADD COLUMN IF NOT EXISTS funcao_atual TEXT,
  ADD COLUMN IF NOT EXISTS genero_gramatical TEXT CHECK (genero_gramatical IN ('M','F') OR genero_gramatical IS NULL),
  ADD COLUMN IF NOT EXISTS nome_guerra TEXT;

-- 2) nbi_settings
CREATE TABLE IF NOT EXISTS public.nbi_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  digitador_militar_id UUID REFERENCES public.militares(id) ON DELETE SET NULL,
  digitador_nome TEXT,
  digitador_funcao TEXT,
  digitador_lotacao TEXT,
  comandante_militar_id UUID REFERENCES public.militares(id) ON DELETE SET NULL,
  comandante_nome TEXT,
  comandante_funcao TEXT,
  comandante_lotacao TEXT,
  autoridade_militar_id UUID REFERENCES public.militares(id) ON DELETE SET NULL,
  autoridade_nome TEXT,
  autoridade_funcao TEXT,
  autoridade_lotacao TEXT,
  unidade_nome TEXT,
  unidade_sigla TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nbi_settings TO authenticated;
GRANT ALL ON public.nbi_settings TO service_role;
ALTER TABLE public.nbi_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own nbi_settings" ON public.nbi_settings
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_nbi_settings_updated BEFORE UPDATE ON public.nbi_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3) nbi_templates (catálogo global)
CREATE TABLE IF NOT EXISTS public.nbi_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT NOT NULL UNIQUE,
  titulo TEXT NOT NULL,
  ordem INT NOT NULL DEFAULT 0,
  disponivel BOOLEAN NOT NULL DEFAULT false,
  descricao TEXT,
  campos JSONB NOT NULL DEFAULT '[]'::jsonb,
  texto_modelo TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.nbi_templates TO authenticated;
GRANT ALL ON public.nbi_templates TO service_role;
ALTER TABLE public.nbi_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read nbi_templates" ON public.nbi_templates
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manage nbi_templates" ON public.nbi_templates
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_nbi_templates_updated BEFORE UPDATE ON public.nbi_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4) nbi_template_versions (histórico do texto oficial)
CREATE TABLE IF NOT EXISTS public.nbi_template_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.nbi_templates(id) ON DELETE CASCADE,
  versao INT NOT NULL,
  texto_modelo TEXT NOT NULL,
  observacao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(template_id, versao)
);
GRANT SELECT ON public.nbi_template_versions TO authenticated;
GRANT ALL ON public.nbi_template_versions TO service_role;
ALTER TABLE public.nbi_template_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read nbi_template_versions" ON public.nbi_template_versions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manage nbi_template_versions" ON public.nbi_template_versions
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 5) nbi_documents (NBIs geradas)
CREATE TABLE IF NOT EXISTS public.nbi_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  numero TEXT,
  ano INT,
  data_documento DATE NOT NULL DEFAULT CURRENT_DATE,
  titulo TEXT,
  assuntos JSONB NOT NULL DEFAULT '[]'::jsonb,
  responsaveis JSONB NOT NULL DEFAULT '{}'::jsonb,
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  storage_path TEXT,
  status TEXT NOT NULL DEFAULT 'rascunho',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nbi_documents TO authenticated;
GRANT ALL ON public.nbi_documents TO service_role;
ALTER TABLE public.nbi_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own nbi_documents select" ON public.nbi_documents
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own nbi_documents insert" ON public.nbi_documents
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own nbi_documents update rascunho" ON public.nbi_documents
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND status = 'rascunho')
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own nbi_documents delete" ON public.nbi_documents
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER trg_nbi_documents_updated BEFORE UPDATE ON public.nbi_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 6) Seed inicial dos 15 templates oficiais (idempotente)
INSERT INTO public.nbi_templates (codigo, titulo, ordem, disponivel, texto_modelo) VALUES
  ('ferias',                'Férias',                              1, true,  ''),
  ('apresentacao',          'Apresentação',                        2, true,  ''),
  ('viagem',                'Viagem',                              3, true,  ''),
  ('assuncao_funcao',       'Assunção de função',                  4, true,  ''),
  ('dispensa_funcao',       'Dispensa de função',                  5, true,  ''),
  ('servico_extraordinario','Serviço extraordinário',              6, false, ''),
  ('assuncao_cargo_vago',   'Assunção de função de cargo vago',    7, false, ''),
  ('dispensa_cargo_vago',   'Dispensa de função de cargo vago',    8, false, ''),
  ('dispensa_recompensa',   'Dispensa por recompensa',             9, false, ''),
  ('licenca_paternidade',   'Licença-paternidade',                10, false, ''),
  ('luto',                  'Luto',                               11, false, ''),
  ('nomeacao_comissao',     'Nomeação de comissão',               12, false, ''),
  ('renovacao_tempo',       'Renovação de tempo de serviço',      13, false, ''),
  ('situacao_sanitaria',    'Situação sanitária',                 14, false, ''),
  ('comunicado',            'Comunicado',                         15, false, '')
ON CONFLICT (codigo) DO NOTHING;
