// RF-08 — Arquitetura preparatória do "campo inteligente" do módulo NBI.
//
// NADA aqui é executado pelo wizard hoje: este arquivo define apenas o
// contrato estável que uma futura interpretação por IA deverá cumprir para
// pré-montar um assunto a partir de uma frase livre, por exemplo:
//
//   "Primeiro período de férias do Soldado Silva"
//
// O botão "Adicionar assunto" continua sendo o caminho oficial e obrigatório.
// Um interpretador só poderá ser plugado depois de homologado, e nunca
// poderá gerar documento sem passar pela mesma validação dos motores.

/** Militar candidato identificado na frase. */
export interface MilitarSugerido {
  id: string;
  nome: string;
  /** 0..1 — confiança da identificação. */
  confianca: number;
}

/** Resultado de uma interpretação de frase livre. */
export interface InterpretacaoAssunto {
  /** Código do template/motor sugerido (ex.: "ferias"). Null = não identificado. */
  tipo: string | null;
  /** Militares candidatos, do mais provável ao menos provável. */
  militares: MilitarSugerido[];
  /** Valores de placeholders já deduzidos (ex.: { PERIODO: "1" }). */
  campos: Record<string, string>;
  /** 0..1 — confiança global da interpretação. */
  confianca: number;
  /** Pontos que o operador precisa confirmar antes de usar a sugestão. */
  pendencias: string[];
}

export interface ContextoInterpretacao {
  /** Militares ativos da unidade, usados para casar nomes. */
  militares: Array<{ id: string; nome: string; posto_graduacao: string | null; matricula: string | null }>;
  /** Data de referência da nota (ISO), para resolver ano/período. */
  dataDocumento?: string;
}

/**
 * Contrato do interpretador. Implementações futuras (regex avançada,
 * IA no gateway, ou híbrido) devem apenas satisfazer esta interface.
 */
export interface InterpretadorNbi {
  nome: string;
  interpretar(frase: string, ctx: ContextoInterpretacao): Promise<InterpretacaoAssunto>;
}

/** Resultado neutro — usado enquanto nenhum interpretador estiver homologado. */
export function interpretacaoVazia(): InterpretacaoAssunto {
  return { tipo: null, militares: [], campos: {}, confianca: 0, pendencias: [] };
}

let interpretadorAtivo: InterpretadorNbi | null = null;

/** Registra o interpretador homologado (nenhum por padrão). */
export function registrarInterpretador(i: InterpretadorNbi | null): void {
  interpretadorAtivo = i;
}

export function interpretadorDisponivel(): boolean {
  return interpretadorAtivo !== null;
}

/** Ponto único de entrada. Hoje sempre devolve resultado neutro. */
export async function interpretarFrase(
  frase: string,
  ctx: ContextoInterpretacao,
): Promise<InterpretacaoAssunto> {
  if (!interpretadorAtivo) return interpretacaoVazia();
  return interpretadorAtivo.interpretar(frase, ctx);
}
