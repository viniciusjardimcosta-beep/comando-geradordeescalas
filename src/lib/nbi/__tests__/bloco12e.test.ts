// Bloco 12E — prova do fluxo de geração: persistir sempre antes de reservar.
import { describe, expect, it, vi } from "vitest";
import {
  executarGeracaoNbi, MSG_FALHA_PERSISTENCIA, MSG_FALHA_INESPERADA,
} from "@/lib/nbi/geracaoFluxo";

const trava = () => ({ current: false });

describe("Bloco 12E — fluxo de geração", () => {
  it("persiste antes de gerar", async () => {
    const ordem: string[] = [];
    const r = await executarGeracaoNbi({
      trava: trava(),
      documentoId: "d1",
      persistir: async () => { ordem.push("persistir"); return { ok: true, documentoId: "d1" }; },
      gerar: async () => { ordem.push("gerar"); return { ok: true, numero: 3, ano: 2026 }; },
    });
    expect(ordem).toEqual(["persistir", "gerar"]);
    expect(r).toEqual({ estado: "sucesso", numero: 3, ano: 2026 });
  });

  it("não reserva número quando a persistência falha", async () => {
    const gerar = vi.fn();
    const r = await executarGeracaoNbi({
      trava: trava(),
      documentoId: "d1",
      persistir: async () => ({ ok: false, documentoId: "d1", erro: "x" }),
      gerar,
    });
    expect(gerar).not.toHaveBeenCalled();
    expect(r).toEqual({ estado: "erro", etapa: "persistencia", mensagem: MSG_FALHA_PERSISTENCIA });
  });

  it("usa o id recém-criado quando o rascunho ainda não existia", async () => {
    const gerar = vi.fn(async () => ({ ok: true, numero: 1, ano: 2026 }));
    await executarGeracaoNbi({
      trava: trava(),
      documentoId: null,
      persistir: async () => ({ ok: true, documentoId: "novo" }),
      gerar,
    });
    expect(gerar).toHaveBeenCalledWith("novo");
  });

  it("propaga o código de erro do backend", async () => {
    const r = await executarGeracaoNbi({
      trava: trava(),
      documentoId: "d1",
      persistir: async () => ({ ok: true, documentoId: "d1" }),
      gerar: async () => ({ ok: false, code: "campos_obrigatorios" }),
    });
    expect(r).toEqual({ estado: "erro", etapa: "geracao", mensagem: "campos_obrigatorios" });
  });

  it("converte exceção em mensagem orientada ao operador", async () => {
    const r = await executarGeracaoNbi({
      trava: trava(),
      documentoId: "d1",
      persistir: async () => ({ ok: true, documentoId: "d1" }),
      gerar: async () => { throw new Error("stack interna"); },
    });
    expect(r).toEqual({ estado: "erro", etapa: "excecao", mensagem: MSG_FALHA_INESPERADA });
  });

  it("duplo clique não gera dois documentos", async () => {
    const t = trava();
    const gerar = vi.fn(async () => ({ ok: true, numero: 9, ano: 2026 }));
    const deps = {
      trava: t,
      documentoId: "d1",
      persistir: async () => new Promise<{ ok: boolean; documentoId: string }>((res) =>
        setTimeout(() => res({ ok: true, documentoId: "d1" }), 10)),
      gerar,
    };
    const [a, b] = await Promise.all([executarGeracaoNbi(deps), executarGeracaoNbi(deps)]);
    expect(gerar).toHaveBeenCalledTimes(1);
    expect([a.estado, b.estado].filter((e) => e === "ignorado")).toHaveLength(1);
  });

  it("libera a trava após concluir, permitindo nova tentativa", async () => {
    const t = trava();
    const deps = {
      trava: t,
      documentoId: "d1",
      persistir: async () => ({ ok: true, documentoId: "d1" }),
      gerar: async () => ({ ok: true, numero: 2, ano: 2026 }),
    };
    await executarGeracaoNbi(deps);
    expect(t.current).toBe(false);
    const r = await executarGeracaoNbi(deps);
    expect(r.estado).toBe("sucesso");
  });

  it("usa o ano do documento como padrão quando o backend não devolve ano", async () => {
    const r = await executarGeracaoNbi({
      trava: trava(),
      documentoId: "d1",
      anoPadrao: 2031,
      persistir: async () => ({ ok: true, documentoId: "d1" }),
      gerar: async () => ({ ok: true, numero: 5, ano: null }),
    });
    expect(r).toMatchObject({ estado: "sucesso", ano: 2031 });
  });
});
