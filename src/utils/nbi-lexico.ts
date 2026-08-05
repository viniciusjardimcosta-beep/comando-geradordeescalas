// Léxico PT indexado por forma "achatada" (minúscula, sem diacríticos).
// Substitui o nspell no caminho de execução: construir o Hunspell completo
// (312k verbetes) custa minutos de CPU e travava a Etapa 3 — Conferência.
// Aqui só há parsing linear de texto + Map, tudo puro e barato.

export type IndiceLexico = Map<string, string>;

/** Minúsculo e sem diacríticos — chave de comparação do índice. */
export function achatar(palavra: string): string {
  return palavra
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function temAcento(p: string): boolean {
  return achatar(p) !== p.toLowerCase();
}

/**
 * Constrói o índice a partir do conteúdo bruto de um arquivo .dic Hunspell.
 * Função PURA: recebe texto, devolve Map. Não toca em rede, estado ou DOM.
 */
export function indexarLexico(dicRaw: string): IndiceLexico {
  const idx: IndiceLexico = new Map();
  const linhas = dicRaw.split("\n");
  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i];
    if (!linha) continue;
    const barra = linha.indexOf("/");
    const palavra = (barra >= 0 ? linha.slice(0, barra) : linha).trim();
    if (palavra.length < 2) continue;
    if (/\d/.test(palavra)) continue;
    const chave = achatar(palavra);
    const atual = idx.get(chave);
    // Preferência: forma acentuada (é o erro típico do operador: falta de acento).
    if (atual === undefined || (!temAcento(atual) && temAcento(palavra))) {
      idx.set(chave, palavra);
    }
  }
  return idx;
}

/** Palavra existe no léxico exatamente como digitada (case-insensitive). */
export function conhecida(palavra: string, idx: IndiceLexico): boolean {
  const oficial = idx.get(achatar(palavra));
  if (oficial === undefined) return false;
  return oficial.toLowerCase() === palavra.toLowerCase();
}

/**
 * Sugere a grafia oficial (normalmente a acentuação) preservando a
 * capitalização digitada. Devolve null quando nada há a sugerir.
 */
export function sugerirPorLexico(palavra: string, idx: IndiceLexico): string | null {
  const oficial = idx.get(achatar(palavra));
  if (!oficial) return null;
  if (oficial.toLowerCase() === palavra.toLowerCase()) return null;
  // Preserva a caixa da primeira letra digitada.
  const primeiraMaiuscula = palavra.charAt(0) === palavra.charAt(0).toUpperCase();
  const sugerida = primeiraMaiuscula
    ? oficial.charAt(0).toUpperCase() + oficial.slice(1)
    : oficial;
  return sugerida === palavra ? null : sugerida;
}
