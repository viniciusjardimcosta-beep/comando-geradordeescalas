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

  assuncao_funcao: "MOVIMENTAÇÕES",
  assuncao_cargo_vago: "MOVIMENTAÇÕES",
  dispensa_funcao: "MOVIMENTAÇÕES",
  dispensa_cargo_vago: "MOVIMENTAÇÕES",
  dispensa_recompensa: "MOVIMENTAÇÕES",

  servico_extraordinario: "SERVIÇO",
  viagem: "SERVIÇO",
  nomeacao_comissao: "SERVIÇO",

  renovacao_tempo: "ADMINISTRATIVO",
  situacao_sanitaria: "ADMINISTRATIVO",
  comunicado: "ADMINISTRATIVO",
};

export function categoriaDoCodigo(codigo: string): CategoriaNbi {
  return MAPA[codigo] ?? "ADMINISTRATIVO";
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

