// Motor NBI — FÉRIAS. Texto oficial vive apenas em nbi_templates.
import type { ContextoMotor, MotorNbi } from "./tipos";
import { resolverBase, filtrarPlaceholders, validarMilitar, validarCamposTemplate } from "./comum";

const SCHEMA = [
  "NOME", "ID_FUNC", "POSTO_QUADRO", "LOTACAO", "ARTIGO_O_A", "ARTIGO_AO_A",
  "PERIODO", "ANO", "DATA_INICIO", "DATA_FIM",
  "QTD_DIAS", "QTD_DIAS_EXTENSO", "DATA_APRESENTACAO",
];

export const motorFerias: MotorNbi = {
  codigo: "ferias",
  tituloUI: "Férias",
  tituloDocumento: "FÉRIAS",
  schema: SCHEMA,

  resolverCampos(ctx) { return resolverBase(ctx); },

  montarPlaceholders(ctx) {
    return filtrarPlaceholders(this.resolverCampos(ctx), SCHEMA, ctx.camposTemplate);
  },

  validar(ctx: ContextoMotor) {
    const out = [...validarMilitar(ctx), ...validarCamposTemplate(ctx)];
    const v = resolverBase(ctx);
    if (!v.DATA_INICIO) out.push("data de início do período de férias ausente");
    if (!v.DATA_FIM) out.push("informe a quantidade de dias ou a data fim das férias");
    return out;
  },

  exemplo() {
    return {
      referencia: "NBI nº 19/2025 — item de férias",
      contexto: { campos: { PERIODO: "1", DATA_INICIO: "2025-07-01", QTD_DIAS: "10" } },
      placeholdersEsperados: SCHEMA,
    };
  },

  nivelHomologacao: "HOMOLOGADO",
  fonteDocumental: "NBI 19/2025; NBI 13/2026",
  quantidadeExemplares: 4,
  ultimaAuditoria: "2026-07-31",
  homologado_em: "2026-07-31",
  homologado_por: "Bloco 8A",
  observacoes: "Data de apresentação sempre derivada de DATA_FIM + 1 dia.",
};
