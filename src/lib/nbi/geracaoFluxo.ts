// Bloco 12E — fluxo único de geração da NBI.
// Regra institucional: o backend só enxerga o que está PERSISTIDO. Portanto a
// gravação do rascunho precede obrigatoriamente a chamada de geração, e uma
// falha de gravação aborta o fluxo antes de qualquer reserva de número.

export type ResultadoPersistencia = {
  ok: boolean;
  documentoId: string | null;
  erro?: string;
};

export type ResultadoGeracao = {
  ok: boolean;
  numero?: number | null;
  ano?: number | null;
  code?: string | null;
};

export type SaidaGeracao =
  | { estado: "ignorado" }
  | { estado: "erro"; etapa: "persistencia" | "geracao" | "excecao"; mensagem: string }
  | { estado: "sucesso"; numero: number; ano: number };

export const MSG_FALHA_PERSISTENCIA =
  "Os assuntos do documento não foram salvos corretamente. Nenhum número foi reservado. Tente novamente.";
export const MSG_FALHA_INESPERADA =
  "Ocorreu uma falha inesperada ao gerar o documento. Tente novamente.";
export const MSG_FALHA_GERACAO =
  "Não foi possível concluir a geração do documento.";

/** Trava simples de reentrância — impede duplo clique gerar dois documentos. */
export type TravaGeracao = { current: boolean };

export async function executarGeracaoNbi(deps: {
  trava: TravaGeracao;
  documentoId: string | null;
  persistir: () => Promise<ResultadoPersistencia>;
  gerar: (documentoId: string) => Promise<ResultadoGeracao>;
  anoPadrao?: number;
}): Promise<SaidaGeracao> {
  if (deps.trava.current) return { estado: "ignorado" };
  deps.trava.current = true;
  try {
    const persistencia = await deps.persistir();
    if (!persistencia.ok) {
      return { estado: "erro", etapa: "persistencia", mensagem: MSG_FALHA_PERSISTENCIA };
    }
    const alvo = persistencia.documentoId ?? deps.documentoId;
    if (!alvo) {
      return { estado: "erro", etapa: "persistencia", mensagem: MSG_FALHA_PERSISTENCIA };
    }
    const r = await deps.gerar(alvo);
    if (!r.ok) {
      return { estado: "erro", etapa: "geracao", mensagem: r.code || MSG_FALHA_GERACAO };
    }
    return {
      estado: "sucesso",
      numero: r.numero ?? 0,
      ano: r.ano ?? deps.anoPadrao ?? new Date().getFullYear(),
    };
  } catch {
    // Detalhe técnico fica no servidor; o operador recebe orientação de ação.
    return { estado: "erro", etapa: "excecao", mensagem: MSG_FALHA_INESPERADA };
  } finally {
    deps.trava.current = false;
  }
}
