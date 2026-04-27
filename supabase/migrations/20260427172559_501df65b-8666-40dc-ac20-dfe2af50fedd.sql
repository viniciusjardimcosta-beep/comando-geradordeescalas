
-- =========================
-- ENUMS
-- =========================
CREATE TYPE public.app_role AS ENUM ('admin', 'user');
CREATE TYPE public.user_status AS ENUM ('pendente', 'aprovado', 'bloqueado');

-- =========================
-- PROFILES
-- =========================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  nome TEXT,
  status public.user_status NOT NULL DEFAULT 'pendente',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- =========================
-- USER ROLES
-- =========================
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- =========================
-- SECURITY DEFINER: has_role
-- =========================
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- =========================
-- SECURITY DEFINER: get user status (used by RLS to avoid recursion)
-- =========================
CREATE OR REPLACE FUNCTION public.get_user_status(_user_id UUID)
RETURNS public.user_status
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT status FROM public.profiles WHERE id = _user_id
$$;

-- =========================
-- updated_at trigger
-- =========================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_set_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================
-- TRIGGER: novo usuário no auth.users -> cria profile + define role
-- O primeiro usuário vira admin/aprovado; os demais ficam user/pendente.
-- =========================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_first_user BOOLEAN;
BEGIN
  SELECT NOT EXISTS (SELECT 1 FROM public.profiles) INTO is_first_user;

  INSERT INTO public.profiles (id, email, nome, status)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'nome', NEW.email),
    CASE WHEN is_first_user THEN 'aprovado'::public.user_status ELSE 'pendente'::public.user_status END
  );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (
    NEW.id,
    CASE WHEN is_first_user THEN 'admin'::public.app_role ELSE 'user'::public.app_role END
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================
-- RLS: profiles
-- =========================
CREATE POLICY "Usuários veem o próprio perfil"
ON public.profiles FOR SELECT
TO authenticated
USING (auth.uid() = id);

CREATE POLICY "Admins veem todos os perfis"
ON public.profiles FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins atualizam qualquer perfil"
ON public.profiles FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins excluem perfis"
ON public.profiles FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- (Inserts são feitos pelo trigger handle_new_user com SECURITY DEFINER, sem necessidade de policy de INSERT.)

-- =========================
-- RLS: user_roles
-- =========================
CREATE POLICY "Usuários veem seus próprios papéis"
ON public.user_roles FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Admins veem todos os papéis"
ON public.user_roles FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins gerenciam papéis"
ON public.user_roles FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =========================
-- ESCALAS GERADAS (histórico)
-- =========================
CREATE TABLE public.escalas_geradas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mes SMALLINT NOT NULL CHECK (mes BETWEEN 1 AND 12),
  ano SMALLINT NOT NULL CHECK (ano BETWEEN 2000 AND 2100),
  arquivo_nome TEXT,
  diretrizes TEXT,
  alertas JSONB NOT NULL DEFAULT '[]'::jsonb,
  exportacoes JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.escalas_geradas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários aprovados veem suas escalas"
ON public.escalas_geradas FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  AND public.get_user_status(auth.uid()) = 'aprovado'
);

CREATE POLICY "Admins veem todas as escalas"
ON public.escalas_geradas FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Usuários aprovados criam suas escalas"
ON public.escalas_geradas FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND public.get_user_status(auth.uid()) = 'aprovado'
);

CREATE POLICY "Usuários aprovados atualizam suas escalas"
ON public.escalas_geradas FOR UPDATE
TO authenticated
USING (
  user_id = auth.uid()
  AND public.get_user_status(auth.uid()) = 'aprovado'
);

CREATE INDEX idx_escalas_user ON public.escalas_geradas(user_id);
CREATE INDEX idx_escalas_periodo ON public.escalas_geradas(ano, mes);
