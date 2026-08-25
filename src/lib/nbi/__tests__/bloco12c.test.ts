// Bloco 12C — Homologação funcional completa do módulo NBI.
// Somente testes: nenhum motor, redação ou modelo é alterado aqui.
import { describe, expect, it } from "vitest";
import { avaliarConsistenciaNbi } from "@/lib/nbi/consistencia/avaliar";
import { coletarAfastamentos } from "@/lib/nbi/consistencia/base";
import { montarTimeline } from "@/lib/nbi/consistencia/timeline";
import {
  apresentacoesPendentes, folgasPrevistas, substituicoesPendentes,
} from "@/lib/nbi/consistencia/pendencias";
import type {
  AssuntoSnapshot, BaseConsistencia, DocumentoBase, SubstituicaoBase,
} from "@/lib/nbi/consistencia/tipos";
import { calcularMesesFolga, subtipoFolga, campoDoSubtipoFolga } from "@/lib/nbi/folgaCompensatoria";
import { listarMotores, obterMotor } from "@/lib/nbi/motores/registry";
import { podeGerarOficial, podeReservarNumero } from "@/lib/nbi/homologacao";

const MIL = "11111111-1111-1111-1111-111111111111";
const TIT = "22222222-2222-2222-2222-222222222222";
const INATIVO = "33333333-3333-3333-3333-333333333333";

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

function assunto(p: Partial<AssuntoSnapshot> & { tipo: string }): AssuntoSnapshot {
  return {
    tipo: p.tipo,
    subtipo: p.subtipo ?? null,
    titulo: p.titulo ?? null,
    militar_id: p.militar_id ?? MIL,
    militar_titular_id: p.militar_titular_id ?? null,
    ferias_id: p.ferias_id ?? null,
    substituicao_id: p.substituicao_id ?? null,
    campos: p.campos ?? {},
  };
}

function sub(p: Partial<SubstituicaoBase> & { id: string }): SubstituicaoBase {
  return {
    id: p.id,
    status: p.status ?? "aberta",
    funcao: p.funcao ?? "Chefe da Seção de Pessoal",
    data_inicio: p.data_inicio ?? "2026-02-01",
    data_fim_prevista: p.data_fim_prevista ?? null,
    data_fim_efetiva: p.data_fim_efetiva ?? null,
    substituto_militar_id: p.substituto_militar_id ?? MIL,
    titular_militar_id: p.titular_militar_id ?? TIT,
    assuncao_documento_id: p.assuncao_documento_id ?? null,
    dispensa_documento_id: p.dispensa_documento_id ?? null,
  };
}

function base(p: Partial<BaseConsistencia> = {}): BaseConsistencia {
  return {
    documentos: p.documentos ?? [],
    ferias: p.ferias ?? [],
    substituicoes: p.substituicoes ?? [],
    militares: p.militares ?? [
      { id: MIL, nome: "FULANO DE TAL", ativo: true },
      { id: TIT, nome: "BELTRANO DE TAL", ativo: true },
      { id: INATIVO, nome: "Cabo Inativo", ativo: false },
    ],
    hoje: p.hoje ?? "2026-03-01",
  };
}

const ferias = (id: string, inicio: string, fim: string, militar = MIL) => ({
  id, militar_id: militar, ano: Number(inicio.slice(0, 4)), periodo: 1, data_inicio: inicio, data_fim: fim,
});

const regras = (r: { bloqueios: { regra: string }[]; alertas: { regra: string }[]; sugestoes: { regra: string }[] }) => ({
  bloqueios: r.bloqueios.map((x) => x.regra),
  alertas: r.alertas.map((x) => x.regra),
  sugestoes: r.sugestoes.map((x) => x.regra),
});

