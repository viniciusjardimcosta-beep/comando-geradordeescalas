// Motor NBI — DISPENSA DE FUNÇÃO. Texto oficial vive apenas em nbi_templates.
import type { ContextoMotor, MotorNbi } from "./tipos";
import { resolverBase, filtrarPlaceholders, validarMilitar, validarTitular, validarCamposTemplate } from "./comum";

const SCHEMA = [
  "NOME", "ID_FUNC", "POSTO_QUADRO", "LOTACAO", "ARTIGO_O_A", "ARTIGO_AO_A",
  "NOME_TITULAR", "ID_FUNC_TITULAR", "POSTO_QUADRO_TITULAR", "LOTACAO_TITULAR",
  "DISTRIBUICAO_INTERNA_TITULAR", "FUNCAO_ATUAL_TITULAR", "ARTIGO_O_A_TITULAR",
  "FUNCAO", "MOTIVO", "DATA_INICIO", "DATA_FIM",
];

export const motorDispensaFuncao: MotorNbi = {
  codigo: "dispensa_funcao",
  tituloUI: "Dispensa de função",
  tituloDocumento: "DISPENSA DE FUNÇÃO",
  schema: SCHEMA,

  resolverCampos(ctx) { return resolverBase(ctx); },

  montarPlaceholders(ctx) {
    return filtrarPlaceholders(this.resolverCampos(ctx), SCHEMA, ctx.camposTemplate);
  },

  validar(ctx: ContextoMotor) {
    return [...validarMilitar(ctx), ...validarTitular(ctx), ...validarCamposTemplate(ctx)];
  },

  exemplo() {
    return {
      referencia: "NBI nº 29/2025 — dispensa de função",
      contexto: {
        campos: {
          FUNCAO: "Chefe da Seção de Recursos Humanos",
          MOTIVO: "retorno do titular",
          DATA_INICIO: "2025-11-13",
        },
      },
      placeholdersEsperados: SCHEMA,
    };
  },

  nivelHomologacao: "HOMOLOGADO",
  fonteDocumental: "NBI 29/2025; NBI 05/2026",
  quantidadeExemplares: 3,
  ultimaAuditoria: "2026-07-31",
  homologado_em: "2026-07-31",
  homologado_por: "Bloco 8A",
  observacoes: "Reutiliza os mesmos dados cadastrais da assunção; titular obrigatório.",
};
