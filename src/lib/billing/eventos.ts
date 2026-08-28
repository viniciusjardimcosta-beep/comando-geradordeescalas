// =====================================================================
// BLOCO 13B.2 — Identidade, ordenação e idempotência de eventos de cobrança
// =====================================================================
// Funções puras (sem I/O) que extraem, a partir do payload REAL de cada
// provedor:
//   - dedupeKey       → identidade estável do evento (idempotência)
//   - eventId         → identificador oficial do provedor, quando existir
//   - eventTimestamp  → momento OFICIAL do evento (ordenação)
//   - subjectKey      → assinatura/assunto ao qual o evento se refere
//
// Nenhum campo é inventado: quando o provedor não fornece a informação, o
// valor é null e o fence de ordenação é desativado para aquele evento.
// =====================================================================

export interface ChavesEvento {
  eventType: string;
  eventId: string | null;
  dedupeKey: string | null;
  eventTimestamp: string | null;
  subjectKey: string | null;
}

export type DecisaoEvento = "process" | "duplicate" | "stale";

function str(obj: unknown, key: string): string | null {
  if (!obj || typeof obj !== "object") return null;
  const v = (obj as Record<string, unknown>)[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function obj(o: unknown, key: string): Record<string, unknown> {
  if (!o || typeof o !== "object") return {};
  const v = (o as Record<string, unknown>)[key];
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

function isoOuNull(v: string | null): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// ---------------------------------------------------------------------
// STRIPE
// event.id (evt_...) + event.created (unix seconds, oficial)
// ---------------------------------------------------------------------
export function chavesStripe(event: {
  id?: string;
  type?: string;
  created?: number;
  data?: { object?: unknown };
}): ChavesEvento {
  const eventId = typeof event.id === "string" && event.id.trim() ? event.id.trim() : null;
  const created = typeof event.created === "number" && Number.isFinite(event.created)
    ? new Date(event.created * 1000).toISOString()
    : null;

  const o = event.data?.object ?? {};
  // Assunto: assinatura sempre que disponível; senão o customer.
  const subFromSession = str(o, "subscription");
  const subFromObject =
    str(o, "object") === "subscription" ? str(o, "id") : null;
  const customer = str(o, "customer");
  const subjectKey = subFromObject ?? subFromSession ?? customer ?? null;

  return {
    eventType: typeof event.type === "string" ? event.type : "unknown",
    eventId,
    dedupeKey: eventId,
    eventTimestamp: created,
    subjectKey,
  };
}

// ---------------------------------------------------------------------
// ASAAS
// payload.id (evt_...&seq) + payload.dateCreated ("YYYY-MM-DD HH:MM:SS",
// horário de Brasília, sem offset → normalizado para -03:00)
// ---------------------------------------------------------------------
export function chavesAsaas(payload: unknown): ChavesEvento {
  const eventId = str(payload, "id");
  const eventType = str(payload, "event") ?? "unknown";
  const payment = obj(payload, "payment");
  const subscription = obj(payload, "subscription");

  const bruto = str(payload, "dateCreated");
  let ts: string | null = null;
  if (bruto) {
    const normalizado = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(bruto)
      ? `${bruto.replace(" ", "T")}-03:00`
      : bruto;
    ts = isoOuNull(normalizado);
  }

  const subjectKey =
    str(payment, "subscription") ??
    str(subscription, "id") ??
    str(payment, "id") ??
    null;

  return { eventType, eventId, dedupeKey: eventId, eventTimestamp: ts, subjectKey };
}

// ---------------------------------------------------------------------
// NEXANO
// Não há event_id nem timestamp no nível raiz do payload real.
// Identidade estável derivada: "<event>:<transaction.identifier|
//   transaction.id|subscription.identifier>".
// Ordenação: transaction.payedAt → transaction.createdAt →
//   subscription.updatedAt → subscription.startAt. Se nenhum existir,
//   eventTimestamp = null e o evento NÃO é fenceado por ordem.
// ---------------------------------------------------------------------
export function chavesNexano(payload: unknown): ChavesEvento {
  const eventType = str(payload, "event") ?? "unknown";
  const transaction = obj(payload, "transaction");
  const subscription = obj(payload, "subscription");
  const client = obj(payload, "client");

  const idBase =
    str(transaction, "identifier") ??
    str(transaction, "id") ??
    str(subscription, "identifier") ??
    null;

  const eventId = str(payload, "event_id") ?? idBase;
  const dedupeKey = idBase ? `${eventType}:${idBase}` : null;

  const ts =
    isoOuNull(str(transaction, "payedAt")) ??
    isoOuNull(str(transaction, "createdAt")) ??
    isoOuNull(str(subscription, "updatedAt")) ??
    isoOuNull(str(subscription, "startAt"));

  const subjectKey =
    str(subscription, "identifier") ??
    (str(client, "email") ? str(client, "email")!.toLowerCase() : null);

  return { eventType, eventId, dedupeKey, eventTimestamp: ts, subjectKey };
}

// ---------------------------------------------------------------------
// Claim atômico (delegado ao RPC billing_claim_event)
// ---------------------------------------------------------------------
export interface ClaimArgs extends ChavesEvento {
  provider: "stripe" | "asaas" | "nexano";
  externalId?: string | null;
  customerEmail?: string | null;
  sourceIp?: string | null;
  headers?: Record<string, unknown>;
  payload?: unknown;
}

export interface ClaimResultado {
  eventRowId: string | null;
  decision: DecisaoEvento;
}

interface RpcClient {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{
    data: unknown;
    error: { message: string } | null;
  }>;
}

export async function claimBillingEvent(
  client: RpcClient,
  a: ClaimArgs,
): Promise<ClaimResultado> {
  const { data, error } = await client.rpc("billing_claim_event", {
    _provider: a.provider,
    _dedupe_key: a.dedupeKey,
    _event_id: a.eventId,
    _event_type: a.eventType,
    _event_timestamp: a.eventTimestamp,
    _subject_key: a.subjectKey,
    _external_id: a.externalId ?? null,
    _customer_email: a.customerEmail ?? null,
    _source_ip: a.sourceIp ?? null,
    _headers: a.headers ?? {},
    _payload: a.payload ?? {},
  });

  if (error) throw new Error(`billing_claim_event: ${error.message}`);

  const row = Array.isArray(data) ? (data[0] as Record<string, unknown> | undefined) : (data as Record<string, unknown> | null);
  const decision = typeof row?.decision === "string" ? row.decision : null;
  if (decision !== "process" && decision !== "duplicate" && decision !== "stale") {
    throw new Error("billing_claim_event: decisao invalida");
  }
  return {
    eventRowId: typeof row?.event_row_id === "string" ? row.event_row_id : null,
    decision,
  };
}
