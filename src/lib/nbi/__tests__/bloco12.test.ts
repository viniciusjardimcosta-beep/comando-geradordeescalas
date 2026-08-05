// Bloco 12 — testes do motor de consistência institucional (camada pura).
import { describe, expect, it } from "vitest";
import { avaliarConsistenciaNbi } from "@/lib/nbi/consistencia/avaliar";
import { coletarAfastamentos } from "@/lib/nbi/consistencia/base";
import { montarTimeline } from "@/lib/nbi/consistencia/timeline";
import { apresentacoesPendentes, substituicoesPendentes } from "@/lib/nbi/consistencia/pendencias";
import type { BaseConsistencia, DocumentoBase } from "@/lib/nbi/consistencia/tipos";

const MIL = "11111111-1111-1111-1111-111111111111";
const TIT = "22222222-2222-2222-2222-222222222222";

function doc(p: Partial<DocumentoBase>): DocumentoBase {
  return {
    id: p.id ?? "doc-1",
    numero: p.numero ?? "010",
    ano: p.ano ?? 2026,
    data_documento: p.data_documento ?? "2026-01-10",
    status: p.status ?? "gerado",
    canceled_at: p.canceled_at ?? null,
    created_at: p.created_at ?? "2026-01-10T10:00:00Z",
    assuntos: p.assuntos ?? [],
  };
}

function base(p: Partial<BaseConsistencia> = {}): BaseConsistencia {
  return {
    documentos: p.documentos ?? [],
    ferias: p.ferias ?? [],
    substituicoes: p.substituicoes ?? [],
    militares: p.militares ?? [
      { id: MIL, nome: "Soldado Silva", ativo: true },
      { id: TIT, nome: "Sargento Souza", ativo: true },
    ],
    hoje: p.hoje ?? "2026-03-01",
  };
}

const ferias = (id: string, inicio: string, fim: string) => ({
  id, militar_id: MIL, ano: 2026, periodo: 1, data_inicio: inicio, data_fim: fim,
});

describe("Bloco 12 — cronologia", () => {
  it("bloqueia data final anterior à inicial", () => {
    const r = avaliarConsistenciaNbi({
      militarId: MIL, tipoAssunto: "ferias",
      campos: { DATA_INICIO: "2026-02-10", DATA_FIM: "2026-02-01" },
      dataDocumento: "2026-02-01", base: base(),
    });
    expect(r.bloqueios.map((b) => b.regra)).toContain("cronologia.fim_antes_inicio");
  });

  it("bloqueia apresentação anterior ao fim do afastamento", () => {
    const r = avaliarConsistenciaNbi({
      militarId: MIL, tipoAssunto: "apresentacao",
      campos: { DATA_FIM: "2026-02-10", DATA_APRESENTACAO: "2026-02-05" },
      dataDocumento: "2026-02-11", base: base(),
    });
    expect(r.bloqueios.map((b) => b.regra)).toContain("cronologia.apresentacao_antes_do_fim");
  });

  it("alerta (não bloqueia) nota muito posterior ao fato", () => {
    const r = avaliarConsistenciaNbi({
      militarId: MIL, tipoAssunto: "viagem",
      campos: { DATA_INICIO: "2026-01-01" },
      dataDocumento: "2026-06-01", base: base(),
    });
    expect(r.alertas.map((a) => a.regra)).toContain("cronologia.nota_muito_posterior");
    expect(r.bloqueios).toHaveLength(0);
  });

  it("todo achado declara severidade, origem, motivo e ação sugerida", () => {
    const r = avaliarConsistenciaNbi({
      militarId: MIL, tipoAssunto: "ferias",
      campos: { DATA_INICIO: "2026-02-10", DATA_FIM: "2026-02-01" },
      dataDocumento: "2026-02-01", base: base(),
    });
    for (const a of [...r.bloqueios, ...r.alertas, ...r.sugestoes]) {
      expect(a.severidade).toBeTruthy();
      expect(a.origem.length).toBeGreaterThan(0);
      expect(a.motivo.length).toBeGreaterThan(0);
      expect(a.acaoSugerida.length).toBeGreaterThan(0);
    }
  });
});

