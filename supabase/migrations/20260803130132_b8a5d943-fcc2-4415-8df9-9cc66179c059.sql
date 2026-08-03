CREATE TABLE public.nbi_substituicoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assuncao_documento_id UUID REFERENCES public.nbi_documents(id) ON DELETE SET NULL,
  dispensa_documento_id UUID REFERENCES public.nbi_documents(id) ON DELETE SET NULL,
  substituto_militar_id UUID REFERENCES public.militares(id) ON DELETE SET NULL,
  titular_militar_id UUID REFERENCES public.militares(id) ON DELETE SET NULL,
  funcao TEXT,
  motivo TEXT,
  data_inicio DATE,
  data_fim_prevista DATE,
  status TEXT NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta','encerrada','cancelada')),
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.nbi_substituicoes TO authenticated;
GRANT ALL ON public.nbi_substituicoes TO service_role;

ALTER TABLE public.nbi_substituicoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nbi_subst_select_own" ON public.nbi_substituicoes FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "nbi_subst_insert_own" ON public.nbi_substituicoes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "nbi_subst_update_own" ON public.nbi_substituicoes FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX nbi_subst_user_status_idx ON public.nbi_substituicoes (user_id, status);

CREATE TRIGGER nbi_substituicoes_set_updated_at BEFORE UPDATE ON public.nbi_substituicoes
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();