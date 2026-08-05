// Motor NBI — LUTO. Texto oficial vive apenas em nbi_templates.
// Exemplar: NBI com item de LUTO (anexado à homologação do Bloco 11A).
import type { ContextoMotor, MotorNbi } from "./tipos";
import { resolverBase, filtrarPlaceholders, validarMilitar, validarCamposTemplate } from "./comum";
import { DIAS_PADRAO_LUTO } from "@/lib/nbi/luto";
import { doisDigitos } from "./nupcias";

const SCHEMA = [
  "NOME", "ID_FUNC", "POSTO_QUADRO", "LOTACAO", "ARTIGO_O_A", "ARTIGO_AO_A",
  "DATA_INICIO", "DATA_FIM", "QTD_DIAS", "QTD_DIAS_EXTENSO",
  "MOTIVO_LUTO", "DATA_APRESENTACAO",
];

export const motorLuto: MotorNbi = {
  codigo: "luto",
  tituloUI: "Luto",
  tituloDocumento: "LUTO",
  schema: SCHEMA,

  resolverCampos(ctx) {
    const bruto = resolverBase(ctx);
    const dias = bruto.QTD_DIAS || String(DIAS_PADRAO_LUTO);
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
    if (!v.DATA_INICIO) out.push("data da concessão do luto ausente");
    if (!v.QTD_DIAS) out.push("quantidade de dias de luto ausente");
    if (!v.MOTIVO_LUTO) out.push("grau de parentesco do falecimento ausente");
    if (!v.DATA_APRESENTACAO) out.push("data de apresentação ausente");
    return out;
  },

  exemplo() {
    return {
      referencia: "NBI (exemplar oficial de LUTO) — 21/04/2026, 08 (oito) dias",
      contexto: { campos: { DATA_INICIO: "2026-04-21", QTD_DIAS: "8", MOTIVO_LUTO: "seu Genitor" } },
      placeholdersEsperados: SCHEMA,
    };
  },

  nivelHomologacao: "HOMOLOGADO",
  fonteDocumental: "Exemplar oficial de LUTO; Modelo Oficial 2022",
  quantidadeExemplares: 2,
  ultimaAuditoria: "2026-08-05",
  homologado_em: "2026-08-05",
  homologado_por: "Bloco 11A",
  observacoes: "Motivo restrito ao catálogo de graus de parentesco (src/lib/nbi/luto.ts).",
};
