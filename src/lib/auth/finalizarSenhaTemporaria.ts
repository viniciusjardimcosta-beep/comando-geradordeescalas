// BLOCO 13B.1 — conclusão da troca de senha temporária.
// Superfície mínima: chama a RPC `finalizar_senha_temporaria()` (SECURITY DEFINER),
// que altera SOMENTE profiles.password_temporary do próprio auth.uid().
// A RPC não recebe user_id como parâmetro. Nenhum campo administrativo é tocado.

export type FinalizarSenhaTemporariaResultado =
  | { ok: true; passwordTemporary: false }
  | { ok: false; erro: string };

type RpcRow = { id: string; password_temporary: boolean };

export interface RpcClientMinimo {
  rpc: (
    fn: "finalizar_senha_temporaria",
    args?: Record<string, never>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
}

/**
 * Confirma no banco que a senha temporária foi concluída.
 * Nunca retorna sucesso sem que o banco tenha devolvido password_temporary = false.
 * Idempotente: chamada repetida continua devolvendo ok.
 */
export async function finalizarSenhaTemporaria(
  client: RpcClientMinimo,
): Promise<FinalizarSenhaTemporariaResultado> {
  const { data, error } = await client.rpc("finalizar_senha_temporaria");

  if (error) {
    return { ok: false, erro: error.message };
  }

  const linhas = (Array.isArray(data) ? data : data ? [data] : []) as RpcRow[];
  const linha = linhas[0];

  if (!linha) {
    return { ok: false, erro: "Não foi possível confirmar a conclusão da senha temporária." };
  }
  if (linha.password_temporary !== false) {
    return { ok: false, erro: "A senha temporária continua pendente no servidor." };
  }

  return { ok: true, passwordTemporary: false };
}
