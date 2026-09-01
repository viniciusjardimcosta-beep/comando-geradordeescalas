// Bloco 13B.3 — limpeza best-effort de objetos órfãos no storage.
//
// Regra institucional: quando o upload conclui mas a etapa seguinte
// (registro no banco / finalização do documento) falha, o objeto recém-criado
// vira lixo. Ele deve ser removido — mas SOMENTE ele, pelo path exato daquela
// execução, e a falha da limpeza JAMAIS substitui o erro original.
//
// Módulo puro: recebe a função de remoção por injeção; não conhece Supabase.

export type ResultadoCleanup =
  | { estado: "removido"; bucket: string; path: string }
  | { estado: "cleanup_failed"; bucket: string; path: string; erro: string }
  | { estado: "ignorado" };

export type RemoverObjetos = (
  bucket: string,
  paths: string[],
) => Promise<{ error?: { message?: string } | null } | void>;

/** Remove segredos/URLs assinadas de uma mensagem técnica antes de logar. */
export function sanitizarErroStorage(erro: unknown): string {
  const bruto =
    erro instanceof Error ? erro.message : typeof erro === "string" ? erro : "";
  return bruto
    .replace(/https?:\/\/\S+/gi, "[url]")
    .replace(/(token|apikey|api_key|signature|authorization)=[^&\s]+/gi, "$1=[redigido]")
    .replace(/eyJ[A-Za-z0-9_.-]{10,}/g, "[token]")
    .slice(0, 300)
    .trim();
}

/**
 * Best-effort: tenta remover exatamente o objeto criado pela operação que
 * falhou. Nunca lança. Nunca faz mais de uma tentativa (não entra em loop).
 */
export async function removerObjetoOrfao(params: {
  bucket: string;
  /** Path EXATO gerado nesta execução. Nada de prefixo/pasta. */
  path: string | null | undefined;
  /** Nome da operação, apenas para o log técnico. */
  operacao: string;
  remove: RemoverObjetos;
  log?: (evento: string, detalhe: Record<string, unknown>) => void;
}): Promise<ResultadoCleanup> {
  const { bucket, path, operacao, remove } = params;
  const log = params.log ?? ((e, d) => console.error(e, d));
  if (!path || !bucket || path.endsWith("/")) return { estado: "ignorado" };
  try {
    const r = await remove(bucket, [path]);
    const erro = r && typeof r === "object" && "error" in r ? r.error : null;
    if (erro) {
      const msg = sanitizarErroStorage(erro.message ?? "");
      log("cleanup_failed", { operacao, bucket, path, erro: msg });
      return { estado: "cleanup_failed", bucket, path, erro: msg };
    }
    return { estado: "removido", bucket, path };
  } catch (e) {
    const msg = sanitizarErroStorage(e);
    log("cleanup_failed", { operacao, bucket, path, erro: msg });
    return { estado: "cleanup_failed", bucket, path, erro: msg };
  }
}
