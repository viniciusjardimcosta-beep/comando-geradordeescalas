// Bloco 12 — Carregamento EM LOTE da base de consistência (4 consultas, uma vez por tela).
// Somente leitura: nenhuma escrita, nenhuma reserva de número, nenhuma geração.
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { BaseConsistencia, AssuntoSnapshot } from "./tipos";

export interface JanelaConsistencia {
  /** Recorte de datas (YYYY-MM-DD). Evita carregar todo o histórico. */
  de: string;
  ate: string;
}

export function janelaPadrao(hoje: string): JanelaConsistencia {
  const ano = parseInt(hoje.slice(0, 4), 10);
  return { de: `${ano - 1}-01-01`, ate: `${ano + 1}-12-31` };
}

export function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export const BASE_VAZIA: BaseConsistencia = {
  documentos: [], ferias: [], substituicoes: [], militares: [], hoje: hojeISO(),
};

export async function carregarBaseConsistencia(
  userId: string,
  janela: JanelaConsistencia,
  hoje = hojeISO(),
): Promise<BaseConsistencia> {
  const [docs, ferias, subs, militares] = await Promise.all([
    supabase.from("nbi_documents")
      .select("id,numero,ano,data_documento,status,canceled_at,created_at,assuntos")
      .eq("user_id", userId)
      .gte("data_documento", janela.de)
      .lte("data_documento", janela.ate)
      .order("data_documento", { ascending: true }),
    supabase.from("ferias_militares")
      .select("id,militar_id,ano,periodo,data_inicio,data_fim")
      .eq("user_id", userId)
      .gte("data_fim", janela.de)
      .lte("data_inicio", janela.ate),
    supabase.from("nbi_substituicoes")
      .select("id,status,funcao,data_inicio,data_fim_prevista,data_fim_efetiva,substituto_militar_id,titular_militar_id,assuncao_documento_id,dispensa_documento_id")
      .eq("user_id", userId),
    supabase.from("militares")
      .select("id,nome,ativo,matricula")
      .eq("user_id", userId),
  ]);

  return {
    hoje,
    documentos: (docs.data ?? []).map((d) => ({
      id: d.id,
      numero: d.numero,
      ano: d.ano,
      data_documento: d.data_documento,
      status: d.status,
      canceled_at: d.canceled_at,
      created_at: d.created_at,
      assuntos: (Array.isArray(d.assuntos) ? d.assuntos : []) as unknown as AssuntoSnapshot[],
    })),
    ferias: (ferias.data ?? []) as BaseConsistencia["ferias"],
    substituicoes: (subs.data ?? []) as BaseConsistencia["substituicoes"],
    militares: (militares.data ?? []) as BaseConsistencia["militares"],
  };
}

/** Hook memoizado — recarrega apenas quando o usuário ou a janela mudam. */
export function useBaseConsistencia(userId: string | undefined, janela?: JanelaConsistencia) {
  const hoje = useMemo(() => hojeISO(), []);
  const j = useMemo(() => janela ?? janelaPadrao(hoje), [janela?.de, janela?.ate, hoje]);
  const [base, setBase] = useState<BaseConsistencia>({ ...BASE_VAZIA, hoje });
  const [carregando, setCarregando] = useState(false);

  const recarregar = useCallback(async () => {
    if (!userId) return;
    setCarregando(true);
    try {
      setBase(await carregarBaseConsistencia(userId, j, hoje));
    } finally {
      setCarregando(false);
    }
  }, [userId, j.de, j.ate, hoje]);

  useEffect(() => { void recarregar(); }, [recarregar]);

  return { base, carregando, recarregar };
}