// ============================================================
// FASE 2 — Cenário A: ciclo completo de férias
// ============================================================
describe("12C/A — ciclo completo de férias", () => {
  const f = ferias("fer-1", "2026-02-01", "2026-02-10");

  it("afastamento aparece na timeline com origem do banco de férias", () => {
    const t = montarTimeline(base({ ferias: [f] }), MIL);
    expect(t.total).toBe(1);
    expect(t.eventos[0].tipo).toBe("ferias");
    expect(t.eventos[0].origem).toBe("Banco de Férias");
    expect(t.eventos[0].vinculo).toContain("2026-02-11");
  });

  it("não há apresentação pendente antes do término", () => {
    expect(apresentacoesPendentes(base({ ferias: [f], hoje: "2026-02-05" }))).toHaveLength(0);
  });

  it("pendência surge quando a data esperada é alcançada", () => {
    const p = apresentacoesPendentes(base({ ferias: [f], hoje: "2026-02-11" }));
    expect(p).toHaveLength(1);
    expect(p[0].dataApresentacao).toBe("2026-02-11");
    expect(p[0].origem).toBe("Banco de Férias");
  });

  it("rascunho de apresentação não satisfaz, mas evita pendência transitória", () => {
    const rascunho = doc({
      id: "d-rascunho", status: "rascunho", numero: null,
      assuntos: [assunto({ tipo: "apresentacao", ferias_id: "fer-1", campos: { DATA_APRESENTACAO: "2026-02-11" } })],
    });
    const b = base({ ferias: [f], documentos: [rascunho], hoje: "2026-02-20" });
    expect(apresentacoesPendentes(b)).toHaveLength(0);
    // e o rascunho não entra na timeline como fato documental
    expect(montarTimeline(b, MIL).eventos.some((e) => e.documento_id === "d-rascunho")).toBe(false);
  });

  it("reservado não é publicado e não satisfaz a pendência", () => {
    const reservado = doc({
      id: "d-res", status: "reservado", numero: "011",
      assuntos: [assunto({ tipo: "apresentacao", ferias_id: "outra", campos: { DATA_APRESENTACAO: "2026-01-05" } })],
    });
    const b = base({ ferias: [f], documentos: [reservado], hoje: "2026-02-20" });
    expect(apresentacoesPendentes(b)).toHaveLength(1);
    expect(montarTimeline(b, MIL).eventos.find((e) => e.documento_id === "d-res")?.situacao).toBe("reservado");
  });


  it("apresentação gerada resolve a pendência e o vínculo é preservado", () => {
    const gerado = doc({
      id: "d-apres", numero: "012", data_documento: "2026-02-11",
      assuntos: [assunto({ tipo: "apresentacao", ferias_id: "fer-1", campos: { DATA_APRESENTACAO: "2026-02-11" } })],
    });
    const b = base({ ferias: [f], documentos: [gerado], hoje: "2026-02-20" });
    expect(apresentacoesPendentes(b)).toHaveLength(0);
    const t = montarTimeline(b, MIL);
    expect(t.total).toBe(2);
    expect(t.eventos.map((e) => e.tipo)).toEqual(["ferias", "apresentacao"]);
  });

  it("documento cancelado não satisfaz pendência", () => {
    const cancelado = doc({
      id: "d-cancel", numero: "013", canceled_at: "2026-02-12T00:00:00Z",
      assuntos: [assunto({ tipo: "apresentacao", ferias_id: "fer-1", campos: { DATA_APRESENTACAO: "2026-02-11" } })],
    });
    expect(apresentacoesPendentes(base({ ferias: [f], documentos: [cancelado], hoje: "2026-02-20" }))).toHaveLength(1);
  });

  it("férias do banco documentadas em NBI não duplicam na timeline", () => {
    const nbiFerias = doc({
      id: "d-fer", numero: "010",
      assuntos: [assunto({ tipo: "ferias", ferias_id: "fer-1", campos: { DATA_INICIO: "2026-02-01", DATA_FIM: "2026-02-10" } })],
    });
    const b = base({ ferias: [f], documentos: [nbiFerias] });
    expect(coletarAfastamentos(b, MIL)).toHaveLength(1);
    const t = montarTimeline(b, MIL);
    expect(t.total).toBe(1);
    expect(t.eventos[0].numeroNbi).toBe("NBI 010/2026");
    expect(t.eventos[0].origem).toContain("comprovação documental");
  });
});

