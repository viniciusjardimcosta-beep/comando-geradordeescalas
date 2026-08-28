ALTER TABLE public.billing_events
  ADD COLUMN IF NOT EXISTS event_timestamp TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dedupe_key TEXT,
  ADD COLUMN IF NOT EXISTS subject_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS billing_events_provider_dedupe_uidx
  ON public.billing_events (provider, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.billing_subject_state (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider TEXT NOT NULL,
  subject_key TEXT NOT NULL,
  last_event_at TIMESTAMPTZ,
  last_event_type TEXT,
  last_event_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, subject_key)
);

GRANT ALL ON public.billing_subject_state TO service_role;

ALTER TABLE public.billing_subject_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "billing_subject_state sem acesso de usuarios"
  ON public.billing_subject_state
  FOR SELECT
  TO authenticated
  USING (false);

CREATE TRIGGER billing_subject_state_set_updated_at
  BEFORE UPDATE ON public.billing_subject_state
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.billing_claim_event(
  _provider TEXT,
  _dedupe_key TEXT,
  _event_id TEXT,
  _event_type TEXT,
  _event_timestamp TIMESTAMPTZ,
  _subject_key TEXT,
  _external_id TEXT,
  _customer_email TEXT,
  _source_ip TEXT,
  _headers JSONB,
  _payload JSONB
)
RETURNS TABLE(event_row_id UUID, decision TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_applied BOOLEAN;
BEGIN
  IF _provider IS NULL OR btrim(_provider) = '' THEN
    RAISE EXCEPTION 'provider obrigatorio';
  END IF;

  IF _dedupe_key IS NOT NULL THEN
    INSERT INTO public.billing_events (
      provider, event_id, event_type, status, external_id, customer_email,
      source_ip, headers, payload, event_timestamp, dedupe_key, subject_key
    ) VALUES (
      _provider, _event_id, _event_type, 'received', _external_id, _customer_email,
      _source_ip, COALESCE(_headers, '{}'::jsonb), COALESCE(_payload, '{}'::jsonb),
      _event_timestamp, _dedupe_key, _subject_key
    )
    ON CONFLICT (provider, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
    RETURNING id INTO v_id;

    IF v_id IS NULL THEN
      SELECT be.id INTO v_id
        FROM public.billing_events AS be
        WHERE be.provider = _provider AND be.dedupe_key = _dedupe_key
        LIMIT 1;
      RETURN QUERY SELECT v_id, 'duplicate'::TEXT;
      RETURN;
    END IF;
  ELSE
    INSERT INTO public.billing_events (
      provider, event_id, event_type, status, external_id, customer_email,
      source_ip, headers, payload, event_timestamp, subject_key
    ) VALUES (
      _provider, _event_id, _event_type, 'received', _external_id, _customer_email,
      _source_ip, COALESCE(_headers, '{}'::jsonb), COALESCE(_payload, '{}'::jsonb),
      _event_timestamp, _subject_key
    )
    RETURNING id INTO v_id;
  END IF;

  IF _subject_key IS NOT NULL AND _event_timestamp IS NOT NULL THEN
    INSERT INTO public.billing_subject_state (provider, subject_key, last_event_at, last_event_type, last_event_id)
    VALUES (_provider, _subject_key, _event_timestamp, _event_type, _event_id)
    ON CONFLICT (provider, subject_key) DO UPDATE
      SET last_event_at = EXCLUDED.last_event_at,
          last_event_type = EXCLUDED.last_event_type,
          last_event_id = EXCLUDED.last_event_id
      WHERE public.billing_subject_state.last_event_at IS NULL
         OR EXCLUDED.last_event_at >= public.billing_subject_state.last_event_at
    RETURNING TRUE INTO v_applied;

    IF v_applied IS NULL THEN
      UPDATE public.billing_events
         SET status = 'ignored_stale',
             processed_at = now(),
             error_message = 'evento anterior ao ultimo evento aplicado para este assunto'
       WHERE id = v_id;
      RETURN QUERY SELECT v_id, 'stale'::TEXT;
      RETURN;
    END IF;
  END IF;

  RETURN QUERY SELECT v_id, 'process'::TEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.billing_claim_event(TEXT,TEXT,TEXT,TEXT,TIMESTAMPTZ,TEXT,TEXT,TEXT,TEXT,JSONB,JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.billing_claim_event(TEXT,TEXT,TEXT,TEXT,TIMESTAMPTZ,TEXT,TEXT,TEXT,TEXT,JSONB,JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.billing_claim_event(TEXT,TEXT,TEXT,TEXT,TIMESTAMPTZ,TEXT,TEXT,TEXT,TEXT,JSONB,JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.billing_claim_event(TEXT,TEXT,TEXT,TEXT,TIMESTAMPTZ,TEXT,TEXT,TEXT,TEXT,JSONB,JSONB) TO service_role;