CREATE OR REPLACE FUNCTION public.billing_claim_event(_provider text, _dedupe_key text, _event_id text, _event_type text, _event_timestamp timestamp with time zone, _subject_key text, _external_id text, _customer_email text, _source_ip text, _headers jsonb, _payload jsonb)
 RETURNS TABLE(event_row_id uuid, decision text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id UUID;
  v_applied BOOLEAN;
  v_constraint TEXT;
BEGIN
  IF _provider IS NULL OR btrim(_provider) = '' THEN
    RAISE EXCEPTION 'provider obrigatorio';
  END IF;

  IF _dedupe_key IS NOT NULL THEN
    BEGIN
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
    EXCEPTION WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
      -- Somente as duas travas de identidade conhecidas viram idempotencia.
      IF v_constraint NOT IN ('billing_events_provider_event_id_key', 'billing_events_provider_dedupe_uidx') THEN
        RAISE;
      END IF;
      v_id := NULL;
    END;

    IF v_id IS NULL THEN
      SELECT be.id INTO v_id
        FROM public.billing_events AS be
        WHERE be.provider = _provider AND be.dedupe_key = _dedupe_key
        LIMIT 1;
      IF v_id IS NULL AND _event_id IS NOT NULL THEN
        SELECT be.id INTO v_id
          FROM public.billing_events AS be
          WHERE be.provider = _provider AND be.event_id = _event_id
          LIMIT 1;
      END IF;
      RETURN QUERY SELECT v_id, 'duplicate'::TEXT;
      RETURN;
    END IF;
  ELSE
    BEGIN
      INSERT INTO public.billing_events (
        provider, event_id, event_type, status, external_id, customer_email,
        source_ip, headers, payload, event_timestamp, subject_key
      ) VALUES (
        _provider, _event_id, _event_type, 'received', _external_id, _customer_email,
        _source_ip, COALESCE(_headers, '{}'::jsonb), COALESCE(_payload, '{}'::jsonb),
        _event_timestamp, _subject_key
      )
      RETURNING id INTO v_id;
    EXCEPTION WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
      IF v_constraint <> 'billing_events_provider_event_id_key' OR _event_id IS NULL THEN
        RAISE;
      END IF;
      SELECT be.id INTO v_id
        FROM public.billing_events AS be
        WHERE be.provider = _provider AND be.event_id = _event_id
        LIMIT 1;
      RETURN QUERY SELECT v_id, 'duplicate'::TEXT;
      RETURN;
    END;
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
$function$;