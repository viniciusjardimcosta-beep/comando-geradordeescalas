// Helpers para comunicação com Asaas (server-only).
// Não importar em código de cliente.

// Normaliza ASAAS_API_VERSION: aceita "v3", "V3", "3", "/v3", vazio → "v3".
function normalizeApiVersion(): string {
  const raw = (process.env.ASAAS_API_VERSION ?? "").trim().replace(/^\/+/, "");
  if (!raw) return "v3";
  const m = raw.match(/^v?(\d+)$/i);
  return m ? `v${m[1]}` : "v3";
}

function detectEnv(key: string): "sandbox" | "production" {
  const envOverride = (process.env.ASAAS_ENV ?? "").trim().toLowerCase();
  if (envOverride === "sandbox") return "sandbox";
  if (envOverride === "production" || envOverride === "prod") return "production";
  if (key.startsWith("$aact_hmlg")) return "sandbox";
  if (key.startsWith("$aact_prod")) return "production";
  // Qualquer outra chave $aact_ → produção por padrão
  return "production";
}

function asaasBaseUrl(): string {
  const key = (process.env.ASAAS_API_KEY ?? "").trim();
  const env = detectEnv(key);
  const host = env === "sandbox" ? "https://api-sandbox.asaas.com" : "https://api.asaas.com";
  return `${host}/${normalizeApiVersion()}`;
}

function authHeaders(): Record<string, string> {
  const key = (process.env.ASAAS_API_KEY ?? "").trim();
  if (!key) throw new Error("ASAAS_API_KEY ausente");
  return {
    "access_token": key,
    "Content-Type": "application/json",
    "User-Agent": "ComandoEscalas/1.0",
  };
}

async function asaasFetch(path: string, init?: RequestInit): Promise<any> {
  const url = `${asaasBaseUrl()}${path}`;
  const method = (init?.method ?? "GET").toUpperCase();
  const res = await fetch(url, { ...init, headers: { ...authHeaders(), ...(init?.headers ?? {}) } });
  const text = await res.text();
  let json: any = {};
  try { json = text ? JSON.parse(text) : {}; } catch { json = { _raw: text }; }
  if (!res.ok) {
    // Log seguro: nunca expõe a API key.
    console.error("[Asaas]", method, url, "status=", res.status, "body=", (text ?? "").slice(0, 500));
    const msg = json?.errors?.[0]?.description ?? json?.message ?? `Asaas ${res.status}`;
    throw new Error(`[Asaas] ${msg}`);
  }
  return json;
}

export interface AsaasCustomer {
  id: string;
  name: string;
  email: string;
  cpfCnpj?: string;
  mobilePhone?: string;
}

export async function findOrCreateAsaasCustomer(input: {
  name: string;
  email: string;
  cpfCnpj?: string | null;
  mobilePhone?: string | null;
  externalReference?: string | null;
}): Promise<AsaasCustomer> {
  // Procurar por email
  const search = await asaasFetch(`/customers?email=${encodeURIComponent(input.email)}&limit=1`);
  const found = Array.isArray(search?.data) ? search.data[0] : null;
  if (found?.id) return found as AsaasCustomer;

  const body: Record<string, unknown> = {
    name: input.name,
    email: input.email,
  };
  if (input.cpfCnpj) body.cpfCnpj = input.cpfCnpj.replace(/\D/g, "");
  if (input.mobilePhone) body.mobilePhone = input.mobilePhone.replace(/\D/g, "");
  if (input.externalReference) body.externalReference = input.externalReference;

  return await asaasFetch(`/customers`, { method: "POST", body: JSON.stringify(body) }) as AsaasCustomer;
}

export interface AsaasSubscription {
  id: string;
  customer: string;
  value: number;
  cycle: string;
  billingType: string;
  status: string;
  nextDueDate: string;
}

export async function createAsaasSubscription(input: {
  customerId: string;
  planType: "mensal" | "anual";
  externalReference: string;
}): Promise<AsaasSubscription> {
  const isAnual = input.planType === "anual";
  const value = isAnual ? 197.0 : 29.9;
  const cycle = isAnual ? "YEARLY" : "MONTHLY";
  const today = new Date();
  today.setDate(today.getDate() + 1); // primeiro vencimento amanhã
  const nextDueDate = today.toISOString().slice(0, 10);

  const body = {
    customer: input.customerId,
    billingType: "UNDEFINED", // cliente escolhe na fatura (boleto/pix/cartão)
    value,
    nextDueDate,
    cycle,
    description: isAnual ? "Comando — Plano Anual" : "Comando — Plano Mensal",
    externalReference: input.externalReference,
  };
  return await asaasFetch(`/subscriptions`, { method: "POST", body: JSON.stringify(body) }) as AsaasSubscription;
}

export async function getFirstSubscriptionPayment(subscriptionId: string): Promise<{
  id: string;
  invoiceUrl?: string;
  bankSlipUrl?: string;
  value?: number;
  dueDate?: string;
} | null> {
  const res = await asaasFetch(`/subscriptions/${encodeURIComponent(subscriptionId)}/payments?limit=1`);
  const p = Array.isArray(res?.data) ? res.data[0] : null;
  return p ?? null;
}
