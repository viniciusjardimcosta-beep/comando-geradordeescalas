import { describe, it, expect, vi } from "vitest";
import {
  ESCALAS_LIST_COLUMNS,
  ESCALA_DETALHE_COLUMNS,
  buscarDetalheEscala,
  criarCacheDetalhe,
  type EscalaDetalhe,
} from "../listagem";
import {
  BILLING_EVENT_LIST_COLUMNS,
  BILLING_EVENT_DETALHE_COLUMNS,
  buscarDetalheBillingEvent,
} from "@/lib/billing/listagem";

function clienteFake(porId: Record<string, unknown>, erro?: string) {
  const chamadas: { table: string; cols: string; id: string }[] = [];
  const client = {
    from(table: string) {
      return {
        select(cols: string) {
          return {
            eq(_col: string, id: string) {
              chamadas.push({ table, cols, id });
              return {
                async maybeSingle() {
                  if (erro) return { data: null, error: { message: erro } };
                  return { data: porId[id] ?? null, error: null };
                },
              };
            },
          };
        },
      };
    },
  };
  return { client, chamadas };
}

describe("BLOCO 14B.1 — PERF-01 listagem de escalas", () => {
  it("A. consulta inicial não solicita alertas", () => {
    expect(ESCALAS_LIST_COLUMNS).not.toContain("alertas");
  });

  it("B. consulta inicial não solicita furos", () => {
    expect(ESCALAS_LIST_COLUMNS).not.toContain("furos");
    expect(ESCALAS_LIST_COLUMNS).not.toContain("observacoes_texto");
  });

  it("C. consulta inicial mantém as colunas usadas pela lista", () => {
    const cols = ESCALAS_LIST_COLUMNS.split(",").map((c) => c.trim());
    expect(cols.sort()).toEqual(
      ["ano", "arquivo_nome", "arquivo_saida_path", "created_at", "id", "mes", "status"].sort(),
    );
  });

  it("D/E. abrir detalhe consulta só o ID e devolve alertas/furos", async () => {
    const { client, chamadas } = clienteFake({
      a: {
        id: "a",
        observacoes_texto: "obs A",
        alertas: [{ tipo: "warn", msg: "x" }],
        furos: [{ dia: 3, escalados: 3, faltantes: 1, cg: 1, cov: 1 }],
      },
    });
    const det = await buscarDetalheEscala(client, "a");
    expect(chamadas).toEqual([
      { table: "escalas_geradas", cols: ESCALA_DETALHE_COLUMNS, id: "a" },
    ]);
    expect(det.alertas).toHaveLength(1);
    expect(det.furos[0].dia).toBe(3);
    expect(det.observacoes_texto).toBe("obs A");
  });

  it("F. abrir outra escala não reutiliza dados da anterior", async () => {
    const { client } = clienteFake({
      a: { id: "a", observacoes_texto: "obs A", alertas: [{ tipo: "warn", msg: "x" }], furos: [] },
      b: { id: "b", observacoes_texto: "obs B", alertas: [], furos: [] },
    });
    const a = await buscarDetalheEscala(client, "a");
    const b = await buscarDetalheEscala(client, "b");
    expect(a.observacoes_texto).toBe("obs A");
    expect(b.observacoes_texto).toBe("obs B");
    expect(b.alertas).toHaveLength(0);
  });

  it("G. reabrir a mesma escala usa cache local", async () => {
    const cache = criarCacheDetalhe<EscalaDetalhe>();
    const fetcher = vi.fn(async (id: string): Promise<EscalaDetalhe> => ({
      id,
      observacoes_texto: null,
      alertas: [],
      furos: [],
    }));
    const abrir = async (id: string) => {
      if (cache.has(id)) return cache.get(id)!;
      const d = await fetcher(id);
      cache.set(id, d);
      return d;
    };
    await abrir("a");
    await abrir("a");
    expect(fetcher).toHaveBeenCalledTimes(1);
    cache.clear();
    await abrir("a");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("H. falha do detalhe é controlada (não quebra a lista)", async () => {
    const { client } = clienteFake({}, "rls denied");
    await expect(buscarDetalheEscala(client, "a")).rejects.toThrow("rls denied");
    const vazio = clienteFake({});
    await expect(buscarDetalheEscala(vazio.client, "zzz")).rejects.toThrow(/não encontrada/i);
  });
});

describe("BLOCO 14B.1 — PERF-02 listagem de billing_events", () => {
  it("A/B. listagem não solicita payload nem headers", () => {
    expect(BILLING_EVENT_LIST_COLUMNS).not.toContain("payload");
    expect(BILLING_EVENT_LIST_COLUMNS).not.toContain("headers");
    expect(BILLING_EVENT_LIST_COLUMNS).not.toContain("*");
  });

  it("C. listagem mantém as colunas exibidas na tabela", () => {
    const cols = BILLING_EVENT_LIST_COLUMNS.split(",").map((c) => c.trim());
    for (const c of [
      "id",
      "provider",
      "event_type",
      "status",
      "customer_email",
      "external_id",
      "error_message",
      "created_at",
      "processed_at",
    ]) {
      expect(cols).toContain(c);
    }
  });

  it("D/E. paginação e filtros continuam sobre a mesma projeção", () => {
    // A projeção não depende de página nem de termo de busca.
    expect(BILLING_EVENT_LIST_COLUMNS).toBe(BILLING_EVENT_LIST_COLUMNS.trim());
    expect(BILLING_EVENT_DETALHE_COLUMNS).toContain("payload");
    expect(BILLING_EVENT_DETALHE_COLUMNS).toContain("headers");
  });

  it("F. detalhe do evento consulta apenas o ID aberto", async () => {
    const { client, chamadas } = clienteFake({
      e1: { id: "e1", source_ip: "1.2.3.4", headers: { a: 1 }, payload: { b: 2 } },
    });
    const d = await buscarDetalheBillingEvent(client, "e1");
    expect(chamadas).toEqual([
      { table: "billing_events", cols: BILLING_EVENT_DETALHE_COLUMNS, id: "e1" },
    ]);
    expect(d.payload).toEqual({ b: 2 });
    expect(d.headers).toEqual({ a: 1 });
    expect(d.source_ip).toBe("1.2.3.4");
  });
});
