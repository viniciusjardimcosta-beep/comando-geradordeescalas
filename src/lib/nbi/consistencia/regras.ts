// Bloco 12 — Regras puras: cronologia, conflitos de afastamento e redundância.
// Nenhuma regra grava dados, reserva número ou gera documento.

import type { Achado, EntradaConsistencia, Relacionado } from "./tipos";
import {
  coletarAfastamentos, dataValida, documentoConfirmado, rotuloDocumento,
  situacaoDocumento, sobrepoe, texto, diffDias,
} from "./base";
import { ROTULO_AFASTAMENTO, ressalvaInsuficiencia, severidadeConflito } from "./matriz";
import { assinaturaDeAssunto } from "../duplicidade";

const ORIGEM_FORM = "Campos informados neste assunto";

function achado(a: Achado): Achado {
  return a;
}

// ---------------------------------------------------------------
// FASE 4 — regras cronológicas gerais
// ---------------------------------------------------------------
export function regrasCronologicas(e: EntradaConsistencia): Achado[] {
  const out: Achado[] = [];
  const c = e.campos;
  const inicio = dataValida(c.DATA_INICIO);
  const fim = dataValida(c.DATA_FIM);
  const apresentacao = dataValida(c.DATA_APRESENTACAO);
  const retorno = dataValida(c.DATA_RETORNO);

  if (inicio && fim && fim < inicio) {
    out.push(achado({
      regra: "cronologia.fim_antes_inicio",
      severidade: "bloqueio",
      titulo: "Data final anterior à data inicial",
      motivo: `A data final (${fim}) é anterior à data inicial (${inicio}).`,
      origem: ORIGEM_FORM,
      acaoSugerida: "Revisar o período informado.",
      relacionados: [],
    }));
  }

  if (e.tipoAssunto === "viagem" && inicio && retorno && retorno < inicio) {
    out.push(achado({
      regra: "cronologia.retorno_antes_saida",
      severidade: "bloqueio",
      titulo: "Retorno anterior à saída",
      motivo: `O retorno (${retorno}) é anterior à data de saída (${inicio}).`,
      origem: ORIGEM_FORM,
      acaoSugerida: "Corrigir a data de retorno da viagem.",
      relacionados: [],
    }));
  }

  if (apresentacao && fim && apresentacao <= fim) {
    out.push(achado({
      regra: "cronologia.apresentacao_antes_do_fim",
      severidade: "bloqueio",
      titulo: "Apresentação anterior ao término do afastamento",
      motivo: `A apresentação (${apresentacao}) deve ser posterior ao último dia do afastamento (${fim}).`,
      origem: ORIGEM_FORM,
      acaoSugerida: "Ajustar a data de apresentação para o dia seguinte ao término.",
      relacionados: [],
    }));
  }

  // Regra 7 — nota muito posterior ao fato (alerta, nunca bloqueio).
  const dataFato = inicio ?? apresentacao;
  if (dataFato && e.dataDocumento) {
    const dias = diffDias(dataFato, e.dataDocumento);
    if (dias > 60) {
      out.push(achado({
        regra: "cronologia.nota_muito_posterior",
        severidade: "alerta",
        titulo: "Documento emitido muito tempo após o fato",
        motivo: `A data da nota (${e.dataDocumento}) está ${dias} dias após o fato (${dataFato}).`,
        origem: ORIGEM_FORM,
        acaoSugerida: "Confirmar a data do documento ou a data do fato.",
        relacionados: [],
        confirmavel: true,
      }));
    }
  }
  return out;
}

// ---------------------------------------------------------------
// FASE 4 (3, 8, 9) — Assunção ⇄ Dispensa
// ---------------------------------------------------------------
export function regrasSubstituicao(e: EntradaConsistencia): Achado[] {
  const out: Achado[] = [];
  if (e.tipoAssunto !== "dispensa_funcao") return out;
  const sub = e.base.substituicoes.find((s) => s.id === e.substituicaoId);
  if (!sub) return out;

  const rel: Relacionado[] = [{ tipo: "substituicao", id: sub.id, rotulo: sub.funcao ?? "Substituição" }];
  const inicioDispensa = dataValida(e.campos.DATA_INICIO);

  if (sub.status === "encerrada") {
    out.push(achado({
      regra: "substituicao.encerrada_reutilizada",
      severidade: "bloqueio",
      titulo: "Substituição já encerrada",
      motivo: `A substituição de ${sub.funcao ?? "função"} já foi encerrada${sub.data_fim_efetiva ? ` em ${sub.data_fim_efetiva}` : ""} e não pode ser reutilizada.`,
      origem: "Registro de substituições do módulo NBI",
      acaoSugerida: "Selecionar uma assunção ainda aberta.",
      relacionados: rel,
    }));
  }

  if (inicioDispensa && sub.data_inicio && inicioDispensa < sub.data_inicio) {
    out.push(achado({
      regra: "substituicao.dispensa_antes_assuncao",
      severidade: "bloqueio",
      titulo: "Dispensa anterior à assunção",
      motivo: `A dispensa (${inicioDispensa}) é anterior ao início da assunção (${sub.data_inicio}).`,
      origem: "Registro de substituições do módulo NBI",
      acaoSugerida: "Corrigir a data da dispensa.",
      relacionados: rel,
    }));
  }

  if (sub.assuncao_documento_id) {
    const doc = e.base.documentos.find((d) => d.id === sub.assuncao_documento_id);
    if (doc && situacaoDocumento(doc) === "cancelado") {
      out.push(achado({
        regra: "substituicao.origem_cancelada",
        severidade: "bloqueio",
        titulo: "Documento de origem cancelado",
        motivo: `A assunção vinculada consta na ${rotuloDocumento(doc)}, que está cancelada.`,
        origem: "Histórico de documentos NBI",
        acaoSugerida: "Emitir nova assunção antes da dispensa.",
        relacionados: [...rel, { tipo: "documento", id: doc.id, rotulo: rotuloDocumento(doc) }],
      }));
    }
  }
  return out;
}

