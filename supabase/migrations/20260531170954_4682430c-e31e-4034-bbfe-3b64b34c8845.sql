
CREATE TABLE public.billing_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'nexano',
  event_id TEXT,
  event_type TEXT,
  status TEXT NOT NULL DEFAULT 'received',
  user_id UUID,
  customer_email TEXT,
  external_id TEXT,
  signature TEXT,
  source_ip TEXT,
  headers JSONB NOT NULL DEFAULT '{}'::jsonb,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX billing_events_provider_event_id_key
  ON public.billing_events(provider, event_id)
  WHERE event_id IS NOT NULL;

CREATE INDEX billing_events_created_at_idx ON public.billing_events(created_at DESC);
CREATE INDEX billing_events_user_id_idx ON public.billing_events(user_id);
CREATE INDEX billing_events_email_idx ON public.billing_events(customer_email);

GRANT SELECT ON public.billing_events TO authenticated;
GRANT ALL ON public.billing_events TO service_role;

ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins veem eventos de billing"
ON public.billing_events
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));
