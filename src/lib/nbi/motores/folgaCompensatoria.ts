// Motor NBI — FOLGA COMPENSATÓRIA (Bloco 11B).
// Texto oficial vive exclusivamente em nbi_templates:
//   • folga_compensatoria            → previsão de compensação
//   • folga_compensatoria_realizada  → compensação já realizada
// Exemplares: NBI nº 14/2026, nº 18/2026, nº 21/2026 e NBI nº 28/2025.
// Este motor é exclusivo: não reaproveita nenhum outro motor homologado.

import type { ContextoMotor, MotorNbi } from "./tipos";
import { resolverBase, filtrarPlaceholders, validarMilitar, validarCamposTemplate } from "./comum";
import {
  calcularMesesFolga, subtipoFolga, SUBTIPO_FOLGA_PADRAO,
} from "@/lib/nbi/folgaCompensatoria";

const SCHEMA = [
  "NOME", "ID_FUNC", "POSTO_QUADRO", "LOTACAO", "ARTIGO_O_A", "ARTIGO_O_A_CAP",
  "QTD_HORAS", "MOTIVO", "MES_REFERENCIA", "MES_COMPENSACAO", "ANO",
];

function subtipoDe(ctx: ContextoMotor): string {
  return String(ctx.campos.SUBTIPO ?? "").trim() || SUBTIPO_FOLGA_PADRAO;
}

export const motorFolgaCompensatoria: MotorNbi = {
  codigo: "folga_compensatoria",
  tituloUI: "Folga compensatória",
  tituloDocumento: "FOLGA COMPENSATÓRIA",
  schema: SCHEMA,

  codigoTemplateEfetivo(ctx) {
    return subtipoFolga(subtipoDe(ctx)).template;
  },

  resolverCampos(ctx) {
    const v = resolverBase(ctx);

    // Mês de referência é o único dado temporal informado; o mês de
    // compensação é SEMPRE calculado (dezembro → janeiro do ano seguinte).
    const meses = calcularMesesFolga(String(ctx.campos.mes_referencia_sel ?? ""));
    if (meses) {
      v.MES_REFERENCIA = meses.referencia;
      v.MES_COMPENSACAO = meses.compensacao;
      v.ANO = meses.ano;
    }

    // A quantidade de horas é livre (exemplares oficiais trazem 4, 12, 33...).
    if (v.QTD_HORAS) v.QTD_HORAS = String(v.QTD_HORAS).trim();

    v.ARTIGO_O_A_CAP = (v.ARTIGO_O_A || "o").toUpperCase();
    return v;
  },

  montarPlaceholders(ctx) {
    return filtrarPlaceholders(this.resolverCampos(ctx), SCHEMA, ctx.camposTemplate);
  },

  validar(ctx: ContextoMotor) {
    // A variante "compensação realizada" não possui MOTIVO na redação oficial:
    // o campo é removido da validação genérica antes de qualquer checagem.
    const ctxValido: ContextoMotor = subtipoDe(ctx) === "realizada"
      ? { ...ctx, camposTemplate: ctx.camposTemplate.filter((c) => c.chave.toUpperCase() !== "MOTIVO") }
      : ctx;
    const out = [...validarMilitar(ctxValido), ...validarCamposTemplate(ctxValido)];
    const v = this.resolverCampos(ctx);
    const horas = parseInt(String(ctx.campos.QTD_HORAS ?? ""), 10);
    if (!v.QTD_HORAS || !Number.isFinite(horas) || horas <= 0) {
      out.push("quantidade de horas a compensar ausente ou inválida");
    }
    if (!v.MES_REFERENCIA) out.push("mês de referência da compensação ausente");
    if (!v.MES_COMPENSACAO) out.push("mês previsto para compensação não pôde ser calculado");
    if (subtipoDe(ctx) !== "realizada" && !v.MOTIVO) out.push("motivo da folga compensatória ausente");
    return out;
  },

  exemplo() {
    return {
      referencia: "NBI nº 18/2026 — 33 horas referentes a junho, compensação em julho",
      contexto: {
        campos: {
          SUBTIPO: "previsao",
          mes_referencia_sel: "2026-06",
          QTD_HORAS: "33",
          MOTIVO: "ajustes no mapa por conta de ajustes de escala",
        },
      },
      placeholdersEsperados: SCHEMA,
    };
  },

  nivelHomologacao: "HOMOLOGADO",
  fonteDocumental: "NBI nº 14/2026; NBI nº 18/2026; NBI nº 21/2026; NBI nº 28/2025",
  quantidadeExemplares: 24,
  ultimaAuditoria: "2026-08-05",
  homologado_em: "2026-08-05",
  homologado_por: "Bloco 11B",
  observacoes:
    "Motor exclusivo. Mês de compensação sempre calculado (dezembro → janeiro do ano seguinte). "
    + "Quantidade de horas sem limite. Motivos restritos ao catálogo, com opção de descrição livre.",
};
