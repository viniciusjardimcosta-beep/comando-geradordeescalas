// Bloco 10D — Normalização INSTITUCIONAL (camada B).
// Esta camada é independente do corretor ortográfico de português (camada A).
// Ela nunca trata sigla militar como palavra comum: siglas têm forma canônica
// congelada e jamais recebem capitalização de nome próprio ("Bbm" é proibido).
//
// Usada em: lotações, funções, cabeçalho, unidades, siglas, postos e quadros.

export type ModoInstitucional = "caixa_alta" | "funcao" | "lotacao";

/**
 * Siglas institucionais canônicas.
 * Chave = forma reduzida (minúscula, sem acento e sem pontuação).
 * Valor = grafia oficial obrigatória (nunca alterada por capitalização).
 */
export const SIGLAS_CANONICAS: Readonly<Record<string, string>> = {
  // Unidades
  bbm: "BBM",
  cia: "CiaBM",
  ciabm: "CiaBM",
  pel: "PelBM",
  pelbm: "PelBM",
  gbm: "GBM",
  sgbm: "SGBM",
  // Corporação
  cbmrs: "CBMRS",
  cbm: "CBM",
  bm: "BM",
  // Quadros
  qpbm: "QPBM",
  qtbm: "QTBM",
  qoem: "QOEM",
  qobm: "QOBM",
  qosbm: "QOSBM",
  qoa: "QOA",
  // Seções e órgãos
  slog: "SLOG",
  ssci: "SSCI",
  sseg: "SSeg",
  sadm: "SAdm",
  sint: "SINT",
  sodc: "SODC",
  cobom: "COBOM",
  // Serviço
  cov: "COV",
  cg: "CG",
  bi: "BI",
  nbi: "NBI",
  idfunc: "ID FUNC",
  // Postos e graduações
  sd: "Sd",
  cb: "Cb",
  sgt: "Sgt",
  st: "ST",
  ten: "Ten",
  cap: "Cap",
  maj: "Maj",
  cel: "Cel",
  tc: "TC",
  cmt: "Cmt",
  cmdt: "Cmt",
  subcmt: "SubCmt",
  p1: "P/1",
  ssp: "SSP",
};

/** Siglas cujo ordinal é feminino. */
const SIGLA_FEMININA = new Set(["CiaBM"]);

// Substantivos por extenso que definem o gênero do ordinal que os antecede.
const FEMININOS = new Set([
  "companhia", "cia", "ciabm", "secao", "secretaria", "brigada", "regiao",
  "divisao", "base", "unidade", "delegacia",
]);
const MASCULINOS = new Set([
  "batalhao", "bbm", "pelotao", "pel", "pelbm", "grupamento", "gbm",
  "comando", "corpo", "posto", "distrito", "subgrupamento", "sgbm",
]);

const CONECTIVOS = new Set(["de", "da", "do", "das", "dos", "e", "em", "no", "na"]);

