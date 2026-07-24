
-- ============================================================
-- BLOCO 5 NBI: Numeração, Histórico e Auditoria
-- ============================================================

-- 1. Novos campos em nbi_documents
ALTER TABLE public.nbi_documents
  ADD COLUMN IF NOT EXISTS reserved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS generated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT,
  ADD COLUMN IF NOT EXISTS numero_int INTEGER,
  ADD COLUMN IF NOT EXISTS numero_ano_local SMALLINT;

CREATE INDEX IF NOT EXISTS nbi_documents_user_generated_idx
  ON public.nbi_documents(user_id, generated_at DESC);
CREATE INDEX IF NOT EXISTS nbi_documents_user_status_idx
  ON public.nbi_documents(user_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS nbi_documents_user_numero_ano_uidx
  ON public.nbi_documents(user_id, numero_ano_local, numero_int)
  WHERE numero_int IS NOT NULL;

-- 2. nbi_numeracao (controle por unidade/usuário)
CREATE TABLE IF NOT EXISTS public.nbi_numeracao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ano_vigente SMALLINT NOT NULL DEFAULT EXTRACT(YEAR FROM now())::SMALLINT,
  ultima_nota INTEGER NOT NULL DEFAULT 0,
  reiniciar_anualmente BOOLEAN NOT NULL DEFAULT true,
  prefixo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

GRANT SELECT, INSERT, UPDATE ON public.nbi_numeracao TO authenticated;
GRANT ALL ON public.nbi_numeracao TO service_role;
ALTER TABLE public.nbi_numeracao ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nbi_numeracao_own_select" ON public.nbi_numeracao
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "nbi_numeracao_own_insert" ON public.nbi_numeracao
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "nbi_numeracao_own_update" ON public.nbi_numeracao
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER nbi_numeracao_set_updated_at
  BEFORE UPDATE ON public.nbi_numeracao
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. nbi_numeracao_log (append-only)
CREATE TABLE IF NOT EXISTS public.nbi_numeracao_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  acao TEXT NOT NULL,
  antes JSONB,
  depois JSONB,
  detalhe TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.nbi_numeracao_log TO authenticated;
GRANT ALL ON public.nbi_numeracao_log TO service_role;
ALTER TABLE public.nbi_numeracao_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nbi_numeracao_log_own_select" ON public.nbi_numeracao_log
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- 4. nbi_auditoria (append-only, por documento)
CREATE TABLE IF NOT EXISTS public.nbi_auditoria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  documento_id UUID NOT NULL REFERENCES public.nbi_documents(id) ON DELETE CASCADE,
  acao TEXT NOT NULL,
  detalhe JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.nbi_auditoria TO authenticated;
GRANT ALL ON public.nbi_auditoria TO service_role;
ALTER TABLE public.nbi_auditoria ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nbi_auditoria_own_select" ON public.nbi_auditoria
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS nbi_auditoria_doc_idx ON public.nbi_auditoria(documento_id, created_at DESC);
CREATE INDEX IF NOT EXISTS nbi_auditoria_user_idx ON public.nbi_auditoria(user_id, created_at DESC);

-- 5. Função de reserva atômica de número
CREATE OR REPLACE FUNCTION public.nbi_reservar_numero(
  _documento_id UUID,
  _ano_local SMALLINT,
  _confirmar_novo_ano BOOLEAN DEFAULT false
) RETURNS TABLE (numero INTEGER, ano SMALLINT, reservado BOOLEAN, motivo TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_doc RECORD;
  v_num RECORD;
  v_ano_doc SMALLINT;
  v_next INTEGER;
  v_novo_ano BOOLEAN := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  -- Trava e valida documento
  SELECT id, user_id, data_documento, numero_int, numero_ano_local, status, reserved_at, generated_at, canceled_at
    INTO v_doc
    FROM public.nbi_documents
    WHERE id = _documento_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Documento não encontrado';
  END IF;
  IF v_doc.user_id <> v_uid THEN
    RAISE EXCEPTION 'Documento não pertence ao usuário';
  END IF;
  IF v_doc.canceled_at IS NOT NULL THEN
    RAISE EXCEPTION 'Documento cancelado';
  END IF;

  -- Idempotência: já reservado -> retorna o mesmo número
  IF v_doc.numero_int IS NOT NULL AND v_doc.reserved_at IS NOT NULL THEN
    RETURN QUERY SELECT v_doc.numero_int, v_doc.numero_ano_local, false, 'ja_reservado'::TEXT;
    RETURN;
  END IF;

  -- Ano local deve bater com o ano do documento
  v_ano_doc := EXTRACT(YEAR FROM v_doc.data_documento)::SMALLINT;
  IF _ano_local <> v_ano_doc THEN
    RAISE EXCEPTION 'Ano local (%) diverge do ano da data do documento (%)', _ano_local, v_ano_doc;
  END IF;

  -- Carrega/cria linha de numeração
  SELECT * INTO v_num FROM public.nbi_numeracao WHERE user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.nbi_numeracao (user_id, ano_vigente, ultima_nota, reiniciar_anualmente)
      VALUES (v_uid, v_ano_doc, 0, true)
      RETURNING * INTO v_num;
  END IF;

  -- Transição de ano
  IF _ano_local <> v_num.ano_vigente THEN
    v_novo_ano := true;
    IF NOT _confirmar_novo_ano THEN
      RAISE EXCEPTION 'ano_transicao_requer_confirmacao';
    END IF;
    IF v_num.reiniciar_anualmente THEN
      v_next := 1;
    ELSE
      v_next := v_num.ultima_nota + 1;
    END IF;
    UPDATE public.nbi_numeracao
      SET ano_vigente = _ano_local, ultima_nota = v_next
      WHERE id = v_num.id;
  ELSE
    v_next := v_num.ultima_nota + 1;
    UPDATE public.nbi_numeracao SET ultima_nota = v_next WHERE id = v_num.id;
  END IF;

  -- Aplica reserva no documento
  UPDATE public.nbi_documents
    SET numero_int = v_next,
        numero_ano_local = _ano_local,
        ano = _ano_local,
        numero = LPAD(v_next::text, 3, '0'),
        reserved_at = now(),
        status = 'reservado'
    WHERE id = _documento_id;

  -- Log da numeração
  INSERT INTO public.nbi_numeracao_log(user_id, acao, antes, depois, detalhe)
  VALUES (
    v_uid,
    CASE WHEN v_novo_ano THEN 'transicao_ano' ELSE 'reserva' END,
    jsonb_build_object('ano_vigente', v_num.ano_vigente, 'ultima_nota', v_num.ultima_nota),
    jsonb_build_object('ano_vigente', _ano_local, 'ultima_nota', v_next),
    'documento ' || _documento_id::text
  );

  RETURN QUERY SELECT v_next, _ano_local, true, 'reservado'::TEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.nbi_reservar_numero(UUID, SMALLINT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.nbi_reservar_numero(UUID, SMALLINT, BOOLEAN) TO authenticated;

-- 6. Guarda: impede configurar ultima_nota abaixo do maior emitido
CREATE OR REPLACE FUNCTION public.nbi_guard_numeracao_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max INTEGER;
BEGIN
  IF NEW.ano_vigente = OLD.ano_vigente AND NEW.ultima_nota < OLD.ultima_nota THEN
    SELECT COALESCE(MAX(numero_int), 0) INTO v_max
      FROM public.nbi_documents
      WHERE user_id = NEW.user_id AND numero_ano_local = NEW.ano_vigente;
    IF NEW.ultima_nota < v_max THEN
      RAISE EXCEPTION 'ultima_nota (%) não pode ser menor que o maior número já emitido (%) para o ano %',
        NEW.ultima_nota, v_max, NEW.ano_vigente;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS nbi_numeracao_guard ON public.nbi_numeracao;
CREATE TRIGGER nbi_numeracao_guard
  BEFORE UPDATE ON public.nbi_numeracao
  FOR EACH ROW EXECUTE FUNCTION public.nbi_guard_numeracao_update();
