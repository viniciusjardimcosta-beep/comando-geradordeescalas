
-- 1) Adicionar flags múltiplas de função ao militar
ALTER TABLE public.militares
  ADD COLUMN IF NOT EXISTS is_cov boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_cg  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_adm boolean NOT NULL DEFAULT false;

-- Migrar dados antigos: funcao = 'COV' → is_cov; 'CG' → is_cg
UPDATE public.militares SET is_cov = true WHERE funcao = 'COV' AND is_cov = false;
UPDATE public.militares SET is_cg  = true WHERE funcao = 'CG'  AND is_cg  = false;

-- Tornar a coluna antiga 'funcao' opcional (mantida por compatibilidade)
ALTER TABLE public.militares ALTER COLUMN funcao DROP NOT NULL;

-- 2) Tabela de períodos de férias (até 3 por militar/ano — validado em app)
CREATE TABLE IF NOT EXISTS public.ferias_militares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  militar_id uuid NOT NULL REFERENCES public.militares(id) ON DELETE CASCADE,
  ano smallint NOT NULL,
  periodo smallint NOT NULL CHECK (periodo BETWEEN 1 AND 3),
  data_inicio date NOT NULL,
  data_fim date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (militar_id, ano, periodo)
);

CREATE INDEX IF NOT EXISTS idx_ferias_militar ON public.ferias_militares(militar_id);
CREATE INDEX IF NOT EXISTS idx_ferias_user_ano ON public.ferias_militares(user_id, ano);

ALTER TABLE public.ferias_militares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins veem todas as férias"
  ON public.ferias_militares FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Usuários aprovados veem suas férias"
  ON public.ferias_militares FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND public.get_user_status(auth.uid()) = 'aprovado'::user_status);

CREATE POLICY "Usuários aprovados criam férias"
  ON public.ferias_militares FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.get_user_status(auth.uid()) = 'aprovado'::user_status);

CREATE POLICY "Usuários aprovados atualizam férias"
  ON public.ferias_militares FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND public.get_user_status(auth.uid()) = 'aprovado'::user_status);

CREATE POLICY "Usuários aprovados excluem férias"
  ON public.ferias_militares FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND public.get_user_status(auth.uid()) = 'aprovado'::user_status);

CREATE TRIGGER ferias_set_updated_at
  BEFORE UPDATE ON public.ferias_militares
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Validação: data_fim >= data_inicio (via trigger, não check)
CREATE OR REPLACE FUNCTION public.validate_ferias_periodo()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.data_fim < NEW.data_inicio THEN
    RAISE EXCEPTION 'Data fim (%) deve ser >= data início (%)', NEW.data_fim, NEW.data_inicio;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER ferias_validate_periodo
  BEFORE INSERT OR UPDATE ON public.ferias_militares
  FOR EACH ROW EXECUTE FUNCTION public.validate_ferias_periodo();

-- 3) Escalas ordinárias (grupos/turmas por mês)
CREATE TABLE IF NOT EXISTS public.escalas_ordinarias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  mes smallint NOT NULL CHECK (mes BETWEEN 1 AND 12),
  ano smallint NOT NULL,
  ordem smallint NOT NULL CHECK (ordem BETWEEN 1 AND 20),
  nome text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, mes, ano, ordem)
);

CREATE INDEX IF NOT EXISTS idx_eord_user_mesano ON public.escalas_ordinarias(user_id, mes, ano);

ALTER TABLE public.escalas_ordinarias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins veem todas ordinárias"
  ON public.escalas_ordinarias FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Usuários aprovados veem ordinárias"
  ON public.escalas_ordinarias FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND public.get_user_status(auth.uid()) = 'aprovado'::user_status);

CREATE POLICY "Usuários aprovados criam ordinárias"
  ON public.escalas_ordinarias FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.get_user_status(auth.uid()) = 'aprovado'::user_status);

CREATE POLICY "Usuários aprovados atualizam ordinárias"
  ON public.escalas_ordinarias FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND public.get_user_status(auth.uid()) = 'aprovado'::user_status);

CREATE POLICY "Usuários aprovados excluem ordinárias"
  ON public.escalas_ordinarias FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND public.get_user_status(auth.uid()) = 'aprovado'::user_status);

CREATE TRIGGER eord_set_updated_at
  BEFORE UPDATE ON public.escalas_ordinarias
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4) Vínculo militar ↔ escala ordinária (membros de cada grupo)
CREATE TABLE IF NOT EXISTS public.escala_ordinaria_membros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escala_id uuid NOT NULL REFERENCES public.escalas_ordinarias(id) ON DELETE CASCADE,
  militar_id uuid NOT NULL REFERENCES public.militares(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (escala_id, militar_id)
);

CREATE INDEX IF NOT EXISTS idx_eord_memb_escala ON public.escala_ordinaria_membros(escala_id);
CREATE INDEX IF NOT EXISTS idx_eord_memb_militar ON public.escala_ordinaria_membros(militar_id);

ALTER TABLE public.escala_ordinaria_membros ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins veem todos membros"
  ON public.escala_ordinaria_membros FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Usuários aprovados veem membros"
  ON public.escala_ordinaria_membros FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND public.get_user_status(auth.uid()) = 'aprovado'::user_status);

CREATE POLICY "Usuários aprovados criam membros"
  ON public.escala_ordinaria_membros FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.get_user_status(auth.uid()) = 'aprovado'::user_status);

CREATE POLICY "Usuários aprovados excluem membros"
  ON public.escala_ordinaria_membros FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND public.get_user_status(auth.uid()) = 'aprovado'::user_status);
