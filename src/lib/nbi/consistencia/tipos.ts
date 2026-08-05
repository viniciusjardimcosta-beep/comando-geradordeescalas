// Bloco 12 — Contratos do motor de consistência institucional NBI.
// Camada PURA: nada aqui consulta banco, grava dados ou gera documentos.
// Nenhum texto oficial vive aqui.

export type Severidade = "bloqueio" | "alerta" | "sugestao";

/** Situação documental conforme regra institucional acordada no Bloco 12. */
export type StatusDocumento = "rascunho" | "reservado" | "gerado" | "cancelado";

export interface Relacionado {
  tipo: "documento" | "ferias" | "substituicao" | "assunto" | "militar";
  id: string;
  rotulo: string;
}

/**
 * Todo achado declara severidade, origem do dado, registro relacionado,
 * motivo da conclusão e ação sugerida (condição 6 da autorização).
 */
export interface Achado {
  regra: string;
  severidade: Severidade;
  titulo: string;
  motivo: string;
  origem: string;
  acaoSugerida: string;
  relacionados: Relacionado[];
  /** Alerta que o operador pode confirmar explicitamente para prosseguir. */
  confirmavel?: boolean;
}

export interface AssuntoSnapshot {
  tipo: string;
  subtipo?: string | null;
  titulo?: string | null;
  militar_id?: string | null;
  militar_titular_id?: string | null;
  ferias_id?: string | null;
  substituicao_id?: string | null;
  campos: Record<string, string | boolean | null | undefined>;
}

export interface DocumentoBase {
  id: string;
  numero: string | null;
  ano: number | null;
  data_documento: string;
  status: string;
  canceled_at: string | null;
  created_at?: string | null;
  assuntos: AssuntoSnapshot[];
}

export interface FeriasBase {
  id: string;
  militar_id: string;
  ano: number;
  periodo: number;
  data_inicio: string;
  data_fim: string;
}

export interface SubstituicaoBase {
  id: string;
  status: string;
  funcao: string | null;
  data_inicio: string | null;
  data_fim_prevista: string | null;
  data_fim_efetiva: string | null;
  substituto_militar_id: string | null;
  titular_militar_id: string | null;
  assuncao_documento_id: string | null;
  dispensa_documento_id: string | null;
}

export interface MilitarBase {
  id: string;
  nome: string;
  ativo: boolean;
  matricula?: string | null;
}

/** Base carregada em LOTE — uma vez por tela, nunca por card ou por assunto. */
export interface BaseConsistencia {
  documentos: DocumentoBase[];
  ferias: FeriasBase[];
  substituicoes: SubstituicaoBase[];
  militares: MilitarBase[];
  /** Data de referência (YYYY-MM-DD) — injetada, nunca lida do relógio dentro das regras. */
  hoje: string;
}

export type OrigemAfastamento = "banco_ferias" | "documento_nbi";

export interface Afastamento {
  tipo: "ferias" | "licenca_paternidade" | "luto" | "nupcias";
  militar_id: string;
  inicio: string;
  fim: string;
  apresentacao: string | null;
  origem: OrigemAfastamento;
  ferias_id: string | null;
  documento_id: string | null;
  rotuloDocumento: string | null;
}

export interface EventoTimeline {
  chave: string;
  data: string;
  dataFim: string | null;
  assunto: string;
  tipo: string;
  numeroNbi: string | null;
  situacao: StatusDocumento | "registro";
  vinculo: string | null;
  origem: string;
  documento_id: string | null;
}

export interface EntradaConsistencia {
  militarId: string | null;
  tipoAssunto: string;
  subtipo?: string | null;
  campos: Record<string, string | boolean | null | undefined>;
  dataDocumento: string;
  /** Documento em edição — seus próprios assuntos nunca geram conflito consigo. */
  documentoId?: string | null;
  substituicaoId?: string | null;
  militarTitularId?: string | null;
  base: BaseConsistencia;
}

export interface ResultadoConsistencia {
  bloqueios: Achado[];
  alertas: Achado[];
  sugestoes: Achado[];
  documentosRelacionados: Relacionado[];
  linhaDoTempo: EventoTimeline[];
}
