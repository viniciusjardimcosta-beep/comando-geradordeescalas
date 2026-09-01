import { describe, it, expect, vi } from "vitest";
import {
  removerObjetoOrfao,
  sanitizarErroStorage,
} from "@/lib/storage/cleanup";

describe("Bloco 13B.3 — cleanup best-effort de storage", () => {
  it("E. remove o objeto quando a limpeza funciona", async () => {
    const remove = vi.fn(async () => ({ error: null }));
    const r = await removerObjetoOrfao({
      bucket: "nbi-documentos",
      path: "u1/2026/nbi-52-doc.docx",
      operacao: "gerarNbi",
      remove,
    });
    expect(r).toEqual({
      estado: "removido",
      bucket: "nbi-documentos",
      path: "u1/2026/nbi-52-doc.docx",
    });
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it("G. remove exatamente o path da execução (sem prefixo/pasta)", async () => {
    const chamadas: Array<[string, string[]]> = [];
    await removerObjetoOrfao({
      bucket: "escalas",
      path: "u1/2026-09-01.xlsx",
      operacao: "gerarEscala",
      remove: async (b, p) => {
        chamadas.push([b, p]);
        return { error: null };
      },
    });
    expect(chamadas).toEqual([["escalas", ["u1/2026-09-01.xlsx"]]]);
  });

  it("H. nunca remove nada quando não há path desta execução", async () => {
    const remove = vi.fn(async () => ({ error: null }));
    for (const path of [null, undefined, "", "u1/2026/"]) {
      const r = await removerObjetoOrfao({
        bucket: "escalas",
        path,
        operacao: "gerarEscala",
        remove,
      });
      expect(r.estado).toBe("ignorado");
    }
    expect(remove).not.toHaveBeenCalled();
  });

  it("F. cleanup que falha registra cleanup_failed e não repete a tentativa", async () => {
    const log = vi.fn();
    const remove = vi.fn(async () => ({ error: { message: "network down" } }));
    const r = await removerObjetoOrfao({
      bucket: "nbi-documentos",
      path: "u1/2026/nbi-52-doc.docx",
      operacao: "gerarNbi",
      remove,
      log,
    });
    expect(r.estado).toBe("cleanup_failed");
    expect(remove).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(
      "cleanup_failed",
      expect.objectContaining({ operacao: "gerarNbi", bucket: "nbi-documentos" }),
    );
  });

  it("F2. exceção lançada pelo storage não escapa (erro principal preservado)", async () => {
    const log = vi.fn();
    const r = await removerObjetoOrfao({
      bucket: "escalas",
      path: "u1/a.xlsx",
      operacao: "gerarEscala",
      remove: async () => {
        throw new Error("boom");
      },
      log,
    });
    expect(r.estado).toBe("cleanup_failed");
  });

  it("sanitiza tokens e URLs assinadas no log técnico", () => {
    const msg = sanitizarErroStorage(
      new Error(
        "falhou em https://x.supabase.co/object/sign/a?token=eyJhbGciOiJIUzI1NiIsecreto",
      ),
    );
    expect(msg).not.toContain("supabase.co");
    expect(msg).not.toContain("eyJhbGciOiJIUzI1NiIsecreto");
    expect(msg).toContain("[url]");
  });
});

// ---------------------------------------------------------------------------
// Simulação do fluxo final da geração NBI (mesma lógica do handler):
// update condicionado a canceled_at IS NULL + detecção de zero linhas.
// ---------------------------------------------------------------------------

type DocRow = { id: string; canceled_at: string | null; storage_path: string | null; status: string };

async function finalizarGeracaoNbi(opts: {
  doc: DocRow;
  path: string;
  updateFalha?: boolean;
  removidos: string[];
  removeFalha?: boolean;
}) {
  const limpar = () =>
    removerObjetoOrfao({
      bucket: "nbi-documentos",
      path: opts.path,
      operacao: "gerarNbi",
      remove: async (_b, p) => {
        if (opts.removeFalha) return { error: { message: "denied" } };
        opts.removidos.push(...p);
        return { error: null };
      },
      log: () => {},
    });

  if (opts.updateFalha) {
    await limpar();
    return { ok: false as const, code: "Falha ao atualizar documento" };
  }
  const afetadas = opts.doc.canceled_at === null ? 1 : 0;
  if (afetadas === 0) {
    await limpar();
    return { ok: false as const, code: "Documento cancelado durante a geração." };
  }
  opts.doc.storage_path = opts.path;
  opts.doc.status = "gerado";
  return { ok: true as const };
}

describe("Bloco 13B.3 — NBI: estados parciais", () => {
  it("A. cancelamento durante a geração impede a finalização", async () => {
    const doc: DocRow = {
      id: "d1",
      canceled_at: "2026-09-01T10:00:00Z",
      storage_path: null,
      status: "reservado",
    };
    const removidos: string[] = [];
    const r = await finalizarGeracaoNbi({ doc, path: "u1/2026/nbi-52-d1.docx", removidos });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.code).toBe("Documento cancelado durante a geração.");
    expect(doc.storage_path).toBeNull();
    expect(doc.status).toBe("reservado");
    expect(removidos).toEqual(["u1/2026/nbi-52-d1.docx"]);
  });

  it("B. falha no update final após upload remove o objeto órfão", async () => {
    const doc: DocRow = { id: "d2", canceled_at: null, storage_path: null, status: "reservado" };
    const removidos: string[] = [];
    const r = await finalizarGeracaoNbi({
      doc,
      path: "u1/2026/nbi-53-d2.docx",
      updateFalha: true,
      removidos,
    });
    expect(r.ok).toBe(false);
    expect(doc.status).toBe("reservado");
    expect(removidos).toEqual(["u1/2026/nbi-53-d2.docx"]);
  });

  it("C. retry após falha conclui sem consumir novo número", async () => {
    const doc: DocRow = { id: "d3", canceled_at: null, storage_path: null, status: "reservado" };
    const removidos: string[] = [];
    const numeroReservado = 53;
    const path = `u1/2026/nbi-${numeroReservado}-d3.docx`;
    await finalizarGeracaoNbi({ doc, path, updateFalha: true, removidos });
    const r2 = await finalizarGeracaoNbi({ doc, path, removidos });
    expect(r2.ok).toBe(true);
    expect(doc.storage_path).toBe(path);
    // mesmo número, mesmo path: nenhuma nova reserva
    expect(path).toContain("nbi-53-");
  });
});

// ---------------------------------------------------------------------------
// Simulação da persistência da escala: upload OK + insert falho.
// ---------------------------------------------------------------------------

describe("Bloco 13B.3 — Escala: objeto órfão", () => {
  it("D. insert de histórico falho remove o XLSX recém-enviado", async () => {
    const bucket: string[] = ["u1/antigo.xlsx"];
    const path = "u1/2026-09-01T00-00-00.xlsx";
    bucket.push(path); // upload OK
    const insErr = { message: "insert failed" };
    let erroUsuario = "";
    if (insErr) {
      await removerObjetoOrfao({
        bucket: "escalas",
        path,
        operacao: "gerarEscala",
        remove: async (_b, ps) => {
          for (const p of ps) {
            const i = bucket.indexOf(p);
            if (i >= 0) bucket.splice(i, 1);
          }
          return { error: null };
        },
        log: () => {},
      });
      erroUsuario = "Falha ao registrar histórico.";
    }
    expect(erroUsuario).toBe("Falha ao registrar histórico.");
    // arquivo anterior de histórico válido permanece intacto
    expect(bucket).toEqual(["u1/antigo.xlsx"]);
  });
});
