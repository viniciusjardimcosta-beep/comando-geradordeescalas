// Motor NBI — NÚPCIAS. Texto oficial vive apenas em nbi_templates.
// Exemplares: NBI nº 28/2025; Modelo Oficial 2022.
import type { ContextoMotor, MotorNbi } from "./tipos";
import { resolverBase, filtrarPlaceholders, validarMilitar, validarCamposTemplate } from "./comum";

const SCHEMA = [
  "NOME", "ID_FUNC", "POSTO_QUADRO", "LOTACAO", "ARTIGO_O_A", "ARTIGO_AO_A",
  "DATA_INICIO", "DATA_FIM", "QTD_DIAS", "QTD_DIAS_EXTENSO", "DATA_APRESENTACAO",
];

/** Padrão institucional observado nos exemplares oficiais. */
export const DIAS_PADRAO_NUPCIAS = 8;

/** Exemplares publicam a quantidade com dois dígitos ("08 (oito) dias"). */
export function doisDigitos(valor: string): string {
  const n = parseInt(valor, 10);
  return Number.isNaN(n) ? valor : String(n).padStart(2, "0");
}

export const motorNupcias: MotorNbi = {
  codigo: "nupcias",
  tituloUI: "Núpcias",
  tituloDocumento: "NÚPCIAS",
  schema: SCHEMA,

  resolverCampos(ctx) {
    const bruto = resolverBase(ctx);
    const dias = bruto.QTD_DIAS || String(DIAS_PADRAO_NUPCIAS);
    const v = resolverBase({ ...ctx, campos: { ...ctx.campos, QTD_DIAS: dias } });
    if (v.QTD_DIAS) v.QTD_DIAS = doisDigitos(v.QTD_DIAS);
    return v;
  },

  montarPlaceholders(ctx) {
    return filtrarPlaceholders(this.resolverCampos(ctx), SCHEMA, ctx.camposTemplate);
  },

  validar(ctx: ContextoMotor) {
    const out = [...validarMilitar(ctx), ...validarCamposTemplate(ctx)];
    const v = this.resolverCampos(ctx);
    if (!v.DATA_INICIO) out.push("data da concessão das núpcias ausente");
    if (!v.QTD_DIAS) out.push("quantidade de dias de núpcias ausente");
    if (!v.DATA_APRESENTACAO) out.push("data de apresentação ausente");
    return out;
  },

  exemplo() {
    return {
      referencia: "NBI nº 28/2025 — núpcias regulamentar",
      contexto: { campos: { DATA_INICIO: "2025-10-24", QTD_DIAS: "8" } },
      placeholdersEsperados: SCHEMA,
    };
  },

  nivelHomologacao: "HOMOLOGADO",
  fonteDocumental: "NBI 28/2025; Modelo Oficial 2022",
  quantidadeExemplares: 2,
  ultimaAuditoria: "2026-08-05",
  homologado_em: "2026-08-05",
  homologado_por: "Bloco 11A",
  observacoes: "Padrão institucional de 8 dias; apresentação sempre derivada de DATA_FIM + 1.",
};
