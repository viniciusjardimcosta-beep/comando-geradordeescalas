-- Tipo de função do militar
CREATE TYPE public.funcao_militar AS ENUM ('COV', 'CG');

-- Tabela de militares (cada usuário cadastra os do seu quartel)
CREATE TABLE public.militares (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  nome TEXT NOT NULL,
  posto_graduacao TEXT,
  matricula TEXT,
  funcao public.funcao_militar NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  observacoes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_militares_user_id ON public.militares(user_id);
CREATE INDEX idx_militares_funcao ON public.militares(funcao);

ALTER TABLE public.militares ENABLE ROW LEVEL SECURITY;

-- Apenas o dono (usuário aprovado) vê e gerencia seus militares
CREATE POLICY "Usuários aprovados veem seus militares"
  ON public.militares FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() AND public.get_user_status(auth.uid()) = 'aprovado'::public.user_status);

CREATE POLICY "Usuários aprovados criam seus militares"
  ON public.militares FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.get_user_status(auth.uid()) = 'aprovado'::public.user_status);

CREATE POLICY "Usuários aprovados atualizam seus militares"
  ON public.militares FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() AND public.get_user_status(auth.uid()) = 'aprovado'::public.user_status);

CREATE POLICY "Usuários aprovados excluem seus militares"
  ON public.militares FOR DELETE
  TO authenticated
  USING (user_id = auth.uid() AND public.get_user_status(auth.uid()) = 'aprovado'::public.user_status);

-- Admin vê tudo
CREATE POLICY "Admins veem todos os militares"
  ON public.militares FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Trigger updated_at
CREATE TRIGGER militares_set_updated_at
  BEFORE UPDATE ON public.militares
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();