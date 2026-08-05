// Bloco 12 — Pendências institucionais (apresentações, substituições, folgas).
// PURO: nunca gera documento, nunca reserva número, nunca altera registros.

import type { Achado, BaseConsistencia, Relacionado } from "./tipos";
import {
  apresentacoesConfirmadas, coletarAfastamentos, dataValida, documentoConfirmado,
  rotuloDocumento, situacaoDocumento, texto,
} from "./base";
import { ROTULO_AFASTAMENTO } from "./matriz";
import { calcularMesesFolga } from "../folgaCompensatoria";

export interface ApresentacaoPendente {
  militar_id: string;
  militarNome: string;
  tipoAfastamento: string;
  inicio: string;
  fim: string;
  dataApresentacao: string;
  ferias_id: string | null;
  documento_origem: string | null;
  origem: string;
}

/**
 * FASE 6 — pendência existe SOMENTE quando: afastamento encerrado, data esperada
 * já alcançada, dados suficientes para calcular a apresentação e nenhuma
 * apresentação ATIVA (documento gerado) vinculada. Rascunho e reservado não
 * satisfazem a pendência, mas um rascunho que contenha o afastamento e a
 * apresentação juntos não gera pendência transitória.
 */
export function apresentacoesPendentes(base: BaseConsistencia): ApresentacaoPendente[] {
  const out: ApresentacaoPendente[] = [];
  const ativos = new Map(base.militares.filter((m) => m.ativo).map((m) => [m.id, m]));
  const confirmadas = apresentacoesConfirmadas(base);

  // Rascunhos/reservados em que o mesmo militar já tem a apresentação sendo preparada
  // junto do afastamento — evita pendência transitória durante a elaboração.
  const emPreparo = new Set<string>();
  for (const d of base.documentos) {
    const sit = situacaoDocumento(d);
    if (sit !== "rascunho" && sit !== "reservado") continue;
    for (const a of d.assuntos) {
      if (a.tipo !== "apresentacao" || !a.militar_id) continue;
      emPreparo.add(`${a.militar_id}|${texto(a.ferias_id)}`);
      const di = dataValida(a.campos.DATA_APRESENTACAO);
      if (di) emPreparo.add(`${a.militar_id}|d:${di}`);
    }
  }

  for (const af of coletarAfastamentos(base)) {
    const militar = ativos.get(af.militar_id);
    if (!militar) continue;
    if (af.fim >= base.hoje) continue;               // afastamento ainda não encerrado
    const esperada = af.apresentacao;
    if (!esperada) continue;                          // dados insuficientes → sem pendência
    if (esperada > base.hoje) continue;               // data esperada ainda não alcançada

    const satisfeita = confirmadas.some((ap) =>
      ap.militar_id === af.militar_id &&
      ((af.ferias_id && ap.ferias_id === af.ferias_id) || (ap.data >= esperada && ap.data <= addMeses(esperada))),
    );
    if (satisfeita) continue;
    if (emPreparo.has(`${af.militar_id}|${af.ferias_id ?? ""}`) || emPreparo.has(`${af.militar_id}|d:${esperada}`)) continue;

    out.push({
      militar_id: af.militar_id,
      militarNome: militar.nome,
      tipoAfastamento: ROTULO_AFASTAMENTO[af.tipo],
      inicio: af.inicio,
      fim: af.fim,
      dataApresentacao: esperada,
      ferias_id: af.ferias_id,
      documento_origem: af.rotuloDocumento,
      origem: af.origem === "banco_ferias" ? "Banco de Férias" : "Documento NBI",
    });
  }
  return out.sort((a, b) => a.dataApresentacao.localeCompare(b.dataApresentacao));
}

