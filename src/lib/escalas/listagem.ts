// =====================================================================
// BLOCO 14B.1 — PERF-01: separação LISTA x DETALHE das escalas geradas
// =====================================================================
// A listagem inicial (/app/importar) carrega apenas as colunas realmente
// usadas para renderizar cada item. Campos pesados (alertas, furos,
// observacoes_texto) são buscados sob demanda, apenas para a escala que o
// usuário abrir. A segurança continua sendo do RLS (nenhum service_role,
// nenhuma RPC nova).
// =====================================================================

/** Colunas mínimas reais usadas pela lista do histórico. */
export const ESCALAS_LIST_COLUMNS =
  "id, mes, ano, arquivo_nome, arquivo_saida_path, status, created_at";

/** Colunas pesadas, buscadas apenas quando o detalhe é aberto. */
export const ESCALA_DETALHE_COLUMNS = "id, observacoes_texto, alertas, furos";

export interface AlertaEscala {
  tipo: string;
  msg: string;
}

export interface FuroEscala {
  dia: number;
  escalados: number;
  faltantes: number;
  cg: number;
  cov: number;
}

export interface EscalaDetalhe {
  id: string;
  observacoes_texto: string | null;
  alertas: AlertaEscala[];
  furos: FuroEscala[];
}

interface MaybeSingle {
  maybeSingle: () => Promise<{ data: unknown; error: { message: string } | null }>;
}
interface Eq {
  eq: (col: string, val: string) => MaybeSingle;
}
interface Sel {
  select: (cols: string) => Eq;
}
export interface DetalheClient {
  from: (table: string) => Sel;
}

export async function buscarDetalheEscala(
  client: DetalheClient,
  id: string,
): Promise<EscalaDetalhe> {
  const { data, error } = await client
    .from("escalas_geradas")
    .select(ESCALA_DETALHE_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Escala não encontrada.");

  const row = data as Record<string, unknown>;
  return {
    id: String(row.id ?? id),
    observacoes_texto:
      typeof row.observacoes_texto === "string" ? row.observacoes_texto : null,
    alertas: Array.isArray(row.alertas) ? (row.alertas as AlertaEscala[]) : [],
    furos: Array.isArray(row.furos) ? (row.furos as FuroEscala[]) : [],
  };
}

/** Cache local simples, com ciclo de vida limitado à tela. */
export function criarCacheDetalhe<T>() {
  const mapa = new Map<string, T>();
  return {
    get: (id: string) => mapa.get(id),
    has: (id: string) => mapa.has(id),
    set: (id: string, valor: T) => {
      mapa.set(id, valor);
    },
    delete: (id: string) => {
      mapa.delete(id);
    },
    clear: () => mapa.clear(),
    get size() {
      return mapa.size;
    },
  };
}