// ---------------------------------------------------------------
// FASE 5 — conflitos de afastamento
// ---------------------------------------------------------------
export function regrasConflitoAfastamento(e: EntradaConsistencia): Achado[] {
  const out: Achado[] = [];
  if (!e.militarId) return out;

  const inicio = dataValida(e.campos.DATA_INICIO);
  if (!inicio) return out;
  const fim = dataValida(e.campos.DATA_FIM) ?? dataValida(e.campos.DATA_RETORNO) ?? inicio;

  const afastamentos = coletarAfastamentos(e.base, e.militarId)
    .filter((af) => af.documento_id !== e.documentoId);

  for (const af of afastamentos) {
    if (!sobrepoe(inicio, fim, af.inicio, af.fim)) continue;
    const sev = severidadeConflito(e.tipoAssunto, af.tipo);
    if (!sev) continue;
    const ressalva = ressalvaInsuficiencia(af.tipo);
    const origem = af.origem === "banco_ferias"
      ? "Banco de Férias (registro do usuário)"
      : `Documento NBI ativo (${af.rotuloDocumento ?? "sem número"})`;
    const relacionados: Relacionado[] = [];
    if (af.ferias_id) relacionados.push({ tipo: "ferias", id: af.ferias_id, rotulo: `${ROTULO_AFASTAMENTO[af.tipo]} ${af.inicio} a ${af.fim}` });
    if (af.documento_id) relacionados.push({ tipo: "documento", id: af.documento_id, rotulo: af.rotuloDocumento ?? "documento" });

    const ehServicoExecutado = e.tipoAssunto === "servico_extraordinario";
    out.push(achado({
      regra: `conflito.${e.tipoAssunto}.${af.tipo}`,
      severidade: sev,
      titulo: ehServicoExecutado
        ? "Afastamento dentro do período de referência do serviço extraordinário"
        : `Militar em ${ROTULO_AFASTAMENTO[af.tipo].toLowerCase()} no período selecionado`,
      motivo: ehServicoExecutado
        ? `Há afastamento registrado dentro do período de referência do serviço extraordinário (${ROTULO_AFASTAMENTO[af.tipo].toLowerCase()} de ${af.inicio} a ${af.fim}). Como o período informado representa o mês/período de referência e não os dias exatos de execução das horas, confirme se as horas foram realizadas fora do afastamento.${ressalva ? ` ${ressalva}` : ""}`
        : `O período informado (${inicio} a ${fim}) se sobrepõe a ${ROTULO_AFASTAMENTO[af.tipo].toLowerCase()} de ${af.inicio} a ${af.fim}.${ressalva ? ` ${ressalva}` : ""}`,
      origem,
      acaoSugerida: sev === "bloqueio"
        ? "Alterar o período ou o militar antes de gerar."
        : ehServicoExecutado
          ? "Confirmar que as horas foram realizadas fora do afastamento."
          : "Revisar o período e confirmar se o fato realmente ocorreu.",
      relacionados,
      confirmavel: sev === "alerta",
    }));
  }

  // Assunção: substituto afastado no início (alerta, conforme matriz).
  if (e.tipoAssunto === "assuncao_funcao" && e.militarTitularId) {
    const doTitular = coletarAfastamentos(e.base, e.militarTitularId)
      .filter((af) => sobrepoe(inicio, fim, af.inicio, af.fim));
    if (doTitular.length === 0) return out;
  }

  return out;
}

