// Bloco 12G — cancelamento real de NBI gerada + duplicidade documental confirmável.
// Camada PURA: nenhum teste aqui grava dados, reserva número ou gera documento.
import { describe, expect, it } from "vitest";
import { avaliarConsistenciaNbi } from "@/lib/nbi/consistencia/avaliar";
import { documentoConfirmado, situacaoDocumento } from "@/lib/nbi/consistencia/base";
import {
  bloqueadoPorDuplicidade, ehDuplicidadeDocumental, separarAchados,
} from "@/lib/nbi/duplicidadeDocumental";
import type { Achado, BaseConsistencia, DocumentoBase } from "@/lib/nbi/consistencia/tipos";

const MIL = "11111111-1111-1111-1111-111111111111";
const FER = "33333333-3333-3333-3333-333333333333";

function doc(p: Partial<DocumentoBase>): DocumentoBase {
  return {
    id: p.id ?? "doc-1",
    numero: p.numero ?? "001",
    ano: p.ano ?? 2026,
    data_documento: p.data_documento ?? "2026-09-01",
    status: p.status ?? "gerado",
    canceled_at: p.canceled_at ?? null,
    created_at: p.created_at ?? "2026-09-01T10:00:00Z",
    assuntos: p.assuntos ?? [],
  };
}

function base(p: Partial<BaseConsistencia> = {}): BaseConsistencia {
  return {
    documentos: p.documentos ?? [],
    ferias: p.ferias ?? [{
      id: FER, militar_id: MIL, ano: 2026, periodo: 2,
      data_inicio: "2026-08-17", data_fim: "2026-08-31",
    }],
    substituicoes: p.substituicoes ?? [],
    militares: p.militares ?? [{ id: MIL, nome: "FULANO DE TAL", ativo: true }],
    hoje: p.hoje ?? "2026-09-02",
  };
}

const apresentacaoExistente = (over: Partial<DocumentoBase> = {}) => doc({
  id: "doc-origem",
  assuntos: [{
    tipo: "apresentacao",
    militar_id: MIL,
    ferias_id: FER,
    campos: { DATA_APRESENTACAO: "2026-09-01", DATA_INICIO: "2026-08-17", DATA_FIM: "2026-08-31" },
  }],
  ...over,
});

const entradaApresentacao = (b: BaseConsistencia, documentoId?: string) => ({
  militarId: MIL,
  tipoAssunto: "apresentacao",
  campos: {
    DATA_APRESENTACAO: "2026-09-01",
    DATA_INICIO: "2026-08-17",
    DATA_FIM: "2026-08-31",
    ferias_id: FER,
  },
  dataDocumento: "2026-09-01",
  documentoId: documentoId ?? "novo-rascunho",
  base: b,
});

const achado = (regra: string, severidade: Achado["severidade"]): Achado => ({
  regra, severidade, titulo: regra, motivo: "", origem: "", acaoSugerida: "", relacionados: [],
});

// ---------------------------------------------------------------
// Classificação: duplicidade documental x incompatibilidade institucional
// ---------------------------------------------------------------
describe("separação duplicidade documental x institucional", () => {
  it("classifica apenas as duas regras de documento equivalente como duplicidade", () => {
    expect(ehDuplicidadeDocumental("apresentacao.duplicada")).toBe(true);
    expect(ehDuplicidadeDocumental("redundancia.documento_ativo")).toBe(true);
    expect(ehDuplicidadeDocumental("apresentacao.antes_do_fim")).toBe(false);
    expect(ehDuplicidadeDocumental("cronologia.fim_antes_inicio")).toBe(false);
    expect(ehDuplicidadeDocumental("substituicao.encerrada_reutilizada")).toBe(false);
    expect(ehDuplicidadeDocumental("substituicao.origem_cancelada")).toBe(false);
  });

  it("não move conflitos institucionais para o grupo confirmável", () => {
    const s = separarAchados([
      achado("apresentacao.duplicada", "alerta"),
      achado("apresentacao.antes_do_fim", "bloqueio"),
      achado("cronologia.retorno_antes_saida", "bloqueio"),
    ]);
    expect(s.duplicidadeDocumental.map((a) => a.regra)).toEqual(["apresentacao.duplicada"]);
    expect(s.institucionais.map((a) => a.regra)).toEqual([
      "apresentacao.antes_do_fim", "cronologia.retorno_antes_saida",
    ]);
  });

  it("sem confirmação não gera; com confirmação explícita libera", () => {
    expect(bloqueadoPorDuplicidade(["dup"], false)).toBe(true);
    expect(bloqueadoPorDuplicidade(["dup"], true)).toBe(false);
    expect(bloqueadoPorDuplicidade([], false)).toBe(false);
  });
});

// ---------------------------------------------------------------
// Documento ativo equivalente -> aviso confirmável (não bloqueio)
// ---------------------------------------------------------------
describe("duplicidade documental confirmável", () => {
  it("apresentação equivalente em NBI gerada vira alerta confirmável", () => {
    const r = avaliarConsistenciaNbi(
      entradaApresentacao(base({ documentos: [apresentacaoExistente()] })),
    );
    expect(r.bloqueios.map((b) => b.regra)).not.toContain("apresentacao.duplicada");
    const a = r.alertas.find((x) => x.regra === "apresentacao.duplicada");
    expect(a).toBeDefined();
    expect(a?.confirmavel).toBe(true);
    expect(a?.motivo).toContain("NBI 001/2026");
  });

  it("redundância com documento ativo continua alerta confirmável", () => {
    const r = avaliarConsistenciaNbi(
      entradaApresentacao(base({ documentos: [apresentacaoExistente()] })),
    );
    const red = r.alertas.find((x) => x.regra === "redundancia.documento_ativo");
    if (red) expect(red.confirmavel).toBe(true);
  });
});

