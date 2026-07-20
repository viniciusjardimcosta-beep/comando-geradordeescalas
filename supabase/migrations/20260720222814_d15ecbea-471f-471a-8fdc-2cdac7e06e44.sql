
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS complimentary_access boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS complimentary_access_reason text,
  ADD COLUMN IF NOT EXISTS complimentary_access_expires_at timestamptz;

CREATE OR REPLACE FUNCTION public.has_active_access(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = _user_id
      AND (
        EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = _user_id AND ur.role = 'admin')
        OR (p.complimentary_access = true AND (p.complimentary_access_expires_at IS NULL OR p.complimentary_access_expires_at > now()))
        OR (p.subscription_status = 'active' AND (p.subscription_end_date IS NULL OR p.subscription_end_date > now()))
        OR (p.subscription_status = 'trial' AND p.trial_end_date IS NOT NULL AND p.trial_end_date > now())
      )
  )
$function$;

UPDATE public.profiles
SET complimentary_access = true,
    complimentary_access_reason = 'Parceiro de pré-lançamento',
    complimentary_access_expires_at = NULL
WHERE lower(email) = lower('ademir.gunsch@icloud.com');
