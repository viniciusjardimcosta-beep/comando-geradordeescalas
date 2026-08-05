// Bloco 12 — Linha do tempo documental do militar.
// PURA e com recorte por período/paginação (condição 5): a timeline nunca
// carrega indefinidamente todo o histórico do usuário.

import type { BaseConsistencia, EventoTimeline } from "./tipos";
import { coletarAfastamentos, dataValida, rotuloDocumento, situacaoDocumento, texto } from "./base";

export interface OpcoesTimeline {
  /** Recorte inclusivo (YYYY-MM-DD). */
  de?: string | null;
  ate?: string | null;
  /** Paginação — página 1-based. */
  pagina?: number;
  porPagina?: number;
}

const ROTULO_TIPO: Record<string, string> = {
  ferias: "Férias",
  apresentacao: "Apresentação",
  licenca_paternidade: "Licença-paternidade",
  luto: "Luto",
  nupcias: "Núpcias",
  viagem: "Viagem a serviço",
  assuncao_funcao: "Assunção de função",
  dispensa_funcao: "Dispensa de função",
  servico_extraordinario: "Serviço extraordinário",
  servico_extraordinario_convocacao: "Serviço extraordinário (convocação)",
  dispensa_recompensa: "Dispensa por recompensa",
  nomeacao_comissao: "Nomeação de comissão",
  folga_compensatoria: "Folga compensatória",
};

export interface ResultadoTimeline {
  eventos: EventoTimeline[];
  total: number;
  pagina: number;
  porPagina: number;
}

export function montarTimeline(
  base: BaseConsistencia,
  militarId: string,
  opcoes: OpcoesTimeline = {},
): ResultadoTimeline {
  const eventos: EventoTimeline[] = [];

  // 1) Afastamentos já deduplicados (banco de férias é fonte primária das datas).
  for (const af of coletarAfastamentos(base, militarId)) {
    eventos.push({
      chave: `af:${af.ferias_id ?? af.documento_id}:${af.inicio}`,
      data: af.inicio,
      dataFim: af.fim,
      assunto: ROTULO_TIPO[af.tipo] ?? af.tipo,
      tipo: af.tipo,
      numeroNbi: af.rotuloDocumento,
      situacao: af.documento_id ? "gerado" : "registro",
      vinculo: af.apresentacao ? `Apresentação prevista: ${af.apresentacao}` : null,
      origem: af.origem === "banco_ferias"
        ? (af.documento_id ? "Banco de Férias + comprovação documental" : "Banco de Férias")
        : "Documento NBI",
      documento_id: af.documento_id,
    });
  }

  const idsAfastamentoDocumentados = new Set(
    coletarAfastamentos(base, militarId)
      .filter((a) => a.documento_id)
      .map((a) => `${a.documento_id}:${a.tipo}:${a.inicio}`),
  );

  // 2) Demais assuntos documentais (inclusive cancelados, claramente marcados).
  for (const d of base.documentos) {
    const sit = situacaoDocumento(d);
    if (sit === "rascunho") continue; // em elaboração: não é fato documental
    for (const a of d.assuntos) {
      if (a.militar_id !== militarId) continue;
      const inicio = dataValida(a.campos.DATA_INICIO)
        ?? dataValida(a.campos.DATA_APRESENTACAO)
        ?? d.data_documento;
      if (sit !== "cancelado" && idsAfastamentoDocumentados.has(`${d.id}:${a.tipo}:${inicio}`)) continue;
      const sub = a.substituicao_id ? base.substituicoes.find((s) => s.id === a.substituicao_id) : null;
      eventos.push({
        chave: `doc:${d.id}:${a.tipo}:${inicio}`,
        data: inicio,
        dataFim: dataValida(a.campos.DATA_FIM) ?? dataValida(a.campos.DATA_RETORNO),
        assunto: texto(a.titulo) || ROTULO_TIPO[a.tipo] || a.tipo,
        tipo: a.tipo,
        numeroNbi: rotuloDocumento(d),
        situacao: sit,
        vinculo: sub ? `${sub.funcao ?? "Função"} · substituição ${sub.status}` : null,
        origem: "Documento NBI",
        documento_id: d.id,
      });
    }
  }

  let lista = eventos.sort((a, b) => a.data.localeCompare(b.data) || a.assunto.localeCompare(b.assunto));
  if (opcoes.de) lista = lista.filter((e) => (e.dataFim ?? e.data) >= opcoes.de!);
  if (opcoes.ate) lista = lista.filter((e) => e.data <= opcoes.ate!);

  const total = lista.length;
  const porPagina = opcoes.porPagina && opcoes.porPagina > 0 ? opcoes.porPagina : 50;
  const pagina = opcoes.pagina && opcoes.pagina > 0 ? opcoes.pagina : 1;
  const ini = (pagina - 1) * porPagina;
  return { eventos: lista.slice(ini, ini + porPagina), total, pagina, porPagina };
}
