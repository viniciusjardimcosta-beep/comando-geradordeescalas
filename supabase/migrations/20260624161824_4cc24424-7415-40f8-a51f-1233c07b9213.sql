
-- 1) Atualiza trigger de novo usuário: status = aprovado por padrão
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
    'aprovado'::public.user_status,
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

-- 2) Migra usuários atualmente pendentes para aprovados (mantém bloqueados como estão)
UPDATE public.profiles
SET status = 'aprovado'::public.user_status
WHERE status = 'pendente'::public.user_status;
