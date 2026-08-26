// Bloco 12H — preservação de metadados estruturais do snapshot NBI.
//
// A persistência do rascunho substitui o snapshot inteiro por { rascunho }.
// Isso apagava a rastreabilidade criada por duplicarNbi (origem_documento_id
// e duplicado_em) antes da geração final.
//
// Este módulo é PURO: apenas recombina o snapshot existente com o rascunho
// atual, copiando SOMENTE metadados de uma allowlist explícita. Nenhum
// conteúdo arbitrário do snapshot antigo é mesclado.

/** Chaves de metadados legítimos preservados entre persistências. */
export const METADADOS_SNAPSHOT_PRESERVADOS = [
  "origem_documento_id",
  "duplicado_em",
  // Bloco 12I — reutilização de número de NBI cancelada.
  // Conceito DIFERENTE de duplicação: origem_documento_id continua
  // representando apenas a origem da cópia.
  "numero_candidato_reutilizacao",
  "numero_candidato_origem_id",
  "numero_reutilizado_de_documento_id",
  "numero_reutilizado_em",
  "numero_reutilizado_confirmado_por",
] as const;

export type MetadadoSnapshot = (typeof METADADOS_SNAPSHOT_PRESERVADOS)[number];

export type SnapshotNbi = {
  rascunho?: unknown;
  /** true somente quando a reutilização foi efetivada pela RPC dedicada. */
  numero_reutilizado?: boolean;
} & Partial<Record<MetadadoSnapshot, string>>;


/** Extrai apenas os metadados preserváveis (strings não vazias). */
export function extrairMetadadosSnapshot(
  snapshotExistente: unknown,
): Partial<Record<MetadadoSnapshot, string>> {
  const out: Partial<Record<MetadadoSnapshot, string>> = {};
  if (!snapshotExistente || typeof snapshotExistente !== "object") return out;
  const src = snapshotExistente as Record<string, unknown>;
  for (const k of METADADOS_SNAPSHOT_PRESERVADOS) {
    const v = src[k];
    // Metadado inexistente NUNCA é inventado.
    if (typeof v === "string" && v.trim() !== "") out[k] = v;
  }
  return out;
}

/**
 * Monta o snapshot a ser gravado: rascunho sempre substituído pela versão
 * atual da tela, metadados estruturais preservados do snapshot anterior.
 */
export function comporSnapshot<T>(
  snapshotExistente: unknown,
  rascunho: T,
): SnapshotNbi {
  const flag =
    snapshotExistente &&
    typeof snapshotExistente === "object" &&
    (snapshotExistente as Record<string, unknown>)["numero_reutilizado"] === true;
  return {
    ...extrairMetadadosSnapshot(snapshotExistente),
    ...(flag ? { numero_reutilizado: true as const } : {}),
    rascunho,
  };

}
