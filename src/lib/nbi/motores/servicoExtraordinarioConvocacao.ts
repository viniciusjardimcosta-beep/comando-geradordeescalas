// Motor NBI — CONVOCAÇÃO PARA SERVIÇO EXTRAORDINÁRIO (subtipo B).
// AGUARDANDO EXEMPLAR OFICIAL: nenhuma redação foi criada aqui nem no banco.
// Nunca compartilha a redação do serviço extraordinário executado.
import type { ContextoMotor, MotorNbi } from "./tipos";
import { resolverBase, filtrarPlaceholders, validarMilitar, validarCamposTemplate } from "./comum";

const SCHEMA = [
  "NOME", "ID_FUNC", "POSTO_QUADRO", "LOTACAO", "ARTIGO_O_A",
  "DATA_SERVICO", "HORARIO_INICIO", "HORARIO_FIM", "MOTIVO", "MISSAO",
  "UNIDADE", "FUNDAMENTO",
];

export const motorServicoExtraordinarioConvocacao: MotorNbi = {
  codigo: "servico_extraordinario_convocacao",
  tituloUI: "Serviço extraordinário — convocação futura",
  tituloDocumento: "SERVIÇO EXTRAORDINÁRIO",
  schema: SCHEMA,

  resolverCampos(ctx) { return resolverBase(ctx); },

  montarPlaceholders(ctx) {
    return filtrarPlaceholders(this.resolverCampos(ctx), SCHEMA, ctx.camposTemplate);
  },

  validar(ctx: ContextoMotor) {
    return [
      "convocação para serviço extraordinário: modelo aguardando exemplar oficial homologado — geração bloqueada",
      ...validarMilitar(ctx),
      ...validarCamposTemplate(ctx),
    ];
  },

  exemplo() {
    return {
      referencia: "sem exemplar oficial homologado",
      contexto: { campos: {} },
      placeholdersEsperados: SCHEMA,
    };
  },

  nivelHomologacao: "EM_HOMOLOGACAO",
  fonteDocumental: "nenhuma — aguardando exemplar oficial da unidade",
  quantidadeExemplares: 0,
  ultimaAuditoria: "2026-08-05",
  homologado_em: null,
  homologado_por: null,
  observacoes: "Subtipo distinto do serviço executado. Não gera documento oficial nem reserva número.",
};