// ============================================================
// FASE 3 — Cenário B: luto, núpcias e licença-paternidade
// ============================================================
describe("12C/B — luto, núpcias e licença-paternidade", () => {
  const casos: Array<[string, number]> = [
    ["luto", 8], ["nupcias", 8], ["licenca_paternidade", 20],
  ];

  it.each(casos)("%s: fim e apresentação derivados de QTD_DIAS", (tipo, dias) => {
    const d = doc({
      id: `d-${tipo}`,
      assuntos: [assunto({ tipo, campos: { DATA_INICIO: "2026-02-01", QTD_DIAS: String(dias) } })],
    });
    const af = coletarAfastamentos(base({ documentos: [d] }), MIL);
    expect(af).toHaveLength(1);
    const fimEsperado = new Date(Date.UTC(2026, 1, dias));
    expect(af[0].fim).toBe(fimEsperado.toISOString().slice(0, 10));
    expect(af[0].apresentacao).toBe(new Date(Date.UTC(2026, 1, dias + 1)).toISOString().slice(0, 10));
  });

  it("pendência só na data correta e resolvida pela apresentação gerada", () => {
    const luto = doc({
      id: "d-luto",
      assuntos: [assunto({ tipo: "luto", campos: { DATA_INICIO: "2026-02-01", QTD_DIAS: "8" } })],
    });
    expect(apresentacoesPendentes(base({ documentos: [luto], hoje: "2026-02-08" }))).toHaveLength(0);
    expect(apresentacoesPendentes(base({ documentos: [luto], hoje: "2026-02-09" }))).toHaveLength(1);

    const apres = doc({
      id: "d-apres-luto", numero: "020", data_documento: "2026-02-09",
      assuntos: [assunto({ tipo: "apresentacao", subtipo: "luto", campos: { DATA_APRESENTACAO: "2026-02-09" } })],
    });
    expect(apresentacoesPendentes(base({ documentos: [luto, apres], hoje: "2026-02-15" }))).toHaveLength(0);
  });

  it("apresentação anterior ao término do luto é bloqueio", () => {
    const luto = doc({
      id: "d-luto2",
      assuntos: [assunto({ tipo: "luto", campos: { DATA_INICIO: "2026-02-01", QTD_DIAS: "8" } })],
    });
    const r = avaliarConsistenciaNbi({
      militarId: MIL, tipoAssunto: "apresentacao", subtipo: "luto",
      campos: { DATA_APRESENTACAO: "2026-02-05" },
      dataDocumento: "2026-02-05", base: base({ documentos: [luto] }),
    });
    expect(regras(r).bloqueios).toContain("apresentacao.antes_do_fim");
  });
});

