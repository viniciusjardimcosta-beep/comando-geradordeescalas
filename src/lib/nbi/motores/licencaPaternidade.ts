// Motor NBI — LICENÇA-PATERNIDADE. Texto oficial vive apenas em nbi_templates.
import type { ContextoMotor, MotorNbi } from "./tipos";
import { resolverBase, filtrarPlaceholders, validarMilitar, validarCamposTemplate } from "./comum";

const SCHEMA = [
  "NOME", "ID_FUNC", "POSTO_QUADRO", "LOTACAO", "ARTIGO_O_A", "ARTIGO_AO_A",
  "DATA_INICIO", "DATA_FIM", "QTD_DIAS", "QTD_DIAS_EXTENSO", "DATA_APRESENTACAO",
];

export const motorLicencaPaternidade: MotorNbi = {
  codigo: "licenca_paternidade",
  tituloUI: "Licença-paternidade",
  tituloDocumento: "LICENÇA-PATERNIDADE",
  schema: SCHEMA,

  resolverCampos(ctx) { return resolverBase(ctx); },

  montarPlaceholders(ctx) {
    return filtrarPlaceholders(this.resolverCampos(ctx), SCHEMA, ctx.camposTemplate);
  },

  validar(ctx: ContextoMotor) {
    const out = [...validarMilitar(ctx), ...validarCamposTemplate(ctx)];
    const v = resolverBase(ctx);
    if (!v.DATA_INICIO) out.push("data de início da licença ausente");
    if (!v.DATA_FIM) out.push("informe a quantidade de dias ou a data fim da licença");
    return out;
  },

  exemplo() {
    return {
      referencia: "NBI nº 20/2025 — licença-paternidade",
      contexto: { campos: { DATA_INICIO: "2025-09-01", QTD_DIAS: "20" } },
      placeholdersEsperados: SCHEMA,
    };
  },

  nivelHomologacao: "EM_HOMOLOGACAO",
  fonteDocumental: "NBI 20/2025",
  quantidadeExemplares: 1,
  ultimaAuditoria: "2026-07-31",
  homologado_em: null,
  homologado_por: null,
  observacoes: "Mesma mecânica de dias/extenso das férias; aguarda 2º exemplar real.",
};
