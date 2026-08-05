// Motor NBI — APRESENTAÇÃO (agregador). Texto oficial vive apenas em nbi_templates.
// O operador nunca escolhe redação: escolhe a ORIGEM do afastamento e o motor
// seleciona o template oficial correspondente.
import type { ContextoMotor, MotorNbi } from "./tipos";
import { resolverBase, filtrarPlaceholders, validarMilitar, validarCamposTemplate } from "./comum";

const SCHEMA = [
  "NOME", "ID_FUNC", "POSTO_QUADRO", "LOTACAO", "ARTIGO_O_A", "ARTIGO_AO_A",
  "PERIODO", "ANO", "DATA_INICIO", "DATA_FIM",
  "QTD_DIAS", "QTD_DIAS_EXTENSO", "DATA_APRESENTACAO",
];

export interface SubtipoApresentacao {
  id: string;
  label: string;
  /** Linha de nbi_templates que contém a redação oficial. */
  template: string;
  /** Assunto de afastamento que origina esta apresentação. */
  origem: string;
  /** Exemplar oficial disponível. */
  homologado: boolean;
}

export const SUBTIPOS_APRESENTACAO: SubtipoApresentacao[] = [
  { id: "ferias", label: "Após férias", template: "apresentacao", origem: "ferias", homologado: true },
  { id: "nupcias", label: "Após núpcias", template: "apresentacao_nupcias", origem: "nupcias", homologado: true },
  { id: "luto", label: "Após luto", template: "apresentacao_luto", origem: "luto", homologado: true },
  {
    id: "licenca_paternidade", label: "Após licença-paternidade",
    template: "apresentacao_paternidade", origem: "licenca_paternidade", homologado: false,
  },
];

export const SUBTIPO_APRESENTACAO_PADRAO = "ferias";

export function subtipoApresentacao(ctx: ContextoMotor): SubtipoApresentacao {
  const id = String(ctx.campos.SUBTIPO ?? "").trim() || SUBTIPO_APRESENTACAO_PADRAO;
  return SUBTIPOS_APRESENTACAO.find((s) => s.id === id) ?? SUBTIPOS_APRESENTACAO[0];
}

/** Origem de afastamento → subtipo de apresentação. */
export function subtipoPorOrigem(codigoAfastamento: string): SubtipoApresentacao | null {
  return SUBTIPOS_APRESENTACAO.find((s) => s.origem === codigoAfastamento) ?? null;
}

/** Chaves exclusivas da redação de férias (não existem nas demais variantes). */
const CHAVES_SO_FERIAS = new Set(["PERIODO", "ANO"]);

/** O campo pertence ao subtipo selecionado? */
export function campoDoSubtipoApresentacao(subtipo: string, chave: string): boolean {
  if (subtipo === "ferias") return true;
  return !CHAVES_SO_FERIAS.has(chave.toUpperCase());
}

function ctxDoSubtipo(ctx: ContextoMotor): ContextoMotor {
  const s = subtipoApresentacao(ctx);
  return {
    ...ctx,
    camposTemplate: ctx.camposTemplate.filter((c) => campoDoSubtipoApresentacao(s.id, c.chave)),
  };
}

export const motorApresentacao: MotorNbi = {
  codigo: "apresentacao",
  tituloUI: "Apresentação",
  tituloDocumento: "APRESENTAÇÃO",
  schema: SCHEMA,

  codigoTemplateEfetivo(ctx) {
    return subtipoApresentacao(ctx).template;
  },

  resolverCampos(ctx) {
    const v = resolverBase(ctxDoSubtipo(ctx));
    if (subtipoApresentacao(ctx).id !== "ferias") {
      delete v.PERIODO;
      delete v.ANO;
    }
    return v;
  },

  montarPlaceholders(ctx) {
    return filtrarPlaceholders(this.resolverCampos(ctx), SCHEMA, ctxDoSubtipo(ctx).camposTemplate);
  },

  validar(ctx: ContextoMotor) {
    const s = subtipoApresentacao(ctx);
    const alvo = ctxDoSubtipo(ctx);
    const out = [...validarMilitar(alvo), ...validarCamposTemplate(alvo)];
    if (!s.homologado) {
      out.push(`apresentação "${s.label}": aguardando exemplar oficial — redação não homologada`);
    }
    const v = this.resolverCampos(ctx);
    if (!v.DATA_APRESENTACAO && !v.DATA_FIM) out.push("data de apresentação ausente");
    if (!v.QTD_DIAS) out.push("quantidade de dias do afastamento ausente");
    return out;
  },

  exemplo() {
    return {
      referencia: "NBI nº 28/2025 (núpcias); exemplar oficial de LUTO; NBI nº 13/2026 (férias)",
      contexto: { campos: { SUBTIPO: "nupcias", DATA_APRESENTACAO: "2025-11-01", QTD_DIAS: "8" } },
      placeholdersEsperados: SCHEMA,
    };
  },

  nivelHomologacao: "HOMOLOGADO",
  fonteDocumental: "NBI 13/2026; NBI 19/2025; NBI 28/2025; exemplar oficial de LUTO",
  quantidadeExemplares: 5,
  ultimaAuditoria: "2026-08-05",
  homologado_em: "2026-08-05",
  homologado_por: "Bloco 11A",
  observacoes: "Agregador: título sempre APRESENTAÇÃO; a redação vem do template do subtipo. Licença-paternidade permanece aguardando exemplar oficial.",
};
