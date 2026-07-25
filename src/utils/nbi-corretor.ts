// Motor de sugestões ortográficas para campos livres do módulo NBI.
// Combina um mapa curado pt-BR (acentuação comum) com o nspell offline.
// Nunca substitui automaticamente — apenas propõe correções.

import type { Spellchecker } from "@/hooks/use-spellcheck";

// Mapa curado de correções recorrentes em português.
// Chave em minúsculo, sem acento. Aplicado ANTES de consultar o nspell —
// isso garante que "sao" → "São", "missao" → "missão" mesmo quando o
// dicionário Hunspell aceita a forma sem acento como válida.
export const MAPA_ACENTOS_PT: Readonly<Record<string, string>> = {
  sao: "São",
  ferias: "férias",
  missao: "missão",
  apresentacao: "apresentação",
  batalhao: "batalhão",
  pelotao: "pelotão",
  companhia: "companhia",
  operacao: "operação",
  operacoes: "operações",
  formacao: "formação",
  instrucao: "instrução",
  educacao: "educação",
  organizacao: "organização",
  situacao: "situação",
  cerimonia: "cerimônia",
  cerimonial: "cerimonial",
  transito: "trânsito",
  publico: "público",
  publica: "pública",
  proprio: "próprio",
  propria: "própria",
  policia: "polícia",
  militar: "militar",
  guarnicao: "guarnição",
  corporacao: "corporação",
  subunidade: "subunidade",
  regiao: "região",
  regioes: "regiões",
  seculo: "século",
  logistica: "logística",
  reuniao: "reunião",
  reunioes: "reuniões",
  comissao: "comissão",
  divisao: "divisão",
  supervisao: "supervisão",
  gestao: "gestão",
  eleicao: "eleição",
  substituicao: "substituição",
  transferencia: "transferência",
  ferramenta: "ferramenta",
  veiculo: "veículo",
  material: "material",
  proximo: "próximo",
  proxima: "próxima",
  vitima: "vítima",
  ultimo: "último",
  ultima: "última",
  historico: "histórico",
  medico: "médico",
  medica: "médica",
  clinica: "clínica",
  numero: "número",
};

// Divisão em tokens preservando índice para exibição posterior.
export interface Token {
  palavra: string;
  inicio: number;
}

export function tokenizar(s: string): Token[] {
  const out: Token[] = [];
  const re = /[\p{L}\p{M}\d'\-]+/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    out.push({ palavra: m[0], inicio: m.index });
  }
  return out;
}

// Ignora tokens que não devem ser corrigidos:
// - siglas em CAIXA ALTA;
// - números;
// - palavras muito curtas;
// - palavras contendo dígito (matrículas, códigos).
export function deveIgnorar(word: string): boolean {
  if (word.length < 3) return true;
  if (/\d/.test(word)) return true;
  if (/[A-ZÁÉÍÓÚÇÃÕÂÊÔ]{2,}/.test(word) && word === word.toUpperCase()) return true;
  return false;
}

export interface SugestaoPalavra {
  original: string;
  correcao: string;
  fonte: "acentos" | "nspell";
  inicio: number;
}

export interface SugestoesOpts {
  extras?: Set<string>;
  ignoradas?: Set<string>;
  // Se true, capitaliza a inicial de cada palavra sugerida (útil p/ nomes próprios).
  capitalizarProprios?: boolean;
}

// Analisa todo o texto e devolve UMA sugestão por posição.
// Preferência: mapa curado > nspell.
export function sugestoesTexto(
  texto: string,
  spell: Spellchecker | null,
  opts: SugestoesOpts = {},
): SugestaoPalavra[] {
  const extras = opts.extras ?? new Set<string>();
  const ignoradas = opts.ignoradas ?? new Set<string>();
  const toks = tokenizar(texto);
  const out: SugestaoPalavra[] = [];

  for (const t of toks) {
    const w = t.palavra;
    const wl = w.toLowerCase();
    if (deveIgnorar(w)) continue;
    if (ignoradas.has(wl)) continue;
    if (extras.has(w) || extras.has(wl)) continue;

    // 1) mapa curado (acentuação comum pt-BR)
    const alvoMapa = MAPA_ACENTOS_PT[wl];
    if (alvoMapa && alvoMapa.toLowerCase() !== wl) {
      const correcao = opts.capitalizarProprios ? capitalizarPalavra(alvoMapa) : alvoMapa;
      if (correcao !== w) {
        out.push({ original: w, correcao, fonte: "acentos", inicio: t.inicio });
        continue;
      }
    }

    // 2) nspell (se disponível)
    if (!spell) continue;
    if (spell.correct(w)) {
      // Mesmo que o nspell aceite, oferecemos capitalização para nomes próprios.
      if (opts.capitalizarProprios) {
        const cap = capitalizarPalavra(w);
        if (cap !== w) out.push({ original: w, correcao: cap, fonte: "acentos", inicio: t.inicio });
      }
      continue;
    }
    const sugs = spell.suggest(w);
    if (sugs.length === 0) continue;
    const alvo = sugs[0];
    if (alvo.toLowerCase() === wl) continue;
    const correcao = opts.capitalizarProprios ? capitalizarPalavra(alvo) : alvo;
    out.push({ original: w, correcao, fonte: "nspell", inicio: t.inicio });
  }

  return out;
}

// Capitaliza primeira letra preservando o restante.
export function capitalizarPalavra(w: string): string {
  if (!w) return w;
  // Preserva "de", "da", "do", "e" em nomes compostos (aplicado só em sugestão de campo).
  const minus = new Set(["de", "da", "do", "das", "dos", "e"]);
  if (minus.has(w.toLowerCase())) return w.toLowerCase();
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
}

// Aplica uma sugestão específica no texto sem afetar as demais posições.
export function aplicarSugestao(texto: string, sug: SugestaoPalavra): string {
  const antes = texto.slice(0, sug.inicio);
  const depois = texto.slice(sug.inicio + sug.original.length);
  return antes + sug.correcao + depois;
}

// Sugere capitalização inicial da frase (para MISSAO / MOTIVO).
export function sugestaoInicialMaiuscula(texto: string): { correcao: string } | null {
  const t = texto.trimStart();
  if (!t) return null;
  const first = t.charAt(0);
  if (first === first.toUpperCase()) return null;
  const idx = texto.indexOf(first);
  const novo = texto.slice(0, idx) + first.toUpperCase() + texto.slice(idx + 1);
  return { correcao: novo };
}
