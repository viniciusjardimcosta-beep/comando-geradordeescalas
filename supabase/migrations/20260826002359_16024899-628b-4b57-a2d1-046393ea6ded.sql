-- Índice único: unicidade física apenas entre documentos NÃO cancelados.
DROP INDEX IF EXISTS public.nbi_documents_user_numero_ano_uidx;
CREATE UNIQUE INDEX nbi_documents_user_numero_ano_uidx
  ON public.nbi_documents (user_id, numero_ano_local, numero_int)
  WHERE numero_int IS NOT NULL AND status <> 'cancelado';

CREATE OR REPLACE FUNCTION public.nbi_reutilizar_numero(
  _documento_id uuid,
  _origem_documento_id uuid,
  _numero integer,
  _ano smallint
)
RETURNS TABLE(numero integer, ano smallint, reutilizado boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
  v_novo RECORD;
  v_orig RECORD;
  v_num RECORD;
  v_conflito UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;
  IF _documento_id = _origem_documento_id THEN
    RAISE EXCEPTION 'Documento de origem inválido';
  END IF;
  IF _numero IS NULL OR _numero < 1 OR _ano IS NULL THEN
    RAISE EXCEPTION 'Número ou ano inválido';
  END IF;

  -- Documento novo
  SELECT d.id, d.user_id, d.data_documento, d.numero_int, d.status, d.canceled_at
    INTO v_novo FROM public.nbi_documents AS d WHERE d.id = _documento_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Documento não encontrado'; END IF;
  IF v_novo.user_id <> v_uid THEN RAISE EXCEPTION 'Documento não pertence ao usuário'; END IF;
  IF v_novo.canceled_at IS NOT NULL THEN RAISE EXCEPTION 'Documento cancelado'; END IF;
  IF v_novo.numero_int IS NOT NULL THEN RAISE EXCEPTION 'Documento já possui número'; END IF;
  IF EXTRACT(YEAR FROM v_novo.data_documento)::SMALLINT <> _ano THEN
    RAISE EXCEPTION 'Ano (%) diverge do ano da data do documento', _ano;
  END IF;

  -- Documento cancelado de origem
  SELECT d.id, d.user_id, d.numero_int, d.numero_ano_local, d.status, d.canceled_at
    INTO v_orig FROM public.nbi_documents AS d WHERE d.id = _origem_documento_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Documento de origem não encontrado'; END IF;
  IF v_orig.user_id <> v_uid THEN RAISE EXCEPTION 'Documento de origem não pertence ao usuário'; END IF;
  IF v_orig.status <> 'cancelado' OR v_orig.canceled_at IS NULL THEN
    RAISE EXCEPTION 'Documento de origem não está cancelado';
  END IF;
  IF v_orig.numero_int IS DISTINCT FROM _numero OR v_orig.numero_ano_local IS DISTINCT FROM _ano THEN
    RAISE EXCEPTION 'Documento de origem não possui o número informado';
  END IF;

  -- Serializa por usuário e valida sequência (nunca altera ultima_nota)
  SELECT * INTO v_num FROM public.nbi_numeracao WHERE user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Numeração não inicializada'; END IF;
  IF _ano <> v_num.ano_vigente THEN
    RAISE EXCEPTION 'Ano (%) diverge do ano vigente da numeração (%)', _ano, v_num.ano_vigente;
  END IF;
  IF _numero > v_num.ultima_nota THEN
    RAISE EXCEPTION 'Número (%) é maior que a última nota emitida (%)', _numero, v_num.ultima_nota;
  END IF;

  -- Bloqueio absoluto: nenhum documento ativo pode estar usando o número
  SELECT d.id INTO v_conflito FROM public.nbi_documents AS d
    WHERE d.user_id = v_uid AND d.numero_ano_local = _ano AND d.numero_int = _numero
      AND d.status <> 'cancelado'
    LIMIT 1;
  IF v_conflito IS NOT NULL THEN
    RAISE EXCEPTION 'Número %/% já está em uso por NBI ativa', _numero, _ano;
  END IF;

  UPDATE public.nbi_documents AS d
     SET numero_int = _numero,
         numero_ano_local = _ano,
         ano = _ano,
         numero = LPAD(_numero::text, 3, '0'),
         reserved_at = now(),
         status = 'reservado'
   WHERE d.id = _documento_id;

  INSERT INTO public.nbi_auditoria(user_id, documento_id, acao, detalhe)
  VALUES (
    v_uid, _documento_id, 'reutilizou_numero',
    jsonb_build_object('numero', _numero, 'ano', _ano,
      'documento_cancelado_id', _origem_documento_id, 'user_id', v_uid, 'em', now())
  );

  INSERT INTO public.nbi_auditoria(user_id, documento_id, acao, detalhe)
  VALUES (
    v_uid, _origem_documento_id, 'numero_reutilizado_por',
    jsonb_build_object('numero', _numero, 'ano', _ano,
      'documento_novo_id', _documento_id, 'user_id', v_uid, 'em', now())
  );

  INSERT INTO public.nbi_numeracao_log(user_id, acao, antes, depois, detalhe)
  VALUES (
    v_uid, 'reutilizacao',
    jsonb_build_object('ano_vigente', v_num.ano_vigente, 'ultima_nota', v_num.ultima_nota),
    jsonb_build_object('ano_vigente', v_num.ano_vigente, 'ultima_nota', v_num.ultima_nota),
    format('reutilizacao numero %s/%s cancelado %s novo %s usuario %s',
      _numero, _ano, _origem_documento_id, _documento_id, v_uid)
  );

  RETURN QUERY SELECT _numero, _ano, true;
END;
$function$;

REVOKE ALL ON FUNCTION public.nbi_reutilizar_numero(uuid, uuid, integer, smallint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.nbi_reutilizar_numero(uuid, uuid, integer, smallint) FROM anon;
GRANT EXECUTE ON FUNCTION public.nbi_reutilizar_numero(uuid, uuid, integer, smallint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.nbi_reutilizar_numero(uuid, uuid, integer, smallint) TO service_role;