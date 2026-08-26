import { describe, it, expect, vi } from "vitest";
import {
  finalizarSenhaTemporaria,
  type RpcClientMinimo,
} from "../finalizarSenhaTemporaria";

const UID_A = "11111111-1111-1111-1111-111111111111";
const UID_B = "22222222-2222-2222-2222-222222222222";

/** Banco fake que replica a superfície mínima da RPC SECURITY DEFINER. */
function fakeBanco(opts: {
  uid: string | null;
  perfis: Record<string, Record<string, unknown>>;
}) {
  const chamadas: unknown[][] = [];
  const client = {
    rpc: async (...args: unknown[]) => {
      chamadas.push(args);
      if (opts.uid === null) {
        return { data: null, error: { message: "Não autenticado" } };
      }
      const perfil = opts.perfis[opts.uid];
      if (!perfil) return { data: null, error: { message: "Perfil não encontrado" } };
      // A RPC só pode escrever nesta coluna, e só do próprio uid.
      perfil.password_temporary = false;
      return {
        data: [{ id: opts.uid, password_temporary: perfil.password_temporary }],
        error: null,
      };
    },
  };
  return { client: client as unknown as RpcClientMinimo, chamadas };
}

function perfilPadrao(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    password_temporary: true,
    status: "aprovado",
    subscription_status: "trial",
    plan_type: "trial",
    complimentary_access: false,
    ambiente_homologacao: false,
    trial_end_date: "2026-01-01T00:00:00Z",
    ...extra,
  };
}

describe("BLOCO 13B.1 — finalizarSenhaTemporaria", () => {
  it("A. usuário autenticado com password_temporary=true → passa a false", async () => {
    const perfis = { [UID_A]: perfilPadrao() };
    const { client } = fakeBanco({ uid: UID_A, perfis });
    const res = await finalizarSenhaTemporaria(client);
    expect(res).toEqual({ ok: true, passwordTemporary: false });
    expect(perfis[UID_A].password_temporary).toBe(false);
  });

  it("B. segunda chamada é idempotente e não falha", async () => {
    const perfis = { [UID_A]: perfilPadrao() };
    const { client } = fakeBanco({ uid: UID_A, perfis });
    await finalizarSenhaTemporaria(client);
    const res2 = await finalizarSenhaTemporaria(client);
    expect(res2.ok).toBe(true);
    expect(perfis[UID_A].password_temporary).toBe(false);
  });

  it("C. usuário não autenticado é rejeitado", async () => {
    const perfis = { [UID_A]: perfilPadrao() };
    const { client } = fakeBanco({ uid: null, perfis });
    const res = await finalizarSenhaTemporaria(client);
    expect(res.ok).toBe(false);
    expect(perfis[UID_A].password_temporary).toBe(true);
  });

  it("D. usuário A não altera o perfil de B", async () => {
    const perfis = { [UID_A]: perfilPadrao(), [UID_B]: perfilPadrao() };
    const { client } = fakeBanco({ uid: UID_A, perfis });
    await finalizarSenhaTemporaria(client);
    expect(perfis[UID_A].password_temporary).toBe(false);
    expect(perfis[UID_B].password_temporary).toBe(true);
  });

  it("E. a RPC é chamada sem nenhum parâmetro de identidade", async () => {
    const { client, chamadas } = fakeBanco({ uid: UID_A, perfis: { [UID_A]: perfilPadrao() } });
    await finalizarSenhaTemporaria(client);
    expect(chamadas[0][0]).toBe("finalizar_senha_temporaria");
    expect(chamadas[0].length).toBe(1);
  });

  it("F. nenhuma coluna administrativa é alterada", async () => {
    const antes = perfilPadrao();
    const perfis = { [UID_A]: { ...antes } };
    const { client } = fakeBanco({ uid: UID_A, perfis });
    await finalizarSenhaTemporaria(client);
    const depois = perfis[UID_A] as Record<string, unknown>;
    for (const chave of Object.keys(antes)) {
      if (chave === "password_temporary") continue;
      expect(depois[chave]).toEqual(antes[chave]);
    }
  });

  it("G. erro da RPC não gera sucesso (falso sucesso eliminado)", async () => {
    const client: RpcClientMinimo = {
      rpc: async () => ({ data: null, error: { message: "permission denied" } }),
    };
    const res = await finalizarSenhaTemporaria(client);
    expect(res.ok).toBe(false);
  });

  it("G2. RPC sem erro mas password_temporary ainda true → não é sucesso", async () => {
    const client: RpcClientMinimo = {
      rpc: async () => ({ data: [{ id: UID_A, password_temporary: true }], error: null }),
    };
    const res = await finalizarSenhaTemporaria(client);
    expect(res.ok).toBe(false);
  });

  it("G3. retorno vazio da RPC não é tratado como sucesso", async () => {
    const client: RpcClientMinimo = { rpc: async () => ({ data: [], error: null }) };
    const res = await finalizarSenhaTemporaria(client);
    expect(res.ok).toBe(false);
  });

  it("aceita retorno em objeto único (não-array)", async () => {
    const rpc = vi.fn(async () => ({ data: { id: UID_A, password_temporary: false }, error: null }));
    const res = await finalizarSenhaTemporaria({ rpc } as unknown as RpcClientMinimo);
    expect(res.ok).toBe(true);
  });
});