// ============================================================
// FASE 4 — Cenário C: assunção ⇄ dispensa
// ============================================================
describe("12C/C — assunção ⇄ dispensa", () => {
  const sA = sub({ id: "sub-a", funcao: "Chefe da Seção de Pessoal", data_inicio: "2026-02-01", data_fim_prevista: "2026-02-20", assuncao_documento_id: "d-a" });
  const sB = sub({ id: "sub-b", funcao: "Chefe da Seção de Ensino", data_inicio: "2026-02-05", data_fim_prevista: "2026-02-25", assuncao_documento_id: "d-b" });

  it("duas substituições abertas do mesmo par coexistem", () => {
    const p = substituicoesPendentes(base({ substituicoes: [sA, sB], hoje: "2026-02-10" }));
    expect(p).toHaveLength(2);
    expect(p.every((x) => x.estado === "aberta_previsao_futura")).toBe(true);
  });

  it("dispensa de A encerra apenas A", () => {
    const encerrada = { ...sA, status: "encerrada", data_fim_efetiva: "2026-02-20" };
    const p = substituicoesPendentes(base({ substituicoes: [encerrada, sB], hoje: "2026-02-21" }));
    expect(p.map((x) => x.id)).toEqual(["sub-b"]);
  });

  it("substituição encerrada reutilizada é bloqueio", () => {
    const encerrada = { ...sA, status: "encerrada", data_fim_efetiva: "2026-02-20" };
    const r = avaliarConsistenciaNbi({
      militarId: MIL, tipoAssunto: "dispensa_funcao", substituicaoId: "sub-a",
      campos: { DATA_INICIO: "2026-02-22" }, dataDocumento: "2026-02-22",
      base: base({ substituicoes: [encerrada] }),
    });
    expect(regras(r).bloqueios).toContain("substituicao.encerrada_reutilizada");
  });

  it("dispensa anterior à assunção é bloqueio", () => {
    const r = avaliarConsistenciaNbi({
      militarId: MIL, tipoAssunto: "dispensa_funcao", substituicaoId: "sub-a",
      campos: { DATA_INICIO: "2026-01-20" }, dataDocumento: "2026-01-20",
      base: base({ substituicoes: [sA] }),
    });
    expect(regras(r).bloqueios).toContain("substituicao.dispensa_antes_assuncao");
  });

  it("assunção com documento de origem cancelado bloqueia a dispensa", () => {
    const cancelada = doc({ id: "d-a", numero: "030", canceled_at: "2026-02-02T00:00:00Z" });
    const r = avaliarConsistenciaNbi({
      militarId: MIL, tipoAssunto: "dispensa_funcao", substituicaoId: "sub-a",
      campos: { DATA_INICIO: "2026-02-21" }, dataDocumento: "2026-02-21",
      base: base({ substituicoes: [sA], documentos: [cancelada] }),
    });
    expect(regras(r).bloqueios).toContain("substituicao.origem_cancelada");
  });

  it("aberta sem previsão nunca é marcada como atrasada", () => {
    const semPrev = sub({ id: "sub-c", data_fim_prevista: null, data_inicio: "2025-01-01" });
    const p = substituicoesPendentes(base({ substituicoes: [semPrev], hoje: "2026-06-01" }));
    expect(p[0].estado).toBe("aberta_sem_previsao");
    expect(p[0].mensagem.toLowerCase()).not.toContain("atrasad");
  });

  it("previsão vencida vira pendência de dispensa (sugestão), não bloqueio", () => {
    const vencida = sub({ id: "sub-d", data_fim_prevista: "2026-02-10", assuncao_documento_id: null });
    const b = base({ substituicoes: [vencida], hoje: "2026-03-01" });
    expect(substituicoesPendentes(b)[0].estado).toBe("dispensa_atrasada");
    const r = avaliarConsistenciaNbi({
      militarId: MIL, tipoAssunto: "viagem", campos: { DATA_INICIO: "2026-03-01" },
      dataDocumento: "2026-03-01", base: b,
    });
    expect(regras(r).sugestoes).toContain("pendencia.dispensa");
    expect(r.bloqueios).toHaveLength(0);
  });

  it("timeline mostra assunção e dispensa com o vínculo da substituição", () => {
    const encerrada = { ...sA, status: "encerrada", data_fim_efetiva: "2026-02-20" };
    const dA = doc({ id: "d-a", numero: "030", assuntos: [assunto({ tipo: "assuncao_funcao", substituicao_id: "sub-a", campos: { DATA_INICIO: "2026-02-01" } })] });
    const dD = doc({ id: "d-d", numero: "031", assuntos: [assunto({ tipo: "dispensa_funcao", substituicao_id: "sub-a", campos: { DATA_INICIO: "2026-02-20" } })] });
    const t = montarTimeline(base({ substituicoes: [encerrada], documentos: [dA, dD] }), MIL);
    expect(t.eventos.map((e) => e.tipo)).toEqual(["assuncao_funcao", "dispensa_funcao"]);
    expect(t.eventos[0].vinculo).toContain("encerrada");
  });
});

// ============================================================
// FASE 5 — Cenário D: folga compensatória
// ============================================================
describe("12C/D — folga compensatória", () => {
  it.each([
    ["2026-06", "junho", "julho", "2026", false],
    ["2026-07", "julho", "agosto", "2026", false],
    ["2026-12", "dezembro", "janeiro", "2027", true],
  ])("%s → mês seguinte correto", (ref, refExt, comp, anoComp, virada) => {
    const m = calcularMesesFolga(ref)!;
    expect(m.referencia).toBe(refExt);
    expect(m.compensacao).toBe(comp);
    expect(m.anoCompensacao).toBe(anoComp);
    expect(m.viradaDeAno).toBe(virada);
  });

  it.each(["4", "33", "128"])("previsão de %s horas aparece no painel sem marcar atraso", (horas) => {
    const d = doc({
      id: `d-folga-${horas}`, numero: "040",
      assuntos: [assunto({ tipo: "folga_compensatoria", subtipo: "previsao", campos: { QTD_HORAS: horas, mes_referencia_sel: "2026-02" } })],
    });
    const [f] = folgasPrevistas(base({ documentos: [d], hoje: "2026-03-01" }));
    expect(f.horas).toBe(horas);
    expect(f.realizada).toBe(false);
    expect(f.quando).toBe("mes_atual");
  });

  it("previsão e realizada convivem sem duplicar", () => {
    const prev = doc({ id: "d-p", numero: "041", assuntos: [assunto({ tipo: "folga_compensatoria", subtipo: "previsao", campos: { QTD_HORAS: "33", mes_referencia_sel: "2026-06" } })] });
    const real = doc({ id: "d-r", numero: "042", assuntos: [assunto({ tipo: "folga_compensatoria", subtipo: "realizada", campos: { QTD_HORAS: "33", mes_referencia_sel: "2026-06" } })] });
    const lista = folgasPrevistas(base({ documentos: [prev, real], hoje: "2026-07-05" }));
    expect(lista).toHaveLength(2);
    expect(lista.filter((x) => x.realizada)).toHaveLength(1);
    expect(lista.every((x) => x.mesCompensacao === "julho")).toBe(true);
  });

  it("subtipos oficiais têm templates distintos e MOTIVO só na previsão", () => {
    expect(subtipoFolga("previsao").template).toBe("folga_compensatoria");
    expect(subtipoFolga("realizada").template).toBe("folga_compensatoria_realizada");
    expect(campoDoSubtipoFolga("previsao", "MOTIVO")).toBe(true);
    expect(campoDoSubtipoFolga("realizada", "MOTIVO")).toBe(false);
  });
});

