// Categorias apenas visuais para o seletor de assuntos.
// Não afetam banco, códigos internos, textos oficiais ou geração DOCX.
// Fonte de verdade das linhas continua sendo public.nbi_templates.

export type CategoriaNbi = "AFASTAMENTOS" | "MOVIMENTAÇÕES" | "SERVIÇO" | "ADMINISTRATIVO";

export const CATEGORIAS_ORDEM: CategoriaNbi[] = [
  "AFASTAMENTOS",
  "MOVIMENTAÇÕES",
  "SERVIÇO",
  "ADMINISTRATIVO",
];

// Mapeamento código do template -> categoria visual.
const MAPA: Record<string, CategoriaNbi> = {
  ferias: "AFASTAMENTOS",
  apresentacao: "AFASTAMENTOS",
  licenca_paternidade: "AFASTAMENTOS",
  luto: "AFASTAMENTOS",
  dispensa_recompensa: "AFASTAMENTOS",

  assuncao_funcao: "MOVIMENTAÇÕES",
  assuncao_cargo_vago: "MOVIMENTAÇÕES",
  dispensa_funcao: "MOVIMENTAÇÕES",
  dispensa_cargo_vago: "MOVIMENTAÇÕES",


  servico_extraordinario: "SERVIÇO",
  servico_extraordinario_convocacao: "SERVIÇO",
  nomeacao_comissao_funcoes: "SERVIÇO",
  viagem: "SERVIÇO",
  nomeacao_comissao: "SERVIÇO",

  renovacao_tempo: "ADMINISTRATIVO",
  situacao_sanitaria: "ADMINISTRATIVO",
  comunicado: "ADMINISTRATIVO",
};

export function categoriaDoCodigo(codigo: string): CategoriaNbi {
  return MAPA[codigo] ?? "ADMINISTRATIVO";
}

// RF-04 — sequência administrativa oficial dentro de cada categoria.
// Códigos ausentes desta lista vão para o fim do grupo, em ordem alfabética.
const ORDEM_ADMINISTRATIVA: string[] = [
  // AFASTAMENTOS
  "ferias",
  "apresentacao",
  "licenca_paternidade",
  "luto",
  "dispensa_recompensa",
  // MOVIMENTAÇÕES
  "assuncao_funcao",
  "dispensa_funcao",
  "assuncao_cargo_vago",
  "dispensa_cargo_vago",
  // SERVIÇO
  "viagem",
  "servico_extraordinario",
  "servico_extraordinario_convocacao",
  "nomeacao_comissao",
  "nomeacao_comissao_funcoes",
  // ADMINISTRATIVO
  "renovacao_tempo",
  "situacao_sanitaria",
  "comunicado",
];

/** Peso de ordenação do assunto dentro da sua categoria. */
export function ordemDoCodigo(codigo: string): number {
  const i = ORDEM_ADMINISTRATIVA.indexOf(codigo);
  return i === -1 ? 999 : i;
}


// Códigos já homologados (com formulário validado e DOCX aprovado).
// A lista real de disponíveis vem de nbi_templates.disponivel; esta constante
// existe apenas como salvaguarda no cliente para nunca permitir a inclusão de
// um assunto ainda não homologado.
export const CODIGOS_HOMOLOGADOS: ReadonlySet<string> = new Set([
  "ferias",
  "apresentacao",
  "viagem",
  "assuncao_funcao",
  "dispensa_funcao",
  "servico_extraordinario",
  "dispensa_recompensa",
  "nomeacao_comissao",
  "licenca_paternidade",
]);

