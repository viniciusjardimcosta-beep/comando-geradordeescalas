// Utilitários do módulo NBI — sem dependência do motor de escalas.
// Todas as chaves de placeholder são SEM acento (LOTACAO, MISSAO, FUNCAO_*).

export type AssuntoTipo = "ferias" | "apresentacao" | "viagem" | "assuncao_funcao" | "dispensa_funcao";

export interface MilitarNbi {
  id: string;
  nome: string;
  nome_guerra: string | null;
  posto_graduacao: string | null;
  matricula: string | null;
  quadro: string | null;
  lotacao_nbi: string | null;
  funcao_atual: string | null;
  distribuicao_interna_nbi: string | null;
  genero_gramatical: string | null;
  // Estrutura institucional (Bloco 8B) — exclusiva do módulo NBI.
  gbm_nbi?: string | null;
  companhia_nbi?: string | null;
  pelotao_nbi?: string | null;
  secao_nbi?: string | null;
  subsecao_nbi?: string | null;
  setor_nbi?: string | null;
  cidade_nbi?: string | null;
  batalhao_nbi?: string | null;
  funcao_administrativa_nbi?: string | null;
  funcao_documental_nbi?: string | null;
}

export interface FeriasReg {
  id: string;
  militar_id: string;
  ano: number;
  periodo: number;
  data_inicio: string; // yyyy-mm-dd
  data_fim: string;
}

const UNIDADES: Record<number, string> = {
  0: "zero", 1: "um", 2: "dois", 3: "três", 4: "quatro", 5: "cinco",
  6: "seis", 7: "sete", 8: "oito", 9: "nove", 10: "dez", 11: "onze",
  12: "doze", 13: "treze", 14: "quatorze", 15: "quinze", 16: "dezesseis",
  17: "dezessete", 18: "dezoito", 19: "dezenove",
};
const DEZENAS: Record<number, string> = {
  20: "vinte", 30: "trinta", 40: "quarenta", 50: "cinquenta",
  60: "sessenta", 70: "setenta", 80: "oitenta", 90: "noventa",
};
const CENTENAS: Record<number, string> = {
  100: "cem", 200: "duzentos", 300: "trezentos", 400: "quatrocentos",
  500: "quinhentos", 600: "seiscentos", 700: "setecentos", 800: "oitocentos", 900: "novecentos",
};

export function numeroPorExtenso(n: number): string {
  if (n < 0) return `menos ${numeroPorExtenso(-n)}`;
  if (n < 20) return UNIDADES[n];
  if (n < 100) {
    const d = Math.floor(n / 10) * 10;
    const u = n % 10;
    return u === 0 ? DEZENAS[d] : `${DEZENAS[d]} e ${UNIDADES[u]}`;
  }
  if (n === 100) return "cem";
  if (n < 1000) {
    const c = Math.floor(n / 100) * 100;
    const r = n % 100;
    const base = c === 100 ? "cento" : CENTENAS[c];
    return r === 0 ? base : `${base} e ${numeroPorExtenso(r)}`;
  }
  return String(n);
}

const ORDINAIS: Record<string, number> = {
  primeiro: 1, "1": 1, "1o": 1, "1º": 1,
  segundo: 2, "2": 2, "2o": 2, "2º": 2,
  terceiro: 3, "3": 3, "3o": 3, "3º": 3,
  quarto: 4, "4": 4,
};

export function periodoOrdinal(p: number): string {
  return p === 1 ? "1º" : p === 2 ? "2º" : p === 3 ? "3º" : `${p}º`;
}

// ---------- Interpretação de frase (NBI) ----------

function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function normalizarTextoNbi(s: string): string {
  let x = " " + stripDiacritics(s.toLowerCase()).replace(/[.,;:!?]/g, " ") + " ";
  // ordinais textuais → símbolo
  x = x.replace(/\bprimeiro\b/g, "1º")
       .replace(/\bsegundo\b/g, "2º")
       .replace(/\bterceiro\b/g, "3º")
       .replace(/\bquarto\b/g, "4º");
  // 1o / 1° / 1a → 1º
  x = x.replace(/\b([1-9])[oº°ª]\b/g, "$1º");
  // abreviações comuns
  x = x.replace(/\bsgt\b/g, "sargento")
       .replace(/\bsd\b/g, "soldado")
       .replace(/\bst\b/g, "subtenente")
       .replace(/\bcb\b/g, "cabo")
       .replace(/\bten\b/g, "tenente")
       .replace(/\bcap\b/g, "capitao")
       .replace(/\bmaj\b/g, "major")
       .replace(/\bcel\b/g, "coronel")
       .replace(/\bten\s+cel\b/g, "tenente coronel")
       .replace(/\bsub\s+tenente\b/g, "subtenente");
  return " " + x.replace(/\s+/g, " ").trim() + " ";
}

// Postos em ordem: casar sempre a variação mais específica antes.
const POSTOS_CANONICOS: string[] = [
  "tenente coronel",
  "1º sargento",
  "2º sargento",
  "3º sargento",
  "1º tenente",
  "2º tenente",
  "subtenente",
  "aspirante",
  "capitao",
  "coronel",
  "major",
  "tenente",
  "sargento",
  "cabo",
  "soldado",
];

