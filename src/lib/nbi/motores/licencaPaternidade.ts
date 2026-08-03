// Motor NBI — LICENÇA-PATERNIDADE. Texto oficial vive apenas em nbi_templates.
// Referência documental: NBI 15/2026; Modelos_textos_NBI_2022.
import type { ContextoMotor, MotorNbi } from "./tipos";
import { resolverBase, filtrarPlaceholders, validarMilitar, validarCamposTemplate } from "./comum";

const SCHEMA = [
  "NOME", "ID_FUNC", "POSTO_QUADRO", "LOTACAO", "ARTIGO_O_A", "ARTIGO_AO_A",
  "DATA_INICIO", "DATA_FIM", "QTD_DIAS", "QTD_DIAS_EXTENSO", "DATA_APRESENTACAO",
];

export const motorLicencaPaternidade: MotorNbi = {
  codigo: "licenca_paternidade",
  tituloUI: "Licença-paternidade",
  tituloDocumento: "LICENÇA PATERNIDADE",
  schema: SCHEMA,

  resolverCampos(ctx) {
    const v = resolverBase(ctx);
    // Redação oficial: 30 dias é o padrão publicado nos exemplares.
    if (!v.QTD_DIAS) v.QTD_DIAS = "30";
    return resolverBase({ ...ctx, campos: { ...ctx.campos, QTD_DIAS: v.QTD_DIAS } });
  },

  montarPlaceholders(ctx) {
    return filtrarPlaceholders(this.resolverCampos(ctx), SCHEMA, ctx.camposTemplate);
  },

  validar(ctx: ContextoMotor) {
    const out = [...validarMilitar(ctx), ...validarCamposTemplate(ctx)];
    const v = this.resolverCampos(ctx);
    if (!v.DATA_INICIO) out.push("data de início da licença ausente");
    if (!v.QTD_DIAS) out.push("quantidade de dias da licença ausente");
    if (!v.DATA_APRESENTACAO) out.push("data de apresentação ausente");
    return out;
  },

  exemplo() {
    return {
      referencia: "NBI nº 15/2026 — licença-paternidade",
      contexto: { campos: { DATA_INICIO: "2026-06-06", QTD_DIAS: "30" } },
      placeholdersEsperados: SCHEMA,
    };
  },

  nivelHomologacao: "HOMOLOGADO",
  fonteDocumental: "NBI 15/2026; Modelos_textos_NBI_2022",
  quantidadeExemplares: 2,
  ultimaAuditoria: "2026-08-03",
  homologado_em: "2026-08-03",
  homologado_por: "Bloco 9A",
  observacoes: "Apresentação sempre derivada de DATA_FIM + 1 (30 dias → início + 30).",
};
