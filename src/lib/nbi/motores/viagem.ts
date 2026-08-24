// Motor NBI — VIAGEM A SERVIÇO. Texto oficial vive apenas em nbi_templates.
import type { ContextoMotor, MotorNbi } from "./tipos";
import { resolverBase, filtrarPlaceholders, validarMilitar, validarCamposTemplate } from "./comum";

const SCHEMA = [
  "NOME", "ID_FUNC", "POSTO_QUADRO", "LOTACAO", "ARTIGO_O_A", "ARTIGO_AO_A",
  "MISSAO", "ORIGEM", "DESTINO", "DATA_INICIO", "DATA_RETORNO", "TERMINACAO_RETORNO",
];

export const motorViagem: MotorNbi = {
  codigo: "viagem",
  tituloUI: "Viagem a serviço",
  tituloDocumento: "VIAGEM",
  schema: SCHEMA,

  resolverCampos(ctx) { return resolverBase(ctx, { viagem: true }); },

  montarPlaceholders(ctx) {
    return filtrarPlaceholders(this.resolverCampos(ctx), SCHEMA, ctx.camposTemplate);
  },

  validar(ctx: ContextoMotor) {
    return [...validarMilitar(ctx), ...validarCamposTemplate(ctx, { viagem: true })];
  },

  exemplo() {
    return {
      referencia: "NBI nº 15/2026 — viagem a serviço",
      contexto: {
        campos: {
          MISSAO: "participação em reunião de coordenação",
          ORIGEM: "Campinas", DESTINO: "Curitiba",
          DATA_INICIO: "2026-03-10", retorno_no_mesmo_dia: true,
        },
      },
      placeholdersEsperados: SCHEMA,
    };
  },

  nivelHomologacao: "HOMOLOGADO",
  fonteDocumental: "NBI 15/2026",
  quantidadeExemplares: 2,
  ultimaAuditoria: "2026-07-31",
  homologado_em: "2026-07-31",
  homologado_por: "Bloco 8A",
  observacoes: "TERMINACAO_RETORNO alterna entre retorno no mesmo dia e data de retorno.",
};
