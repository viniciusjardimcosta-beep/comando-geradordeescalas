CREATE OR REPLACE FUNCTION public.nbi_cancelar_documento(_documento_id uuid, _motivo text)
RETURNS TABLE(id uuid, status text, canceled_at timestamptz, cancel_reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid UUID := auth.uid();
  v_doc RECORD;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT d.id, d.user_id, d.status, d.canceled_at
    INTO v_doc
    FROM public.nbi_documents d
    WHERE d.id = _documento_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Documento não encontrado';
  END IF;

  IF v_doc.user_id <> v_uid THEN
    RAISE EXCEPTION 'Documento não pertence ao usuário';
  END IF;

  -- Idempotência: já cancelado devolve o estado atual, sem tocar em nada.
  IF v_doc.canceled_at IS NOT NULL THEN
    RETURN QUERY
      SELECT d.id, d.status, d.canceled_at, d.cancel_reason
        FROM public.nbi_documents d
        WHERE d.id = _documento_id;
    RETURN;
  END IF;

  IF v_doc.status NOT IN ('rascunho', 'reservado', 'gerado') THEN
    RAISE EXCEPTION 'Estado não cancelável: %', v_doc.status;
  END IF;

  -- Superfície mínima: apenas estes três campos podem mudar.
  UPDATE public.nbi_documents
     SET status = 'cancelado',
         canceled_at = now(),
         cancel_reason = COALESCE(NULLIF(btrim(_motivo), ''), 'sem motivo informado')
   WHERE id = _documento_id;

  RETURN QUERY
    SELECT d.id, d.status, d.canceled_at, d.cancel_reason
      FROM public.nbi_documents d
      WHERE d.id = _documento_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.nbi_cancelar_documento(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.nbi_cancelar_documento(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.nbi_cancelar_documento(uuid, text) TO authenticated;