// Bloco 10E — Catálogo institucional de siglas (por usuário/unidade).
// A sigla NUNCA é expandida automaticamente sem cadastro.
// Nenhum texto oficial vive aqui: apenas a forma escolhida pelo operador.

export type ModoFormaDocumental = "sigla" | "descricao" | "personalizada";

export interface SiglaInstitucional {
  id?: string;
  sigla: string;
  descricao_oficial: string;
  /** Forma personalizada confirmada pelo operador (ex.: "Chefe da SSCI"). */
  forma_documental?: string | null;
  categoria?: string | null;
  ativo?: boolean;
  /** Modo escolhido; ausente = sigla. */
  modo?: ModoFormaDocumental | null;
}

function chave(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
}

export function buscarSigla(
  sigla: string,
  catalogo: SiglaInstitucional[],
): SiglaInstitucional | null {
  const k = chave(sigla);
  return catalogo.find((s) => (s.ativo ?? true) && chave(s.sigla) === k) ?? null;
}

/**
 * Forma documental de uma sigla.
 * - sem cadastro → sigla preservada exatamente como veio;
 * - modo "sigla" → sigla canônica cadastrada;
 * - modo "descricao" → descrição oficial completa;
 * - modo "personalizada" → forma documental confirmada (fallback: sigla).
 */
export function formaDocumentalDeSigla(
  sigla: string,
  catalogo: SiglaInstitucional[],
  modoForcado?: ModoFormaDocumental,
): string {
  const bruto = String(sigla ?? "").trim();
  const item = buscarSigla(bruto, catalogo);
  if (!item) return bruto;
  const modo: ModoFormaDocumental = modoForcado ?? item.modo ?? "sigla";
  if (modo === "descricao") return item.descricao_oficial.trim() || item.sigla;
  if (modo === "personalizada") return (item.forma_documental ?? "").trim() || item.sigla;
  return item.sigla;
}

/**
 * Aplica o catálogo a um texto documental (função, lotação).
 * Só substitui tokens cadastrados — nada é inventado.
 */
export function aplicarCatalogoSiglas(
  texto: string,
  catalogo: SiglaInstitucional[],
): string {
  const bruto = String(texto ?? "");
  if (!bruto.trim() || catalogo.length === 0) return bruto;
  return bruto.replace(/[\p{L}\p{N}]+/gu, (token) => {
    if (!buscarSigla(token, catalogo)) return token;
    return formaDocumentalDeSigla(token, catalogo) || token;
  });
}

/** Registro das siglas efetivamente usadas (snapshot/auditoria). */
export function siglasUtilizadas(
  texto: string,
  catalogo: SiglaInstitucional[],
): Array<{ sigla: string; descricao_oficial: string; forma_aplicada: string }> {
  const out: Array<{ sigla: string; descricao_oficial: string; forma_aplicada: string }> = [];
  for (const token of String(texto ?? "").match(/[\p{L}\p{N}]+/gu) ?? []) {
    const item = buscarSigla(token, catalogo);
    if (!item) continue;
    if (out.some((o) => chave(o.sigla) === chave(item.sigla))) continue;
    out.push({
      sigla: item.sigla,
      descricao_oficial: item.descricao_oficial,
      forma_aplicada: formaDocumentalDeSigla(token, catalogo),
    });
  }
  return out;
}