describe("Bloco 12 — substituições", () => {
  const sub = {
    id: "sub-1", status: "aberta", funcao: "Chefe da Seção",
    data_inicio: "2026-02-01", data_fim_prevista: "2026-02-20", data_fim_efetiva: null,
    substituto_militar_id: MIL, titular_militar_id: TIT,
    assuncao_documento_id: "doc-1", dispensa_documento_id: null,
  };

  it("bloqueia dispensa anterior à assunção", () => {
    const r = avaliarConsistenciaNbi({
      militarId: MIL, tipoAssunto: "dispensa_funcao", substituicaoId: "sub-1",
      campos: { DATA_INICIO: "2026-01-20" },
      dataDocumento: "2026-01-20", base: base({ substituicoes: [sub] }),
    });
    expect(r.bloqueios.map((b) => b.regra)).toContain("substituicao.dispensa_antes_assuncao");
  });

  it("bloqueia reuso de substituição encerrada", () => {
    const r = avaliarConsistenciaNbi({
      militarId: MIL, tipoAssunto: "dispensa_funcao", substituicaoId: "sub-1",
      campos: { DATA_INICIO: "2026-02-20" },
      dataDocumento: "2026-02-20",
      base: base({ substituicoes: [{ ...sub, status: "encerrada", data_fim_efetiva: "2026-02-15" }] }),
    });
    expect(r.bloqueios.map((b) => b.regra)).toContain("substituicao.encerrada_reutilizada");
  });

  it("lista assunção aberta como pendência com estado", () => {
    const p = substituicoesPendentes(base({ substituicoes: [sub], hoje: "2026-03-01" }));
    expect(p).toHaveLength(1);
    expect(p[0].estado).toBe("dispensa_atrasada");
    expect(p[0].mensagem.length).toBeGreaterThan(0);
  });
});

describe("Bloco 12 — afastamentos, dedupe e pendência de apresentação", () => {
  it("deduplica férias do banco e da NBI pelo ferias_id", () => {
    const b = base({
      ferias: [ferias("f-1", "2026-01-05", "2026-01-24")],
      documentos: [doc({
        id: "doc-f", numero: "005",
        assuntos: [{ tipo: "ferias", militar_id: MIL, ferias_id: "f-1", campos: { DATA_INICIO: "2026-01-05", DATA_FIM: "2026-01-24" } }],
      })],
    });
    const afast = coletarAfastamentos(b, MIL).filter((a) => a.tipo === "ferias");
    expect(afast).toHaveLength(1);
    expect(afast[0].origem).toBe("documento_nbi");
  });

  it("aponta apresentação pendente após encerramento do afastamento", () => {
    const b = base({ ferias: [ferias("f-1", "2026-01-05", "2026-01-24")], hoje: "2026-02-01" });
    const p = apresentacoesPendentes(b);
    expect(p).toHaveLength(1);
    expect(p[0].militar_id).toBe(MIL);
  });

  it("não aponta pendência quando já existe apresentação gerada", () => {
    const b = base({
      ferias: [ferias("f-1", "2026-01-05", "2026-01-24")],
      hoje: "2026-02-01",
      documentos: [doc({
        id: "doc-a", numero: "006", data_documento: "2026-01-25",
        assuntos: [{ tipo: "apresentacao", militar_id: MIL, campos: { DATA_APRESENTACAO: "2026-01-25" } }],
      })],
    });
    expect(apresentacoesPendentes(b)).toHaveLength(0);
  });

  it("rascunho não satisfaz pendência nem conta como documento confirmado", () => {
    const b = base({
      ferias: [ferias("f-1", "2026-01-05", "2026-01-24")],
      hoje: "2026-02-01",
      documentos: [doc({
        id: "doc-r", status: "rascunho", numero: null,
        data_documento: "2026-01-25",
        assuntos: [{ tipo: "apresentacao", militar_id: MIL, campos: { DATA_APRESENTACAO: "2026-01-25" } }],
      })],
    });
    expect(apresentacoesPendentes(b)).toHaveLength(1);
  });

  it("documento cancelado não satisfaz pendência", () => {
    const b = base({
      ferias: [ferias("f-1", "2026-01-05", "2026-01-24")],
      hoje: "2026-02-01",
      documentos: [doc({
        id: "doc-c", canceled_at: "2026-01-26", data_documento: "2026-01-25",
        assuntos: [{ tipo: "apresentacao", militar_id: MIL, campos: { DATA_APRESENTACAO: "2026-01-25" } }],
      })],
    });
    expect(apresentacoesPendentes(b)).toHaveLength(1);
  });
});

