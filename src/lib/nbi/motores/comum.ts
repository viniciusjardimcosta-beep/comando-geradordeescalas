// Helpers compartilhados pelos motores NBI.
// Reproduz exatamente a resolução/validação já homologada no wizard,
// apenas organizada por motor. Nenhum texto oficial aqui.

import {
  montarPostoQuadro, artigoO, artigoAo, numeroPorExtenso, periodoOrdinal,
  somarDiasISO, diasEntreISO, formatarDataBR,
} from "@/utils/nbi";
import type { ContextoMotor } from "./tipos";

/** Placeholders derivados automaticamente (nunca cobrados do operador). */
export const CHAVES_AUTO = new Set([
  "QTD_DIAS", "QTD_DIAS_EXTENSO", "DATA_APRESENTACAO", "ANO",
  "TERMINACAO_RETORNO", "ARTIGO_O_A", "ARTIGO_AO_A", "ARTIGO_O_A_TITULAR",
]);

/** Placeholders vindos do cadastro do militar/titular. */
export const CHAVES_MILITAR = new Set([
  "NOME", "ID_FUNC", "LOTACAO", "POSTO_QUADRO",
]);
export const CHAVES_TITULAR = new Set([
  "NOME_TITULAR", "ID_FUNC_TITULAR", "LOTACAO_TITULAR", "POSTO_QUADRO_TITULAR",
  "DISTRIBUICAO_INTERNA_TITULAR", "FUNCAO_ATUAL_TITULAR",
]);

/**
 * Resolução base: cadastro do militar, derivações de datas/extenso e
 * formatação de datas visíveis. `opts.viagem` habilita TERMINACAO_RETORNO.
 */
export function resolverBase(
  ctx: ContextoMotor,
  opts: { viagem?: boolean } = {},
): Record<string, string> {
  const { campos, militar, titular, camposTemplate } = ctx;
  const v: Record<string, string> = {};

  for (const c of camposTemplate) {
    const bruto = campos[c.chave];
    if (bruto !== undefined && bruto !== "" && typeof bruto !== "boolean") {
      v[c.chave] = String(bruto);
    }
  }

  if (militar) {
    if (!v.NOME) v.NOME = militar.nome;
    if (!v.ID_FUNC) v.ID_FUNC = militar.matricula ?? "";
    if (!v.LOTACAO) v.LOTACAO = militar.lotacao_nbi ?? "";
    if (!v.POSTO_QUADRO) v.POSTO_QUADRO = montarPostoQuadro(militar.posto_graduacao, militar.quadro);
    v.ARTIGO_O_A = artigoO(militar.genero_gramatical);
    v.ARTIGO_AO_A = artigoAo(militar.genero_gramatical);
  }
  if (titular) {
    v.NOME_TITULAR = titular.nome;
    v.ID_FUNC_TITULAR = titular.matricula ?? "";
    v.LOTACAO_TITULAR = titular.lotacao_nbi ?? "";
    v.POSTO_QUADRO_TITULAR = montarPostoQuadro(titular.posto_graduacao, titular.quadro);
    v.DISTRIBUICAO_INTERNA_TITULAR = titular.distribuicao_interna_nbi ?? "";
    v.FUNCAO_ATUAL_TITULAR = titular.funcao_atual ?? "";
    v.ARTIGO_O_A_TITULAR = artigoO(titular.genero_gramatical);
  }

  if (v.DATA_INICIO && v.DATA_FIM && !v.QTD_DIAS) {
    v.QTD_DIAS = String(diasEntreISO(v.DATA_INICIO, v.DATA_FIM));
  }
  if (v.DATA_INICIO && !v.DATA_FIM && v.QTD_DIAS) {
    const n = parseInt(v.QTD_DIAS, 10);
    if (!Number.isNaN(n) && n > 0) v.DATA_FIM = somarDiasISO(v.DATA_INICIO, n - 1);
  }
  if (v.QTD_DIAS && !v.QTD_DIAS_EXTENSO) {
    const n = parseInt(v.QTD_DIAS, 10);
    if (!Number.isNaN(n)) v.QTD_DIAS_EXTENSO = numeroPorExtenso(n);
  }
  if (v.DATA_FIM && !v.DATA_APRESENTACAO) {
    v.DATA_APRESENTACAO = somarDiasISO(v.DATA_FIM, 1);
  }
  if (v.DATA_INICIO && !v.ANO) {
    v.ANO = v.DATA_INICIO.slice(0, 4);
  }
  if (v.PERIODO && /^\d+$/.test(v.PERIODO)) {
    v.PERIODO = periodoOrdinal(parseInt(v.PERIODO, 10));
  }

  if (opts.viagem) {
    const mesmoDia = Boolean(campos.retorno_no_mesmo_dia);
    v.TERMINACAO_RETORNO = mesmoDia
      ? "retornando no mesmo dia"
      : (v.DATA_RETORNO ? `retornando em ${formatarDataBR(v.DATA_RETORNO)}` : "");
  }

  for (const k of ["DATA_INICIO", "DATA_FIM", "DATA_APRESENTACAO", "DATA_RETORNO"]) {
    if (v[k] && /^\d{4}-\d{2}-\d{2}$/.test(v[k])) v[k] = formatarDataBR(v[k]);
  }
  return v;
}