// ============================================================
// FASE 6 — Cenário E: conflitos institucionais (severidade exata)
// ============================================================
describe("12C/E — matriz de conflitos", () => {
  const feriasBase = base({ ferias: [ferias("fer-x", "2026-02-01", "2026-02-10")] });
  const afastamentoDoc = (tipo: string) => base({
    documentos: [doc({ id: `d-${tipo}`, numero: "050", assuntos: [assunto({ tipo, campos: { DATA_INICIO: "2026-02-01", DATA_FIM: "2026-02-10" } })] })],
  });

  const cenarios: Array<[string, string, BaseConsistencia, "bloqueio" | "alerta"]> = [
    // Achado 3 — serviço extraordinário executado: período é referência mensal → alerta.
    ["servico_extraordinario", "ferias", feriasBase, "alerta"],
    ["servico_extraordinario", "licenca_paternidade", afastamentoDoc("licenca_paternidade"), "alerta"],
    ["servico_extraordinario_convocacao", "ferias", feriasBase, "bloqueio"],
    ["servico_extraordinario", "luto", afastamentoDoc("luto"), "alerta"],
    ["servico_extraordinario", "nupcias", afastamentoDoc("nupcias"), "alerta"],
    ["viagem", "ferias", feriasBase, "alerta"],
    ["viagem", "licenca_paternidade", afastamentoDoc("licenca_paternidade"), "alerta"],
    ["assuncao_funcao", "ferias", feriasBase, "alerta"],
  ];

  it.each(cenarios)("%s durante %s → %s", (tipoAssunto, _af, b, severidade) => {
    const r = avaliarConsistenciaNbi({
      militarId: MIL, tipoAssunto,
      campos: { DATA_INICIO: "2026-02-05", DATA_FIM: "2026-02-06" },
      dataDocumento: "2026-02-06", base: b,
    });
    const lista = severidade === "bloqueio" ? regras(r).bloqueios : regras(r).alertas;
    expect(lista.some((x) => x.startsWith(`conflito.${tipoAssunto}.`))).toBe(true);
    if (severidade === "alerta") expect(r.bloqueios).toHaveLength(0);
  });

  it("luto e núpcias trazem a ressalva de insuficiência de dados", () => {
    const r = avaliarConsistenciaNbi({
      militarId: MIL, tipoAssunto: "servico_extraordinario",
      campos: { DATA_INICIO: "2026-02-05", DATA_FIM: "2026-02-06" },
      dataDocumento: "2026-02-06", base: afastamentoDoc("luto"),
    });
    expect(r.alertas[0].motivo).toContain("não possui dados suficientes");
    expect(r.alertas[0].confirmavel).toBe(true);
  });

  it("nenhum conflito quando o afastamento vem de rascunho (não é fato ativo)", () => {
    const b = base({
      documentos: [doc({ id: "d-rasc", status: "rascunho", numero: null, assuntos: [assunto({ tipo: "ferias", campos: { DATA_INICIO: "2026-02-01", DATA_FIM: "2026-02-10" } })] })],
    });
    const r = avaliarConsistenciaNbi({
      militarId: MIL, tipoAssunto: "servico_extraordinario",
      campos: { DATA_INICIO: "2026-02-05", DATA_FIM: "2026-02-06" },
      dataDocumento: "2026-02-06", base: b,
    });
    expect(r.bloqueios).toHaveLength(0);
  });

  it("retorno de viagem anterior à saída é bloqueio", () => {
    const r = avaliarConsistenciaNbi({
      militarId: MIL, tipoAssunto: "viagem",
      campos: { DATA_INICIO: "2026-02-10", DATA_RETORNO: "2026-02-08" },
      dataDocumento: "2026-02-11", base: base(),
    });
    expect(regras(r).bloqueios).toContain("cronologia.retorno_antes_saida");
  });

  it("militar inativo não gera pendências institucionais", () => {
    const b = base({ ferias: [ferias("fer-i", "2026-01-01", "2026-01-10", INATIVO)], hoje: "2026-03-01" });
    expect(apresentacoesPendentes(b)).toHaveLength(0);
  });

  it("o próprio documento em edição nunca conflita consigo mesmo", () => {
    const b = base({
      documentos: [doc({ id: "d-self", numero: "051", assuntos: [assunto({ tipo: "ferias", campos: { DATA_INICIO: "2026-02-01", DATA_FIM: "2026-02-10" } })] })],
    });
    const r = avaliarConsistenciaNbi({
      militarId: MIL, tipoAssunto: "servico_extraordinario", documentoId: "d-self",
      campos: { DATA_INICIO: "2026-02-05", DATA_FIM: "2026-02-06" },
      dataDocumento: "2026-02-06", base: b,
    });
    expect(r.bloqueios).toHaveLength(0);
  });
});

