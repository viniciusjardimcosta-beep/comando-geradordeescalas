// Achados 1, 2 e 3 — correções operacionais autorizadas.
import { describe, it, expect } from "vitest";
import { severidadeConflito } from "@/lib/nbi/consistencia/matriz";
import { regrasConflitoAfastamento, regrasRedundancia } from "@/lib/nbi/consistencia/regras";
import type { BaseConsistencia, EntradaConsistencia } from "@/lib/nbi/consistencia/tipos";

const base = (over: Partial<BaseConsistencia> = {}): BaseConsistencia => ({
  documentos: [], ferias: [], substituicoes: [], militares: [], hoje: "2026-08-24", ...over,
});

const M = "mil-1";

const entrada = (over: Partial<EntradaConsistencia>): EntradaConsistencia => ({
  militarId: M,
  tipoAssunto: "servico_extraordinario",
  campos: {},
  dataDocumento: "2026-09-01",
  base: base(),
  ...over,
});

const feriasAgosto = [{ id: "f1", militar_id: M, ano: 2026, periodo: 1, data_inicio: "2026-08-17", data_fim: "2026-08-31" }];

describe("Achado 3 — serviço extraordinário × afastamento", () => {
  it("férias sobrepostas ao período de referência geram ALERTA", () => {
    const r = regrasConflitoAfastamento(entrada({
      campos: { DATA_INICIO: "2026-08-01", DATA_FIM: "2026-08-31" },
      base: base({ ferias: feriasAgosto }),
    }));
    expect(r).toHaveLength(1);
    expect(r[0].severidade).toBe("alerta");
    expect(r[0].confirmavel).toBe(true);
    expect(r[0].motivo).toContain("período de referência");
  });

  it("licença-paternidade sobreposta gera ALERTA", () => {
    expect(severidadeConflito("servico_extraordinario", "licenca_paternidade")).toBe("alerta");
  });

  it("convocação futura mantém BLOQUEIO", () => {
    expect(severidadeConflito("servico_extraordinario_convocacao", "ferias")).toBe("bloqueio");
    expect(severidadeConflito("servico_extraordinario_convocacao", "licenca_paternidade")).toBe("bloqueio");
  });

  it("demais linhas da matriz permanecem inalteradas", () => {
    expect(severidadeConflito("viagem", "ferias")).toBe("alerta");
    expect(severidadeConflito("assuncao_funcao", "ferias")).toBe("alerta");
    expect(severidadeConflito("dispensa_funcao", "ferias")).toBeNull();
    expect(severidadeConflito("nomeacao_comissao", "ferias")).toBe("sugestao");
    expect(severidadeConflito("dispensa_recompensa", "ferias")).toBe("sugestao");
    expect(severidadeConflito("folga_compensatoria", "ferias")).toBe("sugestao");
    expect(severidadeConflito("servico_extraordinario", "luto")).toBe("alerta");
    expect(severidadeConflito("servico_extraordinario", "nupcias")).toBe("alerta");
  });
});

describe("Achado 2 — documento cancelado não bloqueia", () => {
  const doc = (over: Record<string, unknown> = {}) => ({
    id: "d1", numero: "010", ano: 2026, data_documento: "2026-08-10",
    status: "gerado", canceled_at: null,
    assuntos: [{ tipo: "viagem", militar_id: M, campos: { DATA_INICIO: "2026-08-20", DESTINO: "Curitiba", ORIGEM: "Ponta Grossa", MISSAO: "curso" } }],
    ...over,
  }) as BaseConsistencia["documentos"][number];

  const alvo = entrada({
    tipoAssunto: "viagem",
    campos: { DATA_INICIO: "2026-08-20", DESTINO: "Curitiba", ORIGEM: "Ponta Grossa", MISSAO: "curso" },
  });

  it("documento ativo idêntico mantém alerta de duplicidade", () => {
    const r = regrasRedundancia({ ...alvo, base: base({ documentos: [doc()] }) });
    expect(r[0].severidade).toBe("alerta");
    expect(r[0].regra).toBe("redundancia.documento_ativo");
  });

  it("mesmo documento cancelado vira apenas sugestão informativa", () => {
    const r = regrasRedundancia({ ...alvo, base: base({ documentos: [doc({ canceled_at: "2026-08-12T10:00:00Z" })] }) });
    expect(r[0].severidade).toBe("sugestao");
    expect(r[0].regra).toBe("redundancia.documento_cancelado");
    expect(r[0].motivo).toContain("não impede a geração de uma nova NBI");
    expect(r[0].confirmavel).toBe(false);
  });
});