// ---------------------------------------------------------------
// FASE 4 (2) — apresentação validada contra o afastamento de origem
// ---------------------------------------------------------------
export function regrasApresentacao(e: EntradaConsistencia): Achado[] {
  const out: Achado[] = [];
  if (e.tipoAssunto !== "apresentacao" || !e.militarId) return out;
  const dataApres = dataValida(e.campos.DATA_APRESENTACAO) ?? dataValida(e.campos.DATA_INICIO);
  if (!dataApres) return out;

  const afastamentos = coletarAfastamentos(e.base, e.militarId);
  const feriasId = texto(e.campos.ferias_id);
  // 12C — bug reproduzido: quando a apresentação cai DENTRO de um afastamento
  // ainda em curso, esse afastamento é a origem (e o caso é bloqueio). Antes,
  // só afastamentos já encerrados eram considerados e a regra ficava silenciosa.
  const origem = feriasId
    ? afastamentos.find((af) => af.ferias_id === feriasId)
    : afastamentos.find((af) => af.inicio <= dataApres && dataApres <= af.fim)
      ?? afastamentos.filter((af) => af.fim < dataApres).slice(-1)[0];


  if (!origem) return out;

  if (dataApres <= origem.fim) {
    out.push(achado({
      regra: "apresentacao.antes_do_fim",
      severidade: "bloqueio",
      titulo: "Apresentação anterior ao término do afastamento",
      motivo: `A apresentação (${dataApres}) ocorre antes ou no último dia do afastamento (${origem.inicio} a ${origem.fim}).`,
      origem: origem.origem === "banco_ferias" ? "Banco de Férias (registro do usuário)" : `Documento NBI (${origem.rotuloDocumento})`,
      acaoSugerida: "Ajustar a apresentação para depois do término do afastamento.",
      relacionados: origem.ferias_id ? [{ tipo: "ferias", id: origem.ferias_id, rotulo: `${ROTULO_AFASTAMENTO[origem.tipo]} ${origem.inicio} a ${origem.fim}` }] : [],
    }));
  }

  // Duas apresentações vinculadas ao mesmo afastamento.
  const jaExiste = e.base.documentos.filter((d) =>
    documentoConfirmado(d) && d.id !== e.documentoId &&
    d.assuntos.some((a) => a.tipo === "apresentacao" && a.militar_id === e.militarId &&
      ((origem.ferias_id && texto(a.ferias_id) === origem.ferias_id) ||
        dataValida(a.campos.DATA_APRESENTACAO) === dataApres)),
  );
  for (const d of jaExiste) {
    out.push(achado({
      regra: "apresentacao.duplicada",
      severidade: "bloqueio",
      titulo: "Já existe apresentação vinculada a este afastamento",
      motivo: `A ${rotuloDocumento(d)} já registra a apresentação deste militar para o mesmo afastamento.`,
      origem: "Histórico de documentos NBI",
      acaoSugerida: "Abrir o documento existente ou confirmar a duplicação intencional.",
      relacionados: [{ tipo: "documento", id: d.id, rotulo: rotuloDocumento(d) }],
    }));
  }
  return out;
}

// ---------------------------------------------------------------
// FASE 9 — documentos redundantes (reutiliza a assinatura homologada 10C)
// ---------------------------------------------------------------
export function regrasRedundancia(e: EntradaConsistencia): Achado[] {
  const out: Achado[] = [];
  if (!e.militarId) return out;
  const alvo = assinaturaDeAssunto({
    id: "atual",
    tipo: e.tipoAssunto,
    militar_id: e.militarId,
    militar_titular_id: e.militarTitularId ?? null,
    substituicao_id: e.substituicaoId ?? null,
    campos: e.campos as Record<string, string | boolean>,
  });

  for (const d of e.base.documentos) {
    if (d.id === e.documentoId) continue;
    const sit = situacaoDocumento(d);
    if (sit === "rascunho" || sit === "reservado") continue; // não são documentos oficiais ativos
    for (const a of d.assuntos) {
      const sig = assinaturaDeAssunto({
        id: `${d.id}`,
        tipo: a.tipo,
        militar_id: a.militar_id ?? null,
        militar_titular_id: a.militar_titular_id ?? null,
        substituicao_id: a.substituicao_id ?? null,
        campos: a.campos as Record<string, string | boolean>,
      });
      if (sig !== alvo) continue;
      const cancelado = sit === "cancelado";
      out.push(achado({
        regra: cancelado ? "redundancia.documento_cancelado" : "redundancia.documento_ativo",
        severidade: cancelado ? "sugestao" : "alerta",
        titulo: cancelado
          ? "Existe documento cancelado referente a este fato"
          : "Já existe uma NBI referente a este fato",
        motivo: cancelado
          ? `A ${rotuloDocumento(d)} tratava do mesmo fato, mas está cancelada — não conta como duplicidade ativa.`
          : `A ${rotuloDocumento(d)} de ${d.data_documento} já registra o mesmo tipo, militar, período e origem.`,
        origem: "Histórico de documentos NBI (assinatura por motor)",
        acaoSugerida: cancelado ? "Apenas conferir o histórico." : "Visualizar o documento existente, voltar ou duplicar mesmo assim com confirmação.",
        relacionados: [{ tipo: "documento", id: d.id, rotulo: `${rotuloDocumento(d)} · ${sit}` }],
        confirmavel: !cancelado,
      }));
      break;
    }
  }
  return out;
}