// ============================================================
// FASE 7 — Cenário F: documentos redundantes
// ============================================================
describe("12C/F — redundância", () => {
  const campos = { DATA_INICIO: "2026-02-01", DATA_FIM: "2026-02-10" };
  const existente = doc({ id: "d-existe", numero: "060", assuntos: [assunto({ tipo: "ferias", campos })] });

  it("duplicidade exata é alerta confirmável, com documento relacionado", () => {
    const r = avaliarConsistenciaNbi({
      militarId: MIL, tipoAssunto: "ferias", campos,
      dataDocumento: "2026-02-01", base: base({ documentos: [existente] }),
    });
    expect(regras(r).alertas).toContain("redundancia.documento_ativo");
    expect(r.alertas.find((a) => a.regra === "redundancia.documento_ativo")?.confirmavel).toBe(true);
    expect(r.documentosRelacionados.some((x) => x.id === "d-existe")).toBe(true);
  });

  it("assunto semelhante com datas diferentes não é duplicidade", () => {
    const r = avaliarConsistenciaNbi({
      militarId: MIL, tipoAssunto: "ferias",
      campos: { DATA_INICIO: "2026-05-01", DATA_FIM: "2026-05-10" },
      dataDocumento: "2026-05-01", base: base({ documentos: [existente] }),
    });
    expect(regras(r).alertas).not.toContain("redundancia.documento_ativo");
    expect(r.bloqueios).toHaveLength(0);
  });

  it("documento cancelado é apenas informado (sugestão)", () => {
    const cancelado = doc({ id: "d-canc", numero: "061", canceled_at: "2026-02-02T00:00:00Z", assuntos: [assunto({ tipo: "ferias", campos })] });
    const r = avaliarConsistenciaNbi({
      militarId: MIL, tipoAssunto: "ferias", campos,
      dataDocumento: "2026-02-01", base: base({ documentos: [cancelado] }),
    });
    expect(regras(r).sugestoes).toContain("redundancia.documento_cancelado");
    expect(r.bloqueios).toHaveLength(0);
  });

  it("rascunho idêntico não conta como duplicidade ativa", () => {
    const rascunho = doc({ id: "d-rasc2", status: "rascunho", numero: null, assuntos: [assunto({ tipo: "ferias", campos })] });
    const r = avaliarConsistenciaNbi({
      militarId: MIL, tipoAssunto: "ferias", campos,
      dataDocumento: "2026-02-01", base: base({ documentos: [rascunho] }),
    });
    expect(regras(r).alertas).not.toContain("redundancia.documento_ativo");
  });

  // Bloco 12G — duplicidade documental passou a ser alerta confirmável (não bloqueio).
  it("apresentação duplicada para o mesmo afastamento é alerta confirmável", () => {
    const f = ferias("fer-d", "2026-02-01", "2026-02-10");
    const apres = doc({
      id: "d-ap", numero: "062", data_documento: "2026-02-11",
      assuntos: [assunto({ tipo: "apresentacao", ferias_id: "fer-d", campos: { DATA_APRESENTACAO: "2026-02-11" } })],
    });
    const r = avaliarConsistenciaNbi({
      militarId: MIL, tipoAssunto: "apresentacao",
      campos: { DATA_APRESENTACAO: "2026-02-11", FERIAS_ID: "fer-d" },
      dataDocumento: "2026-02-11", base: base({ ferias: [f], documentos: [apres] }),
    });
    expect(regras(r).bloqueios).not.toContain("apresentacao.duplicada");
    const a = r.alertas.find((x) => x.regra === "apresentacao.duplicada");
    expect(a?.confirmavel).toBe(true);
  });

});

