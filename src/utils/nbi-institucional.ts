// Sugestões administrativas seguras para campos institucionais do módulo NBI.
// Nunca aplica automaticamente: devolve apenas uma proposta de grafia.
// Nunca altera siglas militares já válidas.

export type ModoInstitucional = "caixa_alta" | "funcao" | "lotacao";

// Siglas militares canônicas (chave em minúsculo, sem pontuação).
const SIGLAS: Readonly<Record<string, string>> = {
  bbm: "BBM",
  ciabm: "CiaBM",
  pelbm: "PelBM",
  gbm: "GBM",
  sgbm: "SGBM",
  cbmrs: "CBMRS",
  cbm: "CBM",
  qpbm: "QPBM",
  qobm: "QOBM",
  qoem: "QOEM",
  cmdt: "Cmt",
  cmt: "Cmt",
  subcmt: "SubCmt",
  cia: "Cia",
  pel: "Pel",
  bm: "BM",
  sd: "Sd",
  cb: "Cb",
  sgt: "Sgt",
  st: "ST",
  ten: "Ten",
  cap: "Cap",
  maj: "Maj",
  cel: "Cel",
  tc: "TC",
  nbi: "NBI",
  bi: "BI",
  p1: "P/1",
  ssp: "SSP",
};

// Substantivos que definem o gênero do ordinal que os antecede.
const FEMININOS = new Set([
  "companhia", "cia", "ciabm", "seção", "secao", "secretaria", "brigada", "região", "regiao",
  "divisão", "divisao", "base", "unidade", "delegacia",
]);
const MASCULINOS = new Set([
  "batalhão", "batalhao", "bbm", "pelotão", "pelotao", "pel", "pelbm", "grupamento", "gbm",
  "comando", "corpo", "posto", "distrito", "subgrupamento", "sgbm",
]);

function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function chave(s: string): string {
  return stripDiacritics(s).toLowerCase().replace(/[^a-z0-9/]+/g, "");
}

const CONECTIVOS = new Set(["de", "da", "do", "das", "dos", "e", "em", "no", "na"]);

// Normaliza uma sigla colada a um ordinal: "15ºbbm" → "15ºBBM".
function normalizarToken(token: string, modo: ModoInstitucional): string {
  const m = /^(\d+\s*[ºª°]?)(.*)$/.exec(token);
  if (m && m[2]) {
    return normalizarOrdinal(m[1]) + normalizarToken(m[2], modo);
  }
  const k = chave(token);
  if (!k) return token;
  const canon = SIGLAS[k];
  if (canon) {
    // Não altera sigla já válida.
    if (token === canon) return token;
    return modo === "caixa_alta" ? canon.toUpperCase() : canon;
  }
  return token;
}

function normalizarOrdinal(s: string): string {
  return s.replace(/\s+/g, "").replace(/°/g, "º");
}

function capitalizar(w: string): string {
  if (!w) return w;
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
}

export interface SugestaoInstitucional {
  original: string;
  correcao: string;
  motivos: string[];
}

/**
 * Analisa a expressão completa de um campo institucional e devolve a grafia
 * administrativa sugerida. Retorna null quando nada muda.
 */
export function sugerirInstitucional(
  texto: string,
  modo: ModoInstitucional,
): SugestaoInstitucional | null {
  const bruto = texto.trim();
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

  // 2) Normalização de siglas e ordinais token a token
  const antesSiglas = out;
  const tokens = out.split(" ");
  const norm = tokens.map((t) => {
    const sufixo = /[.,;:]$/.test(t) ? t.slice(-1) : "";
    const nucleo = sufixo ? t.slice(0, -1) : t;
    return normalizarToken(nucleo, modo) + sufixo;
  });
  out = norm.join(" ");
  if (out !== antesSiglas) motivos.push("Padronização de siglas militares");

  // 3) Concordância do ordinal com o substantivo seguinte
  const antesOrd = out;
  out = out.replace(/(\d+)\s*([ºª°])\s*([\p{L}]+)/gu, (m, num: string, ord: string, palavra: string) => {
    const k = chave(palavra);
    let alvo = ord === "°" ? "º" : ord;
    if (FEMININOS.has(k)) alvo = "ª";
    else if (MASCULINOS.has(k)) alvo = "º";
    const colado = /^\d+\s*[ºª°]\S/.test(m);
    return `${num}${alvo}${colado ? "" : " "}${palavra}`;
  });
  if (out !== antesOrd) motivos.push("Concordância do ordinal (º/ª)");

  // 4) Capitalização conforme o modo
  const antesCap = out;
  if (modo === "caixa_alta") {
    out = out.toUpperCase();
    if (out !== antesCap) motivos.push("Forma institucional em caixa alta");
  } else if (modo === "funcao") {
    const primeira = out.charAt(0);
    if (primeira && primeira !== primeira.toUpperCase()) {
      out = primeira.toUpperCase() + out.slice(1);
      motivos.push("Inicial maiúscula");
    }
  } else {
    // lotacao → nome próprio, preservando siglas conhecidas
    out = out
      .split(" ")
      .map((t, i) => {
        const sufixo = /[.,;:]$/.test(t) ? t.slice(-1) : "";
        const nucleo = sufixo ? t.slice(0, -1) : t;
        const m = /^(\d+[ºª])(.*)$/.exec(nucleo);
        const prefixoOrd = m ? m[1] : "";
        const corpo = m ? m[2] : nucleo;
        if (!corpo) return t;
        if (SIGLAS[chave(corpo)]) return prefixoOrd + corpo + sufixo;
        if (i > 0 && CONECTIVOS.has(chave(corpo))) return prefixoOrd + corpo.toLowerCase() + sufixo;
        return prefixoOrd + capitalizar(corpo) + sufixo;
      })
      .join(" ");
    if (out !== antesCap) motivos.push("Capitalização de nome próprio");
  }

  if (out === bruto) return null;
  if (motivos.length === 0) motivos.push("Ajuste de espaçamento");
  return { original: bruto, correcao: out, motivos };
}
