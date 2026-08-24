// Motor NBI — DISPENSA POR RECOMPENSA. Texto oficial vive apenas em nbi_templates.
// Duas redações oficiais distintas, jamais mescladas:
//   - com apresentação   → template `dispensa_recompensa`            (NBI 19/2025)
//   - sem apresentação   → template `dispensa_recompensa_sem_apresentacao` (Modelos 2022)
import type { ContextoMotor, MotorNbi } from "./tipos";
import { resolverBase, filtrarPlaceholders, validarMilitar, validarCamposTemplate } from "./comum";

const SCHEMA = [
  "NOME", "ID_FUNC", "POSTO_QUADRO", "LOTACAO", "FUNCAO_DOCUMENTAL",
  "ARTIGO_O_A", "ARTIGO_AO_A",
  "DATA_INICIO", "QTD_DIAS", "QTD_DIAS_EXTENSO", "TERMO_DIA",
  "BOLETIM_NUMERO", "BOLETIM_DATA", "BOLETIM_UNIDADE", "DATA_APRESENTACAO",
];

/** A variante é escolhida pelo motor, nunca por texto presumido. */
function comApresentacao(ctx: ContextoMotor): boolean {
  return ctx.campos.com_apresentacao !== false;
}

export const motorDispensaRecompensa: MotorNbi = {
  codigo: "dispensa_recompensa",
  tituloUI: "Dispensa por recompensa",
  tituloDocumento: "DISPENSA POR RECOMPENSA",
  schema: SCHEMA,

  /** Código do template cuja redação oficial deve ser usada neste contexto. */
  codigoTemplateEfetivo(ctx: ContextoMotor) {
    return comApresentacao(ctx) ? "dispensa_recompensa" : "dispensa_recompensa_sem_apresentacao";
  },

  resolverCampos(ctx) {
    const v = resolverBase(ctx);
    const n = parseInt(v.QTD_DIAS ?? "", 10);
    if (!Number.isNaN(n)) v.TERMO_DIA = n === 1 ? "dia" : "dias";
    if (!comApresentacao(ctx)) delete v.DATA_APRESENTACAO;
    return v;
  },

  montarPlaceholders(ctx) {
    return filtrarPlaceholders(this.resolverCampos(ctx), SCHEMA, ctx.camposTemplate);
  },

  validar(ctx: ContextoMotor) {
    const out = [...validarMilitar(ctx), ...validarCamposTemplate(ctx)];
    const v = this.resolverCampos(ctx);
    if (!v.DATA_INICIO) out.push("data de início da dispensa ausente");
    if (!v.QTD_DIAS) out.push("quantidade de dias de dispensa ausente");
    if (!v.BOLETIM_NUMERO) out.push("número do Boletim Interno de concessão ausente");
    if (!v.BOLETIM_DATA) out.push("data do Boletim Interno de concessão ausente");
    if (!v.BOLETIM_UNIDADE) out.push("unidade do Boletim Interno de concessão ausente");
    if (comApresentacao(ctx) && !v.DATA_APRESENTACAO) out.push("data de apresentação ausente");
    if (comApresentacao(ctx) && !v.FUNCAO_DOCUMENTAL) {
      out.push("função documental do militar ausente no cadastro NBI");
    }
    return out;
  },

  exemplo() {
    return {
      referencia: "NBI nº 19/2025 (com apresentação) e Modelos_textos_NBI_2022 (sem apresentação)",
      contexto: {
        campos: {
          DATA_INICIO: "2025-07-25", QTD_DIAS: "1",
          BOLETIM_NUMERO: "51", BOLETIM_DATA: "18/12/24", BOLETIM_UNIDADE: "15ºBBM",
          com_apresentacao: true,
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
  observacoes: "Variantes nunca mescladas: o motor seleciona o template oficial conforme houver ou não data de apresentação.",
};