// ============================================================
// FASE 9 — regressão dos motores homologados
// ============================================================
describe("12C — regressão dos motores", () => {
  it("todos os motores do registry estão homologados e com metadados", () => {
    for (const m of listarMotores()) {
      expect(m.codigo).toBeTruthy();
      expect(m.tituloDocumento).toBeTruthy();
      expect(m.schema.length).toBeGreaterThan(0);
      expect(["HOMOLOGADO", "EM_HOMOLOGACAO", "EXPERIMENTAL"]).toContain(m.nivelHomologacao);
    }
  });

  it.each([
    "ferias", "apresentacao", "luto", "nupcias", "licenca_paternidade", "viagem",
    "assuncao_funcao", "dispensa_funcao", "servico_extraordinario",
    "dispensa_recompensa", "nomeacao_comissao", "folga_compensatoria",
  ])("motor %s existe e o exemplo cobre o schema declarado", (codigo) => {
    const m = obterMotor(codigo)!;
    expect(m).toBeTruthy();
    const ex = m.exemplo();
    expect(ex.placeholdersEsperados.every((p) => m.schema.includes(p))).toBe(true);
  });

  it("somente estado 'homologado' gera oficial e reserva número", () => {
    expect(podeGerarOficial("homologado")).toBe(true);
    for (const e of ["em_homologacao", "aguardando_exemplar", "bloqueado"]) {
      expect(podeGerarOficial(e)).toBe(false);
      expect(podeReservarNumero(e)).toBe(false);
    }
  });
});

// ============================================================
// FASE 10 — linha do tempo
// ============================================================
describe("12C — linha do tempo", () => {
  const docs: DocumentoBase[] = [];
  for (let ano = 2022; ano <= 2026; ano++) {
    for (let mes = 1; mes <= 6; mes++) {
      const mm = String(mes).padStart(2, "0");
      docs.push(doc({
        id: `t-${ano}-${mm}`, numero: String(mes).padStart(3, "0"), ano,
        data_documento: `${ano}-${mm}-05`,
        assuntos: [assunto({ tipo: "viagem", campos: { DATA_INICIO: `${ano}-${mm}-05`, DATA_RETORNO: `${ano}-${mm}-06` } })],
      }));
    }
  }
  const b = base({ documentos: docs });

  it("ordena cronologicamente e pagina", () => {
    const p1 = montarTimeline(b, MIL, { pagina: 1, porPagina: 10 });
    expect(p1.total).toBe(30);
    expect(p1.eventos).toHaveLength(10);
    expect(p1.eventos[0].data).toBe("2022-01-05");
    const p3 = montarTimeline(b, MIL, { pagina: 3, porPagina: 10 });
    expect(p3.eventos[9].data).toBe("2026-06-05");
  });

  it("aplica recorte por período", () => {
    const r = montarTimeline(b, MIL, { de: "2025-01-01", ate: "2025-12-31", porPagina: 100 });
    expect(r.total).toBe(6);
    expect(r.eventos.every((e) => e.data.startsWith("2025"))).toBe(true);
  });

  it("marca documentos cancelados sem removê-los", () => {
    const cancelado = doc({ id: "t-canc", numero: "099", canceled_at: "2026-07-01T00:00:00Z", assuntos: [assunto({ tipo: "viagem", campos: { DATA_INICIO: "2026-07-01" } })] });
    const r = montarTimeline(base({ documentos: [cancelado] }), MIL);
    expect(r.eventos[0].situacao).toBe("cancelado");
  });

  it("militar sem eventos devolve lista vazia", () => {
    expect(montarTimeline(b, TIT).total).toBe(0);
  });
});

