
-- 1) Novo valor de enum
ALTER TYPE public.subscription_status ADD VALUE IF NOT EXISTS 'refunded';

-- 2) Novas colunas em profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS cpf text,
  ADD COLUMN IF NOT EXISTS telefone text,
  ADD COLUMN IF NOT EXISTS plano_nome text,
  ADD COLUMN IF NOT EXISTS subscription_provider text,
  ADD COLUMN IF NOT EXISTS subscription_identifier text,
  ADD COLUMN IF NOT EXISTS subscription_start_date timestamptz,
  ADD COLUMN IF NOT EXISTS password_temporary boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_profiles_subscription_identifier
  ON public.profiles(subscription_identifier);

-- 3) Tabela de assinaturas (histórico)
CREATE TABLE IF NOT EXISTS public.nexano_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  customer_email text NOT NULL,
  customer_name text,
  customer_cpf text,
  customer_phone text,
  subscription_identifier text NOT NULL,
  subscription_external_id text,
  subscription_status text NOT NULL,
  start_at timestamptz,
  end_at timestamptz,
  interval_count smallint,
  interval_type text,
  offer_code text,
  product_id text,
  product_external_id text,
  product_name text,
  last_transaction_id text,
  last_transaction_identifier text,
  last_event_type text,
  last_billing_event_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nexano_subscriptions_identifier_unique UNIQUE (subscription_identifier)
);

CREATE INDEX IF NOT EXISTS idx_nexano_subscriptions_user
  ON public.nexano_subscriptions(user_id);

GRANT SELECT ON public.nexano_subscriptions TO authenticated;
GRANT ALL ON public.nexano_subscriptions TO service_role;

ALTER TABLE public.nexano_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuário vê sua assinatura"
  ON public.nexano_subscriptions
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins veem todas as assinaturas"
  ON public.nexano_subscriptions
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_nexano_subscriptions_updated_at
  BEFORE UPDATE ON public.nexano_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
