// =====================================================================
// BLOCO 14B.1 — PERF-02: projeção da listagem administrativa de eventos
// =====================================================================
// A tabela administrativa de billing_events passa a buscar apenas as
// colunas exibidas. Os JSONB pesados (payload, headers) e o source_ip são
// buscados sob demanda, apenas quando o administrador abre um evento.
// Nada de webhook, sanitização ou RLS é alterado — é somente projeção.
// =====================================================================

export const BILLING_EVENT_LIST_COLUMNS =
  "id, provider, event_type, status, customer_email, external_id, error_message, created_at, processed_at";

export const BILLING_EVENT_DETALHE_COLUMNS = "id, source_ip, headers, payload";

export interface BillingEventDetalhe {
  id: string;
  source_ip: string | null;
  headers: Record<string, unknown>;
  payload: Record<string, unknown>;
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

export async function buscarDetalheBillingEvent(
  client: DetalheClient,
  id: string,
): Promise<BillingEventDetalhe> {
  const { data, error } = await client
    .from("billing_events")
    .select(BILLING_EVENT_DETALHE_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Evento não encontrado.");

  const row = data as Record<string, unknown>;
  const asObj = (v: unknown): Record<string, unknown> =>
    v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

  return {
    id: String(row.id ?? id),
    source_ip: typeof row.source_ip === "string" ? row.source_ip : null,
    headers: asObj(row.headers),
    payload: asObj(row.payload),
  };
}
