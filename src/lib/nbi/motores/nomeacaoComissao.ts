// Motor NBI — NOMEAÇÃO DE COMISSÃO. Texto oficial vive apenas em nbi_templates.
// Referência documental: NBI 19/2025; Modelos_textos_NBI_2022.
// Assunto administrativo: não é vinculado a um único militar do cadastro —
// a composição (presidente, membros e civis) é informada como texto controlado.
import type { ContextoMotor, MotorNbi } from "./tipos";
import { resolverBase, filtrarPlaceholders, validarCamposTemplate } from "./comum";

const SCHEMA = ["DATA_INICIO", "COMPOSICAO", "FINALIDADE"];

export const motorNomeacaoComissao: MotorNbi = {
  codigo: "nomeacao_comissao",
  tituloUI: "Nomeação de comissão",
  tituloDocumento: "NOMEAÇÃO DE COMISSÃO",
  schema: SCHEMA,

  resolverCampos(ctx) { return resolverBase(ctx); },

  montarPlaceholders(ctx) {
    return filtrarPlaceholders(this.resolverCampos(ctx), SCHEMA, ctx.camposTemplate);
  },

  validar(ctx: ContextoMotor) {
    const out = [...validarCamposTemplate(ctx)];
    const v = resolverBase(ctx);
    if (!v.DATA_INICIO) out.push("data da nomeação ausente");
    if (!v.COMPOSICAO) out.push("composição da comissão ausente");
    if (!v.FINALIDADE) out.push("finalidade da comissão ausente");
    return out;
  },

  exemplo() {
    return {
      referencia: "NBI nº 19/2025 — nomeação de comissão",
      contexto: {
        campos: {
          DATA_INICIO: "2025-07-20",
          COMPOSICAO: "1º Ten QTBM SILVA, ID FUNC 0000000, e o Sr. FULANO, CPF 000.000.000-00",
          FINALIDADE: "para avaliar as condições de servibilidade do material de informática",
        },
      },
      placeholdersEsperados: SCHEMA,
    };
  },

  nivelHomologacao: "HOMOLOGADO",
  fonteDocumental: "NBI 19/2025; Modelos_textos_NBI_2022",
  quantidadeExemplares: 2,
  ultimaAuditoria: "2026-08-03",
  homologado_em: "2026-08-03",
  homologado_por: "Bloco 9A",
  observacoes: "Não exige militar único: a comissão pode incluir civis identificados por CPF/RG.",
};