const STOPWORDS = new Set<string>([
  "de","do","da","dos","das","o","a","os","as","para","ao","aos","à","às",
  "com","e","em","no","na","nos","nas","um","uma",
  "periodo","período",
  "ferias","férias",
  "viagem","apresentacao","apresentação",
  "assuncao","assunção","dispensa","funcao","função",
  "militar","matricula","matrícula","id","func",
  "primeiro","segundo","terceiro","quarto",
  "1","2","3","4","1º","2º","3º","4º",
]);

export interface AnaliseFraseNbi {
  periodo: number | null;
  matricula: string | null;
  postoCanonico: string | null; // já normalizado (sem acentos, minúsculo)
  termos: string[];              // tokens restantes (nome, apelido, IDs fictícios)
}

export function analisarFraseNbi(frase: string): AnaliseFraseNbi {
  const norm = normalizarTextoNbi(frase);
  let restante = norm;

  // período
  let periodo: number | null = null;
  for (const chave of Object.keys(ORDINAIS)) {
    const alvo = normalizarTextoNbi(chave).trim();
    const re = new RegExp(`\\s${alvo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s`);
    if (re.test(restante)) {
      periodo = ORDINAIS[chave];
      restante = restante.replace(re, " ");
      break;
    }
  }

  // matrícula (frase explícita ou sequência ≥4 dígitos)
  let matricula: string | null = null;
  const mExpl = restante.match(/\s(?:matricula|militar|id\s+func|id)\s+(\d{2,})\s/);
  if (mExpl) {
    matricula = mExpl[1];
    restante = restante.replace(mExpl[0], " ");
  } else {
    const mDig = restante.match(/\s(\d{4,})\s/);
    if (mDig) {
      matricula = mDig[1];
      restante = restante.replace(mDig[0], " ");
    }
  }

  // posto (mais específico primeiro)
  let postoCanonico: string | null = null;
  for (const p of POSTOS_CANONICOS) {
    const re = new RegExp(`\\s${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s`);
    if (re.test(restante)) {
      postoCanonico = p;
      restante = restante.replace(re, " ");
      break;
    }
  }

  // termos restantes (nomes/apelidos/IDs fictícios)
  const termos = restante
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && !STOPWORDS.has(t));

  return { periodo, matricula, postoCanonico, termos };
}

// Mantido por compatibilidade — usa o analisador novo.
export function extrairPeriodoENome(frase: string): { periodo: number | null; nome: string | null } {
  const a = analisarFraseNbi(frase);
  return { periodo: a.periodo, nome: a.termos.length > 0 ? a.termos.join(" ") : null };
}

// Compara posto/graduação cadastrado do militar com o canônico detectado.
export function postoMilitarCombina(postoCadastrado: string | null | undefined, canonico: string | null): boolean {
  if (!canonico) return false;
  if (!postoCadastrado) return false;
  const norm = normalizarTextoNbi(postoCadastrado).trim();
  return norm.includes(canonico);
}


export function montarPostoQuadro(posto: string | null, quadro: string | null): string {
  const p = (posto ?? "").trim().replace(/\s+/g, " ");
  const q = (quadro ?? "").trim().replace(/\s+/g, " ");
  if (!p) return q;
  if (!q) return p;
  // Detecta duplicação do quadro no posto (case/acento-insensitive)
  const norm = (s: string) => stripDiacritics(s).toUpperCase().replace(/\s+/g, " ").trim();
  const pN = norm(p);
  const qN = norm(q);
  // Já contém o quadro como token isolado?
  const re = new RegExp(`(^|\\s)${qN.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}(\\s|$)`);
  if (re.test(pN)) return p;
  return `${p} ${q}`;
}

export function artigoO(genero: string | null | undefined): string {
  return (genero ?? "").toUpperCase() === "F" ? "a" : "o";
}
export function artigoAo(genero: string | null | undefined): string {
  return (genero ?? "").toUpperCase() === "F" ? "à" : "ao";
}

export function somarDiasISO(iso: string, dias: number): string {
  const [y, m, d] = iso.split("-").map((v) => parseInt(v, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + dias);
  return dt.toISOString().slice(0, 10);
}

export function diasEntreISO(inicioISO: string, fimISO: string): number {
  const a = new Date(inicioISO + "T00:00:00Z").getTime();
  const b = new Date(fimISO + "T00:00:00Z").getTime();
  return Math.round((b - a) / 86400000) + 1;
}

export function formatarDataBR(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

// Substituição textual — nunca altera o modelo, apenas troca {{CHAVE}} pelo valor.
export function interpolarTexto(
  texto: string,
  valores: Record<string, string | number | boolean | null | undefined>,
): { texto: string; ausentes: string[] } {
  const ausentes: string[] = [];
  const out = texto.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_, chave: string) => {
    const v = valores[chave];
    if (v === undefined || v === null || v === "") {
      ausentes.push(chave);
      return `{{${chave}}}`;
    }
    return String(v);
  });
  return { texto: out, ausentes };
}
