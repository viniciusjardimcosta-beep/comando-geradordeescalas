// Helper único de formatação institucional do módulo NBI (Bloco 8B).
// Nenhum motor pode concatenar lotação/função manualmente: todos usam daqui.
// Não contém texto oficial (esse vive apenas em nbi_templates).

export interface EstruturaNbi {
  gbm?: string | null;
  pelotao?: string | null;
  companhia?: string | null;
  batalhao?: string | null;
  secao?: string | null;
  subsecao?: string | null;
  setor?: string | null;
  cidade?: string | null;
}

const ORD_MASC = new Set(["GBM", "PEL", "PELBM", "BBM", "SGBM"]);
const ORD_FEM = new Set(["CIA", "CIABM", "SECAO", "SEÇÃO", "SSEG"]);

function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Normaliza "2 gbm", "2o GBM", "2°gbm" → "2ºGBM"; texto livre é preservado. */
function normalizarUnidade(valor: string, siglaPadrao: string): string {
  const bruto = valor.trim().replace(/\s+/g, " ");
  if (!bruto) return "";
  // Já vem com sigla? Ex.: "2ºPelBM", "SSeg", "Setor de Vistorias"
  const somenteNumero = /^(\d+)\s*[ºª°o]?$/.exec(bruto);
  const numero = somenteNumero ? somenteNumero[1] : null;
  if (numero) {
    const chave = stripDiacritics(siglaPadrao).toUpperCase();
    const ord = ORD_FEM.has(chave) ? "ª" : ORD_MASC.has(chave) ? "º" : "º";
    return `${numero}${ord}${siglaPadrao}`;
  }
  // Ordinal já presente: apenas padroniza o símbolo e remove espaço interno.
  return bruto
    .replace(/(\d+)\s*[°o]\s*/gi, "$1º")
    .replace(/(\d+)\s*[ªa]\s*(?=CIA|Cia|SEÇÃO|Seção|SECAO)/g, "$1ª")
    .replace(/(\d+)\s*([ºª])\s*/g, "$1$2");
}

/**
 * Formata a lotação institucional na ordem documental do CBMRS:
 * setor / subseção / seção / GBM / pelotão / companhia / batalhão / cidade.
 * Partes vazias são ignoradas — nunca gera separadores soltos.
 */
export function formatarLotacaoNbi(e: EstruturaNbi): string {
  const partes = [
    normalizarUnidade(e.setor ?? "", "Setor"),
    normalizarUnidade(e.subsecao ?? "", "SSeç"),
    normalizarUnidade(e.secao ?? "", "Seção"),
    normalizarUnidade(e.gbm ?? "", "GBM"),
    normalizarUnidade(e.pelotao ?? "", "PelBM"),
    normalizarUnidade(e.companhia ?? "", "CiaBM"),
    normalizarUnidade(e.batalhao ?? "", "BBM"),
  ].filter((p) => p.length > 0);
  const base = partes.join("/");
  const cidade = (e.cidade ?? "").trim();
  if (!base) return cidade;
  return cidade ? `${base} ${cidade}` : base;
}

export interface MilitarEstrutura extends EstruturaNbi {
  posto_graduacao?: string | null;
  lotacao_nbi?: string | null;
  distribuicao_interna_nbi?: string | null;
  funcao_administrativa_nbi?: string | null;
  funcao_documental_nbi?: string | null;
  funcao_atual?: string | null;
}

/** Extrai a estrutura institucional a partir das colunas NBI do militar. */
export function estruturaDe(m: {
  gbm_nbi?: string | null; companhia_nbi?: string | null; pelotao_nbi?: string | null;
  secao_nbi?: string | null; subsecao_nbi?: string | null; setor_nbi?: string | null;
  cidade_nbi?: string | null; batalhao_nbi?: string | null;
}): EstruturaNbi {
  return {
    gbm: m.gbm_nbi, companhia: m.companhia_nbi, pelotao: m.pelotao_nbi,
    secao: m.secao_nbi, subsecao: m.subsecao_nbi, setor: m.setor_nbi,
    cidade: m.cidade_nbi, batalhao: m.batalhao_nbi,
  };
}

/** Lotação documental do militar: campo antigo tem prioridade, depois estrutura. */
export function lotacaoDocumentalDe(m: MilitarEstrutura & Parameters<typeof estruturaDe>[0]): string {
  const antiga = (m.lotacao_nbi ?? "").trim();
  if (antiga) return antiga;
  return formatarLotacaoNbi(estruturaDe(m));
}

/** Distribuição interna documental (usada para titulares). */
export function distribuicaoDocumentalDe(m: MilitarEstrutura & Parameters<typeof estruturaDe>[0]): string {
  const antiga = (m.distribuicao_interna_nbi ?? "").trim();
  if (antiga) return antiga;
  return formatarLotacaoNbi(estruturaDe(m));
}

/**
 * Função documental oficial do militar.
 * Prioridade: funcao_documental_nbi → funcao_administrativa_nbi → funcao_atual
 * → composição automática (posto + estrutura institucional).
 */
export function funcaoDocumentalDe(
  m: MilitarEstrutura & Parameters<typeof estruturaDe>[0],
): string {
  const doc = (m.funcao_documental_nbi ?? "").trim();
  if (doc) return doc;
  const adm = (m.funcao_administrativa_nbi ?? "").trim();
  if (adm) return adm;
  const atual = (m.funcao_atual ?? "").trim();
  if (atual) return atual;
  return comporFuncaoDocumental(m);
}

/**
 * Composição automática (ponto de partida editável pelo operador):
 * "2º SGT DO 2ºGBM/6ºPelBM/8ªCiaBM/15ºBBM".
 */
export function comporFuncaoDocumental(
  m: MilitarEstrutura & Parameters<typeof estruturaDe>[0],
): string {
  const posto = (m.posto_graduacao ?? "").trim();
  const local = lotacaoDocumentalDe(m) || distribuicaoDocumentalDe(m);
  if (!posto && !local) return "";
  if (!local) return posto;
  if (!posto) return local;
  return `${posto} do ${local}`;
}
