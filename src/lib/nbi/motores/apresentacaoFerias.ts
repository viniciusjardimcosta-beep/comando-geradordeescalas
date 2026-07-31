// Motor NBI — APRESENTAÇÃO APÓS FÉRIAS. Texto oficial vive apenas em nbi_templates.
import type { ContextoMotor, MotorNbi } from "./tipos";
import { resolverBase, filtrarPlaceholders, validarMilitar, validarCamposTemplate } from "./comum";

const SCHEMA = [
  "NOME", "ID_FUNC", "POSTO_QUADRO", "LOTACAO", "ARTIGO_O_A", "ARTIGO_AO_A",
  "PERIODO", "ANO", "DATA_INICIO", "DATA_FIM",
  "QTD_DIAS", "QTD_DIAS_EXTENSO", "DATA_APRESENTACAO",
];

export const motorApresentacaoFerias: MotorNbi = {
  codigo: "apresentacao",
  tituloUI: "Apresentação após férias",
  tituloDocumento: "APRESENTAÇÃO",
  schema: SCHEMA,

  resolverCampos(ctx) { return resolverBase(ctx); },

  montarPlaceholders(ctx) {
    return filtrarPlaceholders(this.resolverCampos(ctx), SCHEMA, ctx.camposTemplate);
  },

  validar(ctx: ContextoMotor) {
    const out = [...validarMilitar(ctx), ...validarCamposTemplate(ctx)];
    const v = resolverBase(ctx);
    if (!v.DATA_APRESENTACAO && !v.DATA_FIM) out.push("data de apresentação ausente");
    return out;
  },

  exemplo() {
    return {
      referencia: "NBI nº 13/2026 — apresentação após férias",
      contexto: { campos: { PERIODO: "1", DATA_INICIO: "2026-01-05", QTD_DIAS: "10" } },
      placeholdersEsperados: SCHEMA,
    };
  },

  nivelHomologacao: "HOMOLOGADO",
  fonteDocumental: "NBI 13/2026; NBI 19/2025",
  quantidadeExemplares: 3,
  ultimaAuditoria: "2026-07-31",
  homologado_em: "2026-07-31",
  homologado_por: "Bloco 8A",
  observacoes: "Subtipos (curso, luto, LPA) serão motores próprios em ondas futuras.",
};