// ---------------------------------------------------------------
// NBI cancelada não é documento ativo
// ---------------------------------------------------------------
describe("NBI cancelada na consistência", () => {
  const cancelada = apresentacaoExistente({
    status: "cancelado", canceled_at: "2026-09-05T12:00:00Z",
  });

  it("cancelada deixa de satisfazer documentoConfirmado", () => {
    expect(situacaoDocumento(cancelada)).toBe("cancelado");
    expect(documentoConfirmado(cancelada)).toBe(false);
  });

  it("cancelada só com canceled_at (status legado) também é cancelada", () => {
    const legado = apresentacaoExistente({ status: "gerado", canceled_at: "2026-09-05T12:00:00Z" });
    expect(documentoConfirmado(legado)).toBe(false);
  });

  it("cancelada não gera apresentacao.duplicada", () => {
    const r = avaliarConsistenciaNbi(entradaApresentacao(base({ documentos: [cancelada] })));
    expect([...r.bloqueios, ...r.alertas].map((a) => a.regra))
      .not.toContain("apresentacao.duplicada");
  });

  it("cancelada não gera redundância bloqueante — no máximo sugestão histórica", () => {
    const r = avaliarConsistenciaNbi(entradaApresentacao(base({ documentos: [cancelada] })));
    expect(r.bloqueios).toHaveLength(0);
    expect(r.alertas.map((a) => a.regra)).not.toContain("redundancia.documento_ativo");
    const sug = r.sugestoes.find((s) => s.regra === "redundancia.documento_cancelado");
    if (sug) expect(sug.motivo).toContain("não impede");
  });
});

// ---------------------------------------------------------------
// Conflitos institucionais reais permanecem bloqueantes
// ---------------------------------------------------------------
describe("incompatibilidade institucional permanece bloqueante", () => {
  it("apresentação antes do fim das férias continua bloqueio", () => {
    const r = avaliarConsistenciaNbi({
      ...entradaApresentacao(base()),
      campos: {
        DATA_APRESENTACAO: "2026-08-25",
        DATA_INICIO: "2026-08-17",
        DATA_FIM: "2026-08-31",
        ferias_id: FER,
      },
    });
    const b = r.bloqueios.map((x) => x.regra);
    expect(b).toContain("apresentacao.antes_do_fim");
    expect(separarAchados(r.bloqueios).duplicidadeDocumental).toHaveLength(0);
  });

  it("data final anterior à inicial continua bloqueio", () => {
    const r = avaliarConsistenciaNbi({
      militarId: MIL,
      tipoAssunto: "viagem",
      campos: { DATA_INICIO: "2026-09-10", DATA_FIM: "2026-09-01" },
      dataDocumento: "2026-09-10",
      documentoId: "novo",
      base: base({ ferias: [] }),
    });
    expect(r.bloqueios.map((x) => x.regra)).toContain("cronologia.fim_antes_inicio");
  });

  it("substituição encerrada continua bloqueio", () => {
    const r = avaliarConsistenciaNbi({
      militarId: MIL,
      tipoAssunto: "dispensa_funcao",
      substituicaoId: "sub-1",
      campos: { DATA_INICIO: "2026-09-10" },
      dataDocumento: "2026-09-10",
      documentoId: "novo",
      base: base({
        ferias: [],
        substituicoes: [{
          id: "sub-1", status: "encerrada", funcao: "Chefe de Seção",
          data_inicio: "2026-08-01", data_fim_prevista: "2026-08-20",
          data_fim_efetiva: "2026-08-20", substituto_militar_id: MIL,
          titular_militar_id: null, assuncao_documento_id: null, dispensa_documento_id: null,
        }],
      }),
    });
    expect(r.bloqueios.map((x) => x.regra)).toContain("substituicao.encerrada_reutilizada");
  });
});

// ---------------------------------------------------------------
// Duplicata (botão Duplicar): rascunho com origem rastreada
// ---------------------------------------------------------------
describe("duplicata pode prosseguir mediante confirmação", () => {
  it("origem gerada produz duplicidade confirmável, não bloqueio", () => {
    const origem = apresentacaoExistente();
    const r = avaliarConsistenciaNbi(
      entradaApresentacao(base({ documentos: [origem] }), "copia-rascunho"),
    );
    const s = separarAchados([...r.bloqueios, ...r.alertas]);
    expect(s.institucionais.filter((a) => a.severidade === "bloqueio")).toHaveLength(0);
    expect(s.duplicidadeDocumental.length).toBeGreaterThan(0);
    expect(bloqueadoPorDuplicidade(s.duplicidadeDocumental, false)).toBe(true);
    expect(bloqueadoPorDuplicidade(s.duplicidadeDocumental, true)).toBe(false);
  });

  it("rascunhos e reservados nunca contam como documento ativo equivalente", () => {
    for (const status of ["rascunho", "reservado"]) {
      const r = avaliarConsistenciaNbi(
        entradaApresentacao(base({ documentos: [apresentacaoExistente({ status })] })),
      );
      expect([...r.bloqueios, ...r.alertas].map((a) => a.regra))
        .not.toContain("apresentacao.duplicada");
    }
  });
});
