// Contratos comuns dos motores NBI (Bloco 8A).
// Nenhum texto oficial vive aqui: o texto continua exclusivamente em nbi_templates.
// O motor apenas resolve/valida campos e entrega placeholders.

import type { MilitarNbi } from "@/utils/nbi";

export type NivelHomologacao = "HOMOLOGADO" | "EM_HOMOLOGACAO" | "EXPERIMENTAL";

export interface CampoTemplate {
  chave: string;
  label: string;
  tipo: string;
  obrigatorio?: boolean;
  obrigatorio_se?: string;
  origem?: string;
  auto?: string;
  default?: unknown;
}

export interface ContextoMotor {
  /** Valores brutos informados no wizard (chaves de placeholder, sem acento). */
  campos: Record<string, string | boolean>;
  /** Militar objeto da nota. */
  militar: MilitarNbi | null;
  /** Titular (apenas assuntos de função). */
  titular: MilitarNbi | null;
  /** Definição de campos vinda de nbi_templates.campos. */
  camposTemplate: CampoTemplate[];
}

export interface ExemploMotor {
  /** Documento real que serviu de referência (uso interno/auditoria). */
  referencia: string;
  contexto: Pick<ContextoMotor, "campos">;
  placeholdersEsperados: string[];
}

export interface MotorNbi {
  codigo: string;
  tituloUI: string;
  tituloDocumento: string;
  /** Chaves de placeholder que este motor conhece. Nunca inclui de outro assunto. */
  schema: string[];
  validar(ctx: ContextoMotor): string[];
  resolverCampos(ctx: ContextoMotor): Record<string, string>;
  montarPlaceholders(ctx: ContextoMotor): Record<string, string>;
  exemplo(): ExemploMotor;

  // Metadados internos de homologação
  nivelHomologacao: NivelHomologacao;
  fonteDocumental: string;
  quantidadeExemplares: number;
  ultimaAuditoria: string;
  homologado_em: string | null;
  homologado_por: string | null;
  observacoes: string;
}