/** Janela de tolerância para casar uma apresentação avulsa ao afastamento. */
function addMeses(data: string): string {
  const d = new Date(`${data}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 30);
  return d.toISOString().slice(0, 10);
}

export type EstadoSubstituicao =
  | "aberta_sem_previsao" | "aberta_previsao_futura" | "dispensa_hoje" | "dispensa_atrasada" | "encerrada";

export interface SubstituicaoPendente {
  id: string;
  estado: EstadoSubstituicao;
  funcao: string | null;
  data_inicio: string | null;
  data_fim_prevista: string | null;
  substitutoNome: string | null;
  titularNome: string | null;
  mensagem: string;
  documento_assuncao: string | null;
}

/** FASE 7 — estados das substituições abertas. Assunção futura nunca é atrasada. */
export function substituicoesPendentes(base: BaseConsistencia): SubstituicaoPendente[] {
  const nome = (id: string | null) => base.militares.find((m) => m.id === id)?.nome ?? null;
  const out: SubstituicaoPendente[] = [];
  for (const s of base.substituicoes) {
    if (s.status !== "aberta") continue;
    const prev = s.data_fim_prevista;
    let estado: EstadoSubstituicao;
    let mensagem: string;
    if (!prev) {
      estado = "aberta_sem_previsao";
      mensagem = "Assunção aberta sem previsão de dispensa registrada.";
    } else if (prev === base.hoje) {
      estado = "dispensa_hoje";
      mensagem = "Há uma Assunção aberta com Dispensa prevista para hoje.";
    } else if (prev < base.hoje) {
      estado = "dispensa_atrasada";
      mensagem = `Dispensa prevista para ${prev} ainda não foi gerada.`;
    } else {
      estado = "aberta_previsao_futura";
      mensagem = `Assunção aberta com dispensa prevista para ${prev}.`;
    }
    const doc = s.assuncao_documento_id
      ? base.documentos.find((d) => d.id === s.assuncao_documento_id)
      : null;
    out.push({
      id: s.id,
      estado,
      funcao: s.funcao,
      data_inicio: s.data_inicio,
      data_fim_prevista: prev,
      substitutoNome: nome(s.substituto_militar_id),
      titularNome: nome(s.titular_militar_id),
      mensagem,
      documento_assuncao: doc ? rotuloDocumento(doc) : null,
    });
  }
  return out;
}

export interface FolgaPrevista {
  militar_id: string | null;
  militarNome: string | null;
  horas: string;
  mesReferencia: string;
  mesCompensacao: string;
  anoCompensacao: string;
  realizada: boolean;
  documento: string | null;
  quando: "mes_atual" | "proximo_mes" | "outro";
}

/** FASE 8 — usa o motor homologado do Bloco 11B. Nunca marca atraso. */
export function folgasPrevistas(base: BaseConsistencia): FolgaPrevista[] {
  const out: FolgaPrevista[] = [];
  const mesAtual = base.hoje.slice(0, 7);
  const [ax, mx] = mesAtual.split("-").map((n) => parseInt(n, 10));
  const prox = mx === 12 ? `${ax + 1}-01` : `${ax}-${String(mx + 1).padStart(2, "0")}`;

  for (const d of base.documentos) {
    if (!documentoConfirmado(d)) continue;
    for (const a of d.assuntos) {
      if (a.tipo !== "folga_compensatoria") continue;
      const ref = texto(a.campos.mes_referencia_sel);
      const meses = calcularMesesFolga(ref);
      if (!meses) continue;
      const compNum = ref.split("-").map((n) => parseInt(n, 10));
      const mesComp = compNum[1] === 12
        ? `${compNum[0] + 1}-01`
        : `${compNum[0]}-${String(compNum[1] + 1).padStart(2, "0")}`;
      out.push({
        militar_id: a.militar_id ?? null,
        militarNome: base.militares.find((m) => m.id === a.militar_id)?.nome ?? null,
        horas: texto(a.campos.QTD_HORAS),
        mesReferencia: meses.referencia,
        mesCompensacao: meses.compensacao,
        anoCompensacao: meses.anoCompensacao,
        realizada: (a.subtipo ?? "") === "realizada",
        documento: rotuloDocumento(d),
        quando: mesComp === mesAtual ? "mes_atual" : mesComp === prox ? "proximo_mes" : "outro",
      });
    }
  }
  return out;
}

/** Converte pendências em achados de severidade "sugestao" para o wizard. */
export function sugestoesDoMilitar(base: BaseConsistencia, militarId: string): Achado[] {
  const out: Achado[] = [];
  for (const p of apresentacoesPendentes(base).filter((x) => x.militar_id === militarId)) {
    const rel: Relacionado[] = p.ferias_id ? [{ tipo: "ferias", id: p.ferias_id, rotulo: `${p.tipoAfastamento} ${p.inicio} a ${p.fim}` }] : [];
    out.push({
      regra: "pendencia.apresentacao",
      severidade: "sugestao",
      titulo: `Apresentação pendente para ${p.militarNome}`,
      motivo: `Referente a ${p.tipoAfastamento.toLowerCase()}, encerrado em ${p.fim}; apresentação esperada em ${p.dataApresentacao} e nenhum documento ativo vinculado.`,
      origem: p.origem,
      acaoSugerida: "Gerar apresentação (abre rascunho, sem reservar número).",
      relacionados: rel,
    });
  }
  for (const s of substituicoesPendentes(base).filter((x) => x.substitutoNome && base.militares.some((m) => m.id === militarId))) {
    if (s.estado === "aberta_previsao_futura" || s.estado === "aberta_sem_previsao") continue;
    out.push({
      regra: "pendencia.dispensa",
      severidade: "sugestao",
      titulo: s.mensagem,
      motivo: `Substituição de ${s.funcao ?? "função"} iniciada em ${s.data_inicio ?? "data não informada"}.`,
      origem: "Registro de substituições do módulo NBI",
      acaoSugerida: "Gerar Dispensa pelo fluxo Assunção ⇄ Dispensa já homologado.",
      relacionados: [{ tipo: "substituicao", id: s.id, rotulo: s.funcao ?? "Substituição" }],
    });
  }
  return out;
}
