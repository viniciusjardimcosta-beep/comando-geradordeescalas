
-- 1. Enum de status de assinatura
DO $$ BEGIN
  CREATE TYPE public.subscription_status AS ENUM ('trial', 'active', 'expired', 'canceled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.plan_type AS ENUM ('trial', 'mensal', 'semestral', 'anual');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Colunas em profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS trial_start_date timestamptz,
  ADD COLUMN IF NOT EXISTS trial_end_date timestamptz,
  ADD COLUMN IF NOT EXISTS subscription_status public.subscription_status NOT NULL DEFAULT 'trial',
  ADD COLUMN IF NOT EXISTS plan_type public.plan_type NOT NULL DEFAULT 'trial',
  ADD COLUMN IF NOT EXISTS subscription_end_date timestamptz;

-- 3. Backfill para usuários existentes (dar 7 dias a partir de agora se não houver trial setado)
UPDATE public.profiles
SET trial_start_date = COALESCE(trial_start_date, created_at),
    trial_end_date = COALESCE(trial_end_date, created_at + INTERVAL '7 days')
WHERE trial_start_date IS NULL OR trial_end_date IS NULL;

-- 4. Atualiza handle_new_user para incluir o trial
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  is_first_user BOOLEAN;
BEGIN
  SELECT NOT EXISTS (SELECT 1 FROM public.profiles) INTO is_first_user;

  INSERT INTO public.profiles (id, email, nome, status, trial_start_date, trial_end_date, subscription_status, plan_type)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'nome', NEW.email),
    CASE WHEN is_first_user THEN 'aprovado'::public.user_status ELSE 'pendente'::public.user_status END,
    now(),
    now() + INTERVAL '7 days',
    'trial'::public.subscription_status,
    'trial'::public.plan_type
  );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (
    NEW.id,
    CASE WHEN is_first_user THEN 'admin'::public.app_role ELSE 'user'::public.app_role END
  );

  RETURN NEW;
END;
$function$;

-- 5. Função para checar acesso ativo (trial válido OU assinatura ativa)
CREATE OR REPLACE FUNCTION public.has_active_access(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = _user_id
      AND (
        -- Admin sempre tem acesso
        EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = _user_id AND ur.role = 'admin')
        OR (p.subscription_status = 'active' AND (p.subscription_end_date IS NULL OR p.subscription_end_date > now()))
        OR (p.subscription_status = 'trial' AND p.trial_end_date IS NOT NULL AND p.trial_end_date > now())
      )
  )
$$;

-- 6. Atualiza RLS de escalas_geradas para exigir acesso ativo no INSERT/UPDATE
DROP POLICY IF EXISTS "Usuários aprovados criam suas escalas" ON public.escalas_geradas;
CREATE POLICY "Usuários com acesso criam suas escalas"
ON public.escalas_geradas FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND get_user_status(auth.uid()) = 'aprovado'::user_status
  AND has_active_access(auth.uid())
);

DROP POLICY IF EXISTS "Usuários aprovados atualizam suas escalas" ON public.escalas_geradas;
CREATE POLICY "Usuários com acesso atualizam suas escalas"
ON public.escalas_geradas FOR UPDATE TO authenticated
USING (
  user_id = auth.uid()
  AND get_user_status(auth.uid()) = 'aprovado'::user_status
  AND has_active_access(auth.uid())
);

-- 7. Admins podem atualizar assinatura de qualquer perfil (a policy "Admins atualizam qualquer perfil" já cobre)