describe("Bloco 12 — conflitos de afastamento", () => {
  const bConflito = base({
    ferias: [ferias("f-1", "2026-02-01", "2026-02-20")],
    hoje: "2026-02-10",
  });

  it("sinaliza viagem durante período de férias", () => {
    const r = avaliarConsistenciaNbi({
      militarId: MIL, tipoAssunto: "viagem",
      campos: { DATA_INICIO: "2026-02-05", DATA_RETORNO: "2026-02-06" },
      dataDocumento: "2026-02-05", base: bConflito,
    });
    const todos = [...r.bloqueios, ...r.alertas];
    expect(todos.some((a) => a.regra.startsWith("conflito."))).toBe(true);
  });

  it("luto durante férias é informativo, nunca bloqueio", () => {
    const r = avaliarConsistenciaNbi({
      militarId: MIL, tipoAssunto: "luto",
      campos: { DATA_INICIO: "2026-02-05", DATA_FIM: "2026-02-12" },
      dataDocumento: "2026-02-05", base: bConflito,
    });
    expect(r.bloqueios.filter((a) => a.regra.startsWith("conflito."))).toHaveLength(0);
  });

  it("núpcias durante férias é informativo, nunca bloqueio", () => {
    const r = avaliarConsistenciaNbi({
      militarId: MIL, tipoAssunto: "nupcias",
      campos: { DATA_INICIO: "2026-02-05", DATA_FIM: "2026-02-12" },
      dataDocumento: "2026-02-05", base: bConflito,
    });
    expect(r.bloqueios.filter((a) => a.regra.startsWith("conflito."))).toHaveLength(0);
  });
});

describe("Bloco 12 — redundância e linha do tempo", () => {
  it("aponta redundância com documento já gerado de mesma assinatura", () => {
    const assunto = { tipo: "viagem", militar_id: MIL, campos: { DESTINO: "Curitiba", DATA_INICIO: "2026-02-05", DATA_RETORNO: "2026-02-05" } };
    const b = base({ documentos: [doc({ id: "doc-v", numero: "020", assuntos: [assunto] })] });
    const r = avaliarConsistenciaNbi({
      militarId: MIL, tipoAssunto: "viagem",
      campos: assunto.campos, dataDocumento: "2026-02-06",
      documentoId: "outro-doc", base: b,
    });
    expect([...r.bloqueios, ...r.alertas].some((a) => a.regra.startsWith("redundancia."))).toBe(true);
  });

  it("não acusa redundância contra o próprio documento em edição", () => {
    const assunto = { tipo: "viagem", militar_id: MIL, campos: { DESTINO: "Curitiba", DATA_INICIO: "2026-02-05" } };
    const b = base({ documentos: [doc({ id: "doc-v", numero: "020", assuntos: [assunto] })] });
    const r = avaliarConsistenciaNbi({
      militarId: MIL, tipoAssunto: "viagem", campos: assunto.campos,
      dataDocumento: "2026-02-05", documentoId: "doc-v", base: b,
    });
    expect([...r.bloqueios, ...r.alertas].some((a) => a.regra.startsWith("redundancia."))).toBe(false);
  });

  it("monta linha do tempo paginada e ordenada", () => {
    const documentos = Array.from({ length: 25 }, (_, i) =>
      doc({
        id: `d-${i}`, numero: String(i).padStart(3, "0"),
        data_documento: `2026-01-${String((i % 28) + 1).padStart(2, "0")}`,
        assuntos: [{ tipo: "viagem", militar_id: MIL, campos: { DESTINO: "Curitiba" } }],
      }),
    );
    const t = montarTimeline(base({ documentos }), MIL, { porPagina: 10, pagina: 1 });
    expect(t.eventos.length).toBeLessThanOrEqual(10);
    expect(t.total).toBeGreaterThanOrEqual(25);
  });

  it("filtra a linha do tempo por recorte temporal", () => {
    const b = base({
      documentos: [
        doc({ id: "d1", data_documento: "2026-01-05", assuntos: [{ tipo: "viagem", militar_id: MIL, campos: {} }] }),
        doc({ id: "d2", data_documento: "2026-06-05", assuntos: [{ tipo: "viagem", militar_id: MIL, campos: {} }] }),
      ],
    });
    const t = montarTimeline(b, MIL, { de: "2026-05-01", ate: "2026-12-31", porPagina: 20 });
    expect(t.eventos.every((e) => e.data >= "2026-05-01")).toBe(true);
  });
});