/**
 * Placeholders do motor: valores resolvidos restritos ao schema do próprio
 * assunto, acrescidos das chaves declaradas pelo template no banco.
 */
export function filtrarPlaceholders(
  resolvidos: Record<string, string>,
  schema: string[],
  camposTemplate: ContextoMotor["camposTemplate"],
): Record<string, string> {
  const permitidas = new Set<string>(schema);
  for (const c of camposTemplate) permitidas.add(c.chave);
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(resolvidos)) {
    if (permitidas.has(k)) out[k] = val;
  }
  return out;
}

/** Validação cadastral do militar objeto da nota. */
export function validarMilitar(ctx: ContextoMotor): string[] {
  const out: string[] = [];
  const m = ctx.militar;
  if (!m) { out.push("militar não selecionado"); return out; }
  if (!m.matricula) out.push(`ID FUNC/matrícula ausente no cadastro de ${m.nome}`);
  if (!m.posto_graduacao) out.push(`posto/graduação ausente no cadastro de ${m.nome}`);
  if (!m.quadro) out.push(`quadro ausente no cadastro NBI de ${m.nome}`);
  if (!m.lotacao_nbi) out.push(`lotação NBI ausente no cadastro de ${m.nome}`);
  if (!m.genero_gramatical) out.push(`gênero gramatical ausente no cadastro de ${m.nome}`);
  return out;
}

/** Validação cadastral do titular (assuntos de função). */
export function validarTitular(ctx: ContextoMotor): string[] {
  const out: string[] = [];
  const t = ctx.titular;
  if (!t) { out.push("titular da função não selecionado"); return out; }
  if (!t.matricula) out.push(`ID FUNC do titular ${t.nome} ausente`);
  if (!t.posto_graduacao) out.push(`posto do titular ${t.nome} ausente`);
  if (!t.quadro) out.push(`quadro do titular ${t.nome} ausente`);
  if (!t.lotacao_nbi) out.push(`lotação NBI do titular ${t.nome} ausente`);
  if (!t.genero_gramatical) out.push(`gênero gramatical do titular ${t.nome} ausente`);
  return out;
}

/** Campos obrigatórios declarados no template (exceto automáticos/derivados). */
export function validarCamposTemplate(
  ctx: ContextoMotor,
  opts: { viagem?: boolean } = {},
): string[] {
  const out: string[] = [];
  for (const c of ctx.camposTemplate) {
    if (CHAVES_AUTO.has(c.chave) || CHAVES_MILITAR.has(c.chave) || CHAVES_TITULAR.has(c.chave)) continue;
    const val = ctx.campos[c.chave];
    if (c.chave === "DATA_RETORNO") {
      if (!opts.viagem) continue;
      const mesmoDia = Boolean(ctx.campos.retorno_no_mesmo_dia);
      if (!mesmoDia && (!val || val === "")) {
        out.push(`${c.label}: obrigatório quando não há retorno no mesmo dia`);
      }
      continue;
    }
    if (c.tipo === "boolean") continue;
    if (c.obrigatorio && (val === undefined || val === null || val === "")) {
      out.push(`${c.label} ausente`);
    }
  }
  return out;
}
