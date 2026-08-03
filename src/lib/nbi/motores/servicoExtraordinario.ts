// Motor NBI — SERVIÇO EXTRAORDINÁRIO. Texto oficial vive apenas em nbi_templates.
// Referência documental: NBI 14/2026, NBI 18/2026, Modelos_textos_NBI_2022.
import type { ContextoMotor, MotorNbi } from "./tipos";
import { resolverBase, filtrarPlaceholders, validarMilitar, validarCamposTemplate } from "./comum";

const SCHEMA = [
  "NOME", "ID_FUNC", "POSTO_QUADRO", "LOTACAO", "ARTIGO_O_A", "ARTIGO_O_A_CAP",
  "QTD_HORAS", "MES_REFERENCIA", "ANO", "DATA_INICIO", "DATA_FIM", "MISSAO",
];

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

/** dd.mm.aa — formato exigido pela redação oficial do serviço extraordinário. */
function dataCurta(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return iso;
  return `${m[3]}.${m[2]}.${m[1].slice(2)}`;
}

export const motorServicoExtraordinario: MotorNbi = {
  codigo: "servico_extraordinario",
  tituloUI: "Serviço extraordinário",
  tituloDocumento: "SERVIÇO EXTRAORDINÁRIO",
  schema: SCHEMA,

  resolverCampos(ctx) {
    const v = resolverBase(ctx);
    const inicioIso = String(ctx.campos.DATA_INICIO ?? "");
    const fimIso = String(ctx.campos.DATA_FIM ?? "");

    // A redação oficial usa dd.mm.aa no período — sobrepõe o formato padrão.
    if (inicioIso) v.DATA_INICIO = dataCurta(inicioIso);
    if (fimIso) v.DATA_FIM = dataCurta(fimIso);

    const mesIso = /^(\d{4})-(\d{2})-\d{2}$/.exec(inicioIso);
    if (mesIso) {
      if (!v.MES_REFERENCIA) v.MES_REFERENCIA = MESES[parseInt(mesIso[2], 10) - 1] ?? "";
      if (!v.ANO) v.ANO = mesIso[1];
    }

    v.ARTIGO_O_A_CAP = (v.ARTIGO_O_A || "o").toUpperCase();
    return v;
  },

  montarPlaceholders(ctx) {
    return filtrarPlaceholders(this.resolverCampos(ctx), SCHEMA, ctx.camposTemplate);
  },

  validar(ctx: ContextoMotor) {
    const out = [...validarMilitar(ctx), ...validarCamposTemplate(ctx)];
    const v = this.resolverCampos(ctx);
    if (!v.QTD_HORAS) out.push("quantidade de horas de serviço extraordinário ausente");
    if (!v.DATA_INICIO) out.push("início do período apurado ausente");
    if (!v.DATA_FIM) out.push("fim do período apurado ausente");
    if (!v.MISSAO) out.push("missão executada ausente");
    return out;
  },

  exemplo() {
    return {
      referencia: "NBI nº 14/2026 e nº 18/2026 — serviço extraordinário",
      contexto: {
        campos: {
          QTD_HORAS: "24", DATA_INICIO: "2026-05-01", DATA_FIM: "2026-05-31",
          MISSAO: "Cmt de GU, COV",
        },
      },
      placeholdersEsperados: SCHEMA,
    };
  },

  nivelHomologacao: "HOMOLOGADO",
  fonteDocumental: "NBI 14/2026; NBI 18/2026; Modelos_textos_NBI_2022",
  quantidadeExemplares: 30,
  ultimaAuditoria: "2026-08-03",
  homologado_em: "2026-08-03",
  homologado_por: "Bloco 9A",
  observacoes: "Agrupa vários militares sob um único título via agrupamento global. Período impresso em dd.mm.aa.",
};
