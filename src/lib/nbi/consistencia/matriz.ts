// Bloco 12 — Matriz de compatibilidade afastamento × assunto.
// Regra da autorização: nenhum bloqueio novo por inferência. Só bloqueia quando
// a base comprova o afastamento com documento oficial ativo ou registro do banco
// de férias. Luto e núpcias permanecem em ALERTA porque o sistema não possui
// dados suficientes para afirmar incompatibilidade absoluta.

import type { Afastamento, Severidade } from "./tipos";

export type TipoAfastamento = Afastamento["tipo"];

export const ROTULO_AFASTAMENTO: Record<TipoAfastamento, string> = {
  ferias: "Férias",
  licenca_paternidade: "Licença-paternidade",
  luto: "Luto",
  nupcias: "Núpcias",
};

type Celula = Severidade | null;

/** null = nenhum achado. */
const MATRIZ: Record<string, Record<TipoAfastamento, Celula>> = {
  // Serviço extraordinário EXECUTADO: o período informado é o mês/período de
  // referência das horas, não os dias exatos de execução — sobreposição com
  // afastamento é conferência administrativa (alerta), nunca proibição.
  servico_extraordinario: { ferias: "alerta", licenca_paternidade: "alerta", luto: "alerta", nupcias: "alerta" },
  // CONVOCAÇÃO FUTURA: refere-se a data/horário específicos de serviço a ser
  // prestado — afastamento no mesmo período é incompatibilidade real. Mantido bloqueio.
  servico_extraordinario_convocacao: { ferias: "bloqueio", licenca_paternidade: "bloqueio", luto: "alerta", nupcias: "alerta" },
  viagem: { ferias: "alerta", licenca_paternidade: "alerta", luto: "alerta", nupcias: "alerta" },
  assuncao_funcao: { ferias: "alerta", licenca_paternidade: "alerta", luto: "alerta", nupcias: "alerta" },
  dispensa_funcao: { ferias: null, licenca_paternidade: null, luto: null, nupcias: null },
  nomeacao_comissao: { ferias: "sugestao", licenca_paternidade: "sugestao", luto: "sugestao", nupcias: "sugestao" },
  dispensa_recompensa: { ferias: "sugestao", licenca_paternidade: "sugestao", luto: "sugestao", nupcias: "sugestao" },
  folga_compensatoria: { ferias: "sugestao", licenca_paternidade: "sugestao", luto: "sugestao", nupcias: "sugestao" },
};

export function severidadeConflito(tipoAssunto: string, tipoAfastamento: TipoAfastamento): Celula {
  return MATRIZ[tipoAssunto]?.[tipoAfastamento] ?? null;
}

/**
 * Ressalva obrigatória: para luto e núpcias o sistema não guarda hora do fato
 * nem norma de incompatibilidade — o achado é informativo, não proibição.
 */
export function ressalvaInsuficiencia(tipo: TipoAfastamento): string | null {
  if (tipo === "luto" || tipo === "nupcias") {
    return "O sistema não possui dados suficientes para determinar incompatibilidade absoluta neste caso; trate como conferência administrativa, não como proibição normativa.";
  }
  return null;
}
