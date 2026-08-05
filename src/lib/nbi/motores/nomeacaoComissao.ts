// Motor NBI — NOMEAÇÃO DE COMISSÃO. Texto oficial vive apenas em nbi_templates.
// Referência documental: NBI 19/2025; Modelos_textos_NBI_2022.
// Assunto administrativo: não é vinculado a um único militar do cadastro —
// a composição (presidente, membros e civis) é informada como texto controlado.
import type { ContextoMotor, MotorNbi } from "./tipos";
import { resolverBase, filtrarPlaceholders, validarCamposTemplate } from "./comum";
import {
  validarFuncoesComissao, exigeVarianteEspecial, codigoTemplateComissao,
  funcaoEfetiva, type IntegranteFuncao,
} from "@/lib/nbi/comissao";

/** Lê a composição estruturada montada pelo formulário. */
function lerIntegrantes(ctx: ContextoMotor): Array<Record<string, unknown>> {
  try {
    const raw = String(ctx.campos.integrantes_json ?? "");
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? (arr as Array<Record<string, unknown>>) : [];
  } catch { return []; }
}

const SCHEMA = ["DATA_INICIO", "COMPOSICAO", "FINALIDADE"];

export const motorNomeacaoComissao: MotorNbi = {
  codigo: "nomeacao_comissao",
  tituloUI: "Nomeação de comissão",
  tituloDocumento: "NOMEAÇÃO DE COMISSÃO",
  schema: SCHEMA,

  resolverCampos(ctx) { return resolverBase(ctx); },

  // Variante com Secretário/Relator tem redação própria (ainda sem exemplar).
  codigoTemplateEfetivo(ctx) {
    return codigoTemplateComissao(lerIntegrantes(ctx) as unknown as IntegranteFuncao[]);
  },

  montarPlaceholders(ctx) {
    return filtrarPlaceholders(this.resolverCampos(ctx), SCHEMA, ctx.camposTemplate);
  },

  validar(ctx: ContextoMotor) {
    const out = [...validarCamposTemplate(ctx)];
    const v = resolverBase(ctx);
    if (!v.DATA_INICIO) out.push("data da nomeação ausente");
    if (!v.FINALIDADE) out.push("finalidade da comissão não selecionada");

    // Bloco 9B: a composição é montada pelo formulário estruturado.
    const integrantes = lerIntegrantes(ctx);

    if (integrantes.length === 0) {
      if (!v.COMPOSICAO) out.push("nenhum integrante informado na comissão");
    } else {
      out.push(...validarFuncoesComissao(
        integrantes as unknown as IntegranteFuncao[],
        { confirmarDoisPresidentes: ctx.campos.confirmar_dois_presidentes === true },
      ));
      if (exigeVarianteEspecial(integrantes as unknown as IntegranteFuncao[])) {
        out.push(
          "comissão com Secretário/Relator: variante aguardando exemplar oficial homologado — geração bloqueada",
        );
      }
      integrantes.forEach((i, idx) => {
        const f = funcaoEfetiva(i as unknown as IntegranteFuncao, idx);
        const pos = f === "presidente" ? "presidente" : `${idx + 1}º integrante`;
        if (i.tipo === "militar") {
          if (!i.militar_id) out.push(`${pos}: militar não selecionado`);
        } else {
          if (!String(i.nome ?? "").trim()) out.push(`${pos}: nome do integrante externo ausente`);
          if (!String(i.documento ?? "").trim()) out.push(`${pos}: CPF/RG do integrante externo ausente`);
        }
      });
      if (!v.COMPOSICAO) out.push("composição da comissão não pôde ser montada");
    }
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
