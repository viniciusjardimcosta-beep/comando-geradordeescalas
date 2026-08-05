// Bloco 10C — Normalização do cabeçalho oficial no MOMENTO DA GERAÇÃO.
// Não depende de o usuário reabrir e salvar Configurações NBI antigas.
//
// O normalizador é conservador: corrige apenas
//   1. o gênero do indicador ordinal (º / ª) conforme o substantivo seguinte;
//   2. acentuação de termos institucionais consagrados (BATALHAO → BATALHÃO);
//   3. espaçamento entre o ordinal e o substantivo ("15ºBATALHÃO" → "15º BATALHÃO").
// Nunca reescreve a redação escolhida pela unidade.
//
// EXCEÇÃO MANUAL: uma linha iniciada por "!" é emitida literalmente
// (sem o "!"), preservando grafias confirmadas manualmente pelo comando.

/** Substantivos femininos que exigem indicador ordinal "ª". */
const FEMININOS = new Set([
  "COMPANHIA", "COMPANHIAS", "CIA", "CIABM", "SECAO", "SEÇÃO", "SUBSECAO", "SUBSEÇÃO",
  "SEC", "BRIGADA", "DIVISAO", "DIVISÃO", "REGIAO", "REGIÃO", "TURMA", "SESSAO", "SESSÃO",
]);

/** Substantivos masculinos que exigem indicador ordinal "º". */
const MASCULINOS = new Set([
  "BATALHAO", "BATALHÃO", "BBM", "PELOTAO", "PELOTÃO", "PEL", "PELBM",
  "GRUPAMENTO", "GBM", "GRUPO", "COMANDO", "SETOR", "DISTRITO", "SUBGRUPAMENTO",
  "CORPO", "POSTO", "NUCLEO", "NÚCLEO",
]);

/** Acentuação institucional consagrada (chave sem acento → forma oficial). */
const ACENTOS_INSTITUCIONAIS: Array<[RegExp, string]> = [
  [/\bBATALHAO\b/g, "BATALHÃO"],
  [/\bPELOTAO\b/g, "PELOTÃO"],
  [/\bSECAO\b/g, "SEÇÃO"],
  [/\bSUBSECAO\b/g, "SUBSEÇÃO"],
  [/\bDIVISAO\b/g, "DIVISÃO"],
  [/\bREGIAO\b/g, "REGIÃO"],
  [/\bSEGURANCA\b/g, "SEGURANÇA"],
  [/\bBOMBEIROS MILITARES\b/g, "BOMBEIROS MILITAR"],
  [/\bSERVICO\b/g, "SERVIÇO"],
  [/\bNUCLEO\b/g, "NÚCLEO"],
];

function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Normaliza uma linha do cabeçalho oficial.
 * Retorna a linha pronta para o DOCX (caixa alta, ordinal correto).
 */
export function normalizarLinhaCabecalho(bruto: string | null | undefined): string {
  const original = String(bruto ?? "").trim().replace(/\s+/g, " ");
  if (!original) return "";

  // Exceção confirmada manualmente: emitir literalmente.
  if (original.startsWith("!")) return original.slice(1).trim();

  let s = original.toUpperCase();

  // Acentuação institucional.
  for (const [re, sub] of ACENTOS_INSTITUCIONAIS) s = s.replace(re, sub);

  // Ordinal: número + marcador (º ª ° o a) opcionalmente colado ao substantivo.
  s = s.replace(
    /(\d+)\s*[ºª°˚ᵃoOaA]?\s*([A-ZÀ-Ú]+)/g,
    (todo, num: string, palavra: string) => {
      const chave = semAcento(palavra).toUpperCase();
      let marcador: string | null = null;
      if (FEMININOS.has(chave) || FEMININOS.has(palavra)) marcador = "ª";
      else if (MASCULINOS.has(chave) || MASCULINOS.has(palavra)) marcador = "º";
      if (!marcador) return todo; // substantivo desconhecido: não mexe
      return `${num}${marcador} ${palavra}`;
    },
  );

  return s.replace(/\s+/g, " ").trim();
}

export interface CabecalhoNbi {
  estado: string;
  secretaria: string;
  corporacao: string;
  batalhao: string;
  subunidade: string;
  cidade: string;
}

/** Normaliza todas as linhas do cabeçalho oficial de uma só vez. */
export function normalizarCabecalho(c: Partial<CabecalhoNbi>): CabecalhoNbi {
  return {
    estado: normalizarLinhaCabecalho(c.estado),
    secretaria: normalizarLinhaCabecalho(c.secretaria),
    corporacao: normalizarLinhaCabecalho(c.corporacao),
    batalhao: normalizarLinhaCabecalho(c.batalhao),
    subunidade: normalizarLinhaCabecalho(c.subunidade),
    // Cidade não é caixa alta obrigatória — preserva a grafia do topônimo.
    cidade: String(c.cidade ?? "").trim().replace(/^!/, "").replace(/\s+/g, " "),
  };
}
