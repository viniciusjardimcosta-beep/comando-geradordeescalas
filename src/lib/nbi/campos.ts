// Bloco 10 — fonte única das chaves que o operador NUNCA digita.
// Regra: "se o sistema consegue descobrir a informação, o operador não a digita".
// Nenhum texto oficial vive aqui — apenas classificação de placeholders.

import type { OrigemDado } from "./derivados";

/** Vêm do cadastro do militar (Banco de Militares). */
export const CHAVES_DO_MILITAR = [
  "NOME", "ID_FUNC", "LOTACAO", "POSTO_QUADRO",
  "FUNCAO_DOCUMENTAL", "FUNCAO_ADMINISTRATIVA", "DISTRIBUICAO_INTERNA",
] as const;

/** Vêm do cadastro do titular da função. */
export const CHAVES_DO_TITULAR = [
  "NOME_TITULAR", "ID_FUNC_TITULAR", "LOTACAO_TITULAR", "POSTO_QUADRO_TITULAR",
  "DISTRIBUICAO_INTERNA_TITULAR", "FUNCAO_ATUAL_TITULAR", "FUNCAO_DOCUMENTAL_TITULAR",
] as const;

/** Gramática e concordância — sempre deduzidas do cadastro. */
export const CHAVES_GRAMATICAIS = [
  "ARTIGO_O_A", "ARTIGO_AO_A", "ARTIGO_O_A_TITULAR", "ARTIGO_O_A_CAP",
  "TERMO_DIA", "TERMINACAO_RETORNO", "QTD_DIAS_EXTENSO",
] as const;

/** Calculadas a partir de datas/quantidades já informadas. */
export const CHAVES_CALCULADAS = [
  "ANO", "MES_REFERENCIA", "DATA_APRESENTACAO",
] as const;

/** Conjunto completo: nunca renderizar como campo digitável. */
export const CHAVES_NUNCA_DIGITADAS: ReadonlySet<string> = new Set<string>([
  ...CHAVES_DO_MILITAR,
  ...CHAVES_DO_TITULAR,
  ...CHAVES_GRAMATICAIS,
  ...CHAVES_CALCULADAS,
]);

/** Origem institucional exibida no badge do campo derivado. */
export function origemDaChave(chave: string): OrigemDado {
  if ((CHAVES_DO_MILITAR as readonly string[]).includes(chave)) return "Banco de Militares";
  if ((CHAVES_DO_TITULAR as readonly string[]).includes(chave)) return "Banco de Militares";
  if ((CHAVES_GRAMATICAIS as readonly string[]).includes(chave)) return "Cálculo automático";
  return "Cálculo automático";
}

/** Campos montados por componentes estruturados (sem texto livre). */
export const CHAVES_ESTRUTURADAS: Record<string, string[]> = {
  nomeacao_comissao: ["COMPOSICAO", "FINALIDADE"],
};

/** Decide se o campo deve sair do formulário do assunto. */
export function campoOculto(tipo: string, chave: string): boolean {
  if (CHAVES_NUNCA_DIGITADAS.has(chave)) return true;
  return (CHAVES_ESTRUTURADAS[tipo] ?? []).includes(chave);
}
