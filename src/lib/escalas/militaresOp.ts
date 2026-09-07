// =====================================================================
// BLOCO 14B.2 — PERF-03: orquestração paralela das consultas de /app/importar
// =====================================================================
// Helper de domínio para a lista de militares operacionais usada na seleção
// da virada de mês. Projeção explícita (sem select("*")), regra de filtro
// idêntica à anterior: não-ADM e escala 24h.
// =====================================================================

export const MILITARES_OP_COLUMNS =
  "id, nome, matricula, is_cg, is_cov, is_adm, tipo_escala, ativo";

export interface MilitarOp {
  id: string;
  nome: string;
  matricula: string | null;
  is_cg: boolean;
  is_cov: boolean;
}

interface MilitarOpRow {
  id: string;
  nome: string;
  matricula: string | null;
  is_cg?: boolean | null;
  is_cov?: boolean | null;
  is_adm?: boolean | null;
  tipo_escala?: string | null;
  ativo?: boolean | null;
}

/** Filtra/normaliza/ordena os militares operacionais (regra inalterada). */
export function mapMilitaresOp(rows: MilitarOpRow[] | null | undefined): MilitarOp[] {
  return (rows ?? [])
    .filter((m) => !m.is_adm && (m.tipo_escala ?? "24h") === "24h")
    .map((m) => ({
      id: m.id,
      nome: m.nome,
      matricula: m.matricula,
      is_cg: !!m.is_cg,
      is_cov: !!m.is_cov,
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome));
}