function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function chave(s: string): string {
  return stripDiacritics(s).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function capitalizar(w: string): string {
  if (!w) return w;
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
}

/** Devolve a grafia canônica da sigla, ou null quando não é sigla conhecida. */
export function siglaCanonica(token: string): string | null {
  const k = chave(token);
  if (!k) return null;
  return SIGLAS_CANONICAS[k] ?? null;
}

function generoOrdinal(palavra: string): "º" | "ª" | null {
  const canon = siglaCanonica(palavra);
  if (canon && SIGLA_FEMININA.has(canon)) return "ª";
  const k = chave(palavra);
  if (FEMININOS.has(k)) return "ª";
  if (MASCULINOS.has(k)) return "º";
  if (canon) return "º";
  return null;
}

/**
 * Normaliza um token isolado (sem separadores).
 * Siglas conhecidas viram a forma canônica; ordinais recebem o gênero correto.
 */
function normalizarToken(token: string, modo: ModoInstitucional): string {
  if (!token) return token;

  const sufixo = /[.,;:]$/.test(token) ? token.slice(-1) : "";
  const nucleo = sufixo ? token.slice(0, -1) : token;
  if (!nucleo) return token;

  // Ordinal opcional colado: "15º", "8ª", "6o", "2"
  const m = /^(\d+)\s*([ºª°oa]?)(.*)$/i.exec(nucleo);
  if (m && m[3]) {
    const num = m[1];
    const resto = m[3];
    const canon = siglaCanonica(resto);
    const genero = generoOrdinal(resto) ?? (m[2] === "ª" || m[2] === "a" ? "ª" : "º");
    const corpo = canon ?? normalizarPalavra(resto, modo);
    return `${num}${genero}${corpo}${sufixo}`;
  }
  if (m && !m[3]) {
    // Somente número + marcador solto: apenas padroniza o símbolo.
    const marc = m[2] === "ª" || m[2] === "a" ? "ª" : m[2] ? "º" : "";
    return `${m[1]}${marc}${sufixo}`;
  }

  return normalizarPalavra(nucleo, modo) + sufixo;
}

function normalizarPalavra(palavra: string, modo: ModoInstitucional): string {
  const canon = siglaCanonica(palavra);
  if (canon) return canon; // sigla institucional: nunca capitalizada como palavra
  if (modo === "caixa_alta") return palavra.toUpperCase();
  if (modo === "lotacao") {
    if (CONECTIVOS.has(chave(palavra))) return palavra.toLowerCase();
    return capitalizar(palavra);
  }
  return palavra;
}

/** Tokeniza preservando separadores institucionais ("/", espaço, hífen). */
function normalizarExpressao(texto: string, modo: ModoInstitucional): string {
  const partes = texto.split(/([/\s-]+)/);
  return partes
    .map((p, i) => (i % 2 === 1 ? p.replace(/\s+/g, " ") : normalizarToken(p, modo)))
    .join("");
}

/**
 * Normalização OBRIGATÓRIA e determinística: concordância do ordinal,
 * forma oficial "Bombeiros Militar" e siglas canônicas. Não capitaliza
 * palavras comuns (isso é papel de `sugerirInstitucional`).
 */
export function normalizarInstitucional(texto: string): string {
  const bruto = (texto ?? "").trim().replace(/\s+/g, " ");
  if (!bruto) return "";
  let out = bruto.replace(/\b(bombeiro)(\s+militar)\b/gi, (_m, a: string, b: string) => {
    const plural = a === a.toUpperCase() ? "BOMBEIROS" : capitalizar(a) === a ? "Bombeiros" : "bombeiros";
    return plural + b;
  });
  // Ordinal + substantivo por extenso (mantém o espaçamento original).
  out = out.replace(/(\d+)\s*([ºª°])\s*([\p{L}]+)/gu, (m, num: string, ord: string, palavra: string) => {
    const g = generoOrdinal(palavra) ?? (ord === "°" ? "º" : (ord as "º" | "ª"));
    const canon = siglaCanonica(palavra);
    const colado = /^\d+\s*[ºª°]\S/.test(m);
    return `${num}${g}${colado ? "" : " "}${canon ?? palavra}`;
  });
  return out;
}

export interface SugestaoInstitucional {
  original: string;
  correcao: string;
  motivos: string[];
}

/**
 * Analisa a expressão completa de um campo institucional e devolve a grafia
 * administrativa sugerida. Retorna null quando nada muda (sem falso positivo).
 */
export function sugerirInstitucional(
  texto: string,
  modo: ModoInstitucional,
): SugestaoInstitucional | null {
  const bruto = (texto ?? "").trim();
  if (!bruto) return null;

  const motivos: string[] = [];
  let out = bruto.replace(/\s+/g, " ");

  // 1) "Bombeiro Militar" institucional → "Bombeiros Militar"
  const antesPlural = out;
  out = out.replace(/\b(bombeiro)(\s+militar)\b/gi, (_m, a: string, b: string) => {
    const plural = a === a.toUpperCase() ? "BOMBEIROS" : capitalizar(a) === a ? "Bombeiros" : "bombeiros";
    return plural + b;
  });
  if (out !== antesPlural) motivos.push('"Bombeiro Militar" → "Bombeiros Militar"');

  // 2) Siglas canônicas, ordinais e capitalização, token a token
  const antes = out;
  out = normalizarExpressao(out, modo);
  if (out !== antes) motivos.push("Padronização institucional (siglas e ordinais)");

  if (out === bruto) return null;
  if (motivos.length === 0) motivos.push("Ajuste de espaçamento");
  return { original: bruto, correcao: out, motivos };
}