// ============================================================
// FASE 13 — volume
// ============================================================
describe("12C — volume e desempenho", () => {
  const militares = Array.from({ length: 200 }, (_, i) => ({ id: `m-${i}`, nome: `Militar ${i}`, ativo: true }));
  const documentos: DocumentoBase[] = [];
  for (let i = 0; i < 1000; i++) {
    const ano = 2022 + (i % 5);
    const mm = String((i % 12) + 1).padStart(2, "0");
    const dd = String((i % 27) + 1).padStart(2, "0");
    documentos.push(doc({
      id: `v-${i}`, numero: String(i), ano, data_documento: `${ano}-${mm}-${dd}`,
      assuntos: [
        assunto({ tipo: "viagem", militar_id: `m-${i % 200}`, campos: { DATA_INICIO: `${ano}-${mm}-${dd}`, DATA_RETORNO: `${ano}-${mm}-${dd}` } }),
        assunto({ tipo: "folga_compensatoria", subtipo: "previsao", militar_id: `m-${i % 200}`, campos: { QTD_HORAS: "12", mes_referencia_sel: `${ano}-${mm}` } }),
      ],
    }));
  }
  const feriasMassa = Array.from({ length: 500 }, (_, i) => ferias(`f-${i}`, `${2022 + (i % 5)}-0${(i % 9) + 1}-01`, `${2022 + (i % 5)}-0${(i % 9) + 1}-10`, `m-${i % 200}`));
  const substituicoes = Array.from({ length: 200 }, (_, i) => sub({ id: `s-${i}`, substituto_militar_id: `m-${i % 200}`, data_fim_prevista: "2026-12-01" }));
  const b = base({ documentos, ferias: feriasMassa, substituicoes, militares, hoje: "2026-08-01" });

  it("avaliação de consistência com 1.000 documentos < 500ms", () => {
    const t0 = performance.now();
    const r = avaliarConsistenciaNbi({
      militarId: "m-7", tipoAssunto: "servico_extraordinario",
      campos: { DATA_INICIO: "2026-05-02", DATA_FIM: "2026-05-03" },
      dataDocumento: "2026-05-03", base: b,
    });
    const dt = performance.now() - t0;
    expect(r).toBeTruthy();
    expect(dt).toBeLessThan(500);
  });

  it("timeline paginada com histórico de 5 anos < 300ms", () => {
    const t0 = performance.now();
    const r = montarTimeline(b, "m-7", { pagina: 1, porPagina: 20 });
    expect(performance.now() - t0).toBeLessThan(300);
    expect(r.eventos.length).toBeLessThanOrEqual(20);
  });

  it("painéis de pendências rodam em lote < 1000ms", () => {
    const t0 = performance.now();
    apresentacoesPendentes(b);
    substituicoesPendentes(b);
    folgasPrevistas(b);
    expect(performance.now() - t0).toBeLessThan(1000);
  });
});

// ============================================================
// FASE 14 — banco vazio e dados incompletos
// ============================================================
describe("12C — base vazia e dados incompletos", () => {
  const vazia = base({ militares: [] });

  it("base vazia não quebra nenhuma função do motor", () => {
    expect(apresentacoesPendentes(vazia)).toEqual([]);
    expect(substituicoesPendentes(vazia)).toEqual([]);
    expect(folgasPrevistas(vazia)).toEqual([]);
    expect(montarTimeline(vazia, MIL).total).toBe(0);
    const r = avaliarConsistenciaNbi({
      militarId: null, tipoAssunto: "ferias", campos: {}, dataDocumento: "2026-03-01", base: vazia,
    });
    expect(r.bloqueios).toEqual([]);
    expect(r.linhaDoTempo).toEqual([]);
  });

  it("afastamento sem dados suficientes não vira pendência", () => {
    const d = doc({ id: "d-incompleto", assuntos: [assunto({ tipo: "luto", campos: { DATA_INICIO: "2026-01-01" } })] });
    expect(apresentacoesPendentes(base({ documentos: [d], hoje: "2026-06-01" }))).toHaveLength(0);
  });

  it("campos com data inválida são ignorados sem erro", () => {
    const r = avaliarConsistenciaNbi({
      militarId: MIL, tipoAssunto: "ferias",
      campos: { DATA_INICIO: "01/02/2026", DATA_FIM: "" },
      dataDocumento: "2026-02-01", base: base(),
    });
    expect(r.bloqueios).toEqual([]);
  });
});
