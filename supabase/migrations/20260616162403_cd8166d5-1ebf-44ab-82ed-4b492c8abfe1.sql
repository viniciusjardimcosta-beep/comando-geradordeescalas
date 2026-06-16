
-- Adicionar status 'overdue' (inadimplente) ao enum subscription_status
ALTER TYPE public.subscription_status ADD VALUE IF NOT EXISTS 'overdue';

-- Tabela asaas_subscriptions
CREATE TABLE IF NOT EXISTS public.asaas_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  customer_id TEXT,
  subscription_id TEXT,
  payment_id TEXT,
  plan_type TEXT,
  value NUMERIC(10,2),
  status TEXT,
  billing_type TEXT,
  next_due_date DATE,
  cycle TEXT,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS asaas_subscriptions_subscription_id_key
  ON public.asaas_subscriptions(subscription_id) WHERE subscription_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS asaas_subscriptions_user_id_idx ON public.asaas_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS asaas_subscriptions_customer_id_idx ON public.asaas_subscriptions(customer_id);

GRANT SELECT ON public.asaas_subscriptions TO authenticated;
GRANT ALL ON public.asaas_subscriptions TO service_role;

ALTER TABLE public.asaas_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuário vê própria assinatura asaas"
  ON public.asaas_subscriptions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins veem todas asaas"
  ON public.asaas_subscriptions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER set_updated_at_asaas_subscriptions
  BEFORE UPDATE ON public.asaas_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
