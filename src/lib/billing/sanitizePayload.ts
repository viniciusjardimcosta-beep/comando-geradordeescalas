// Bloco 13B.4 — sanitização única de payloads de webhook antes de persistir.
//
// Objetivo: nunca gravar credenciais no banco. Tudo que NÃO é credencial
// (ids, status, valores, datas, e-mails de cliente) é preservado — o payload
// continua útil para auditoria e depuração operacional.
//
// Módulo puro: não faz I/O, não loga, não altera o objeto original.

/** Nomes de chave tratados como credencial (comparação sem caixa). */
export const CHAVES_SENSIVEIS = [
  "token",
  "access_token",
  "accesstoken",
  "refresh_token",
  "id_token",
  "secret",
  "client_secret",
  "webhook_secret",
  "webhooksecret",
  "webhook_token",
  "validation_token",
  "authentication_token",
  "authorization",
  "api_key",
  "apikey",
  "x-api-key",
  "password",
  "senha",
  "credentials",
  "private_key",
] as const;

const SENSIVEIS = new Set<string>(CHAVES_SENSIVEIS.map((k) => k.toLowerCase()));

export const REDACTED = "[REDACTED]";

/** true quando o nome da chave representa credencial. */
export function chaveSensivel(key: string): boolean {
  return SENSIVEIS.has(key.trim().toLowerCase());
}

/**
 * Retorna uma CÓPIA do valor com toda chave sensível substituída por
 * "[REDACTED]", inclusive dentro de objetos e arrays aninhados.
 * O valor original nunca é mutado e o conteúdo removido nunca é logado.
 */
export function sanitizarPayload<T>(input: T): T {
  return sanitizar(input) as T;
}

function sanitizar(input: unknown): unknown {
  if (Array.isArray(input)) return input.map(sanitizar);
  if (input && typeof input === "object") {
    if (input instanceof Date) return input;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      out[k] = chaveSensivel(k) ? REDACTED : sanitizar(v);
    }
    return out;
  }
  return input;
}
