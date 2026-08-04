// Bloco 9B — Automação máxima do preenchimento NBI.
// Centraliza os campos DERIVADOS (calculados/consultados) do módulo NBI.
// Nenhum texto oficial vive aqui: apenas valores de placeholders.
// Prioridade global: banco → cálculo → documento relacionado → configurações
// → sugestão do motor → manual (exceção).

import { somarDiasISO, formatarDataBR } from "@/utils/nbi";

export type OrigemDado =
  | "Banco de Militares"
  | "Banco de Férias"
  | "Configurações NBI"
  | "Assunção anterior"
  | "Cálculo automático"
  | "Modelo oficial";

export interface CampoDerivadoInfo {
  chave: string;
  valor: string;
  origem: OrigemDado;
  /** Explicação curta exibida sob o campo. */
  detalhe?: string;
}

/** Chave booleana que marca substituição manual de um campo derivado. */
export function chaveManual(chave: string): string {
  return `manual_${chave}`;
}

export function estaManual(campos: Record<string, string | boolean>, chave: string): boolean {
  return campos[chaveManual(chave)] === true;
}

export const MESES_PT = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

/** Primeiro e último dia de um mês no formato "YYYY-MM". */
export function limitesDoMes(mesRef: string): { inicio: string; fim: string; mesExtenso: string; ano: string } | null {
  const m = /^(\d{4})-(\d{2})$/.exec((mesRef || "").trim());
  if (!m) return null;
  const ano = parseInt(m[1], 10);
  const mes = parseInt(m[2], 10);
  if (mes < 1 || mes > 12) return null;
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return {
    inicio: `${m[1]}-${m[2]}-01`,
    fim: `${m[1]}-${m[2]}-${String(ultimo).padStart(2, "0")}`,
    mesExtenso: MESES_PT[mes - 1],
    ano: m[1],
  };
}

export interface ContextoDerivacao {
  /** Sigla/nome da unidade vinda das Configurações NBI. */
  unidadeSigla?: string;
  unidadeNome?: string;
  /** Origem escolhida nos assuntos de função ("ferias" | "assuncao" | "manual"). */
  origemDados?: string;
}

/** Assuntos cuja redação oficial imprime a data de apresentação. */
const TIPOS_COM_APRESENTACAO = new Set([
  "ferias", "apresentacao", "licenca_paternidade", "dispensa_recompensa",
]);

/**
 * Calcula todos os campos derivados de um assunto.
 * Retorna apenas o que o sistema sabe deduzir — nunca sobrescreve
 * um campo cujo operador pediu alteração manual.
 */
export function calcularDerivados(
  tipo: string,
  campos: Record<string, string | boolean>,
  ctx: ContextoDerivacao = {},
): CampoDerivadoInfo[] {
  const s = (k: string) => String(campos[k] ?? "").trim();
  const out: CampoDerivadoInfo[] = [];
  const push = (d: CampoDerivadoInfo) => {
    if (!d.valor) return;
    if (out.some((x) => x.chave === d.chave)) return;
    out.push(d);
  };

  const diasDe = (k = "QTD_DIAS") => {
    const n = parseInt(s(k), 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  // ── Bloco 10 — derivações genéricas (valem para todos os assuntos) ──
  if (tipo === "servico_extraordinario") {
    const lim = limitesDoMes(s("mes_referencia_sel"));
    if (lim) {
      push({ chave: "DATA_INICIO", valor: lim.inicio, origem: "Cálculo automático", detalhe: "Primeiro dia do mês selecionado" });
      push({ chave: "DATA_FIM", valor: lim.fim, origem: "Cálculo automático", detalhe: "Último dia do mês selecionado" });
      push({ chave: "MES_REFERENCIA", valor: lim.mesExtenso, origem: "Cálculo automático", detalhe: "Mês por extenso" });
      push({ chave: "ANO", valor: lim.ano, origem: "Cálculo automático", detalhe: "Ano do mês selecionado" });
    }
  } else {
    const inicio = s("DATA_INICIO");
    // Licença-paternidade: 30 dias é o padrão da redação oficial homologada.
    const dias = diasDe() ?? (tipo === "licenca_paternidade" ? 30 : null);
    if (tipo === "licenca_paternidade" && dias) {
      push({
        chave: "QTD_DIAS", valor: String(dias), origem: "Modelo oficial",
        detalhe: "Padrão da redação oficial (30 dias)",
      });
    }
    const fimCalculado = inicio && dias ? somarDiasISO(inicio, dias - 1) : "";
    if (fimCalculado) {
      push({
        chave: "DATA_FIM", valor: fimCalculado, origem: "Cálculo automático",
        detalhe: `Início + ${dias} dia(s) − 1`,
      });
    }
    const fim = s("DATA_FIM") || fimCalculado;
    if (fim && TIPOS_COM_APRESENTACAO.has(tipo) && campos.com_apresentacao !== false) {
      push({
        chave: "DATA_APRESENTACAO", valor: somarDiasISO(fim, 1), origem: "Cálculo automático",
        detalhe: `Dia seguinte ao término (${formatarDataBR(fim)})`,
      });
    }
    const baseAno = inicio || fim || s("DATA_APRESENTACAO");
    if (/^\d{4}-/.test(baseAno)) {
      push({
        chave: "ANO", valor: baseAno.slice(0, 4), origem: "Cálculo automático",
        detalhe: "Ano da data informada",
      });
    }
  }

  // Dispensa/assunção de função: a data vem do banco de férias ou da assunção anterior.
  if (tipo === "dispensa_funcao" || tipo === "assuncao_funcao") {
    const valor = s("DATA_INICIO");
    if (valor && (ctx.origemDados === "ferias" || ctx.origemDados === "assuncao")) {
      const origem: OrigemDado = ctx.origemDados === "ferias" ? "Banco de Férias" : "Assunção anterior";
      out.unshift({
        chave: "DATA_INICIO", valor, origem,
        detalhe: ctx.origemDados === "ferias"
          ? "Derivada do período de férias do titular"
          : "Derivada da assunção anterior vinculada",
      });
    }
  }

  if (tipo === "dispensa_recompensa") {
    const unidade = (ctx.unidadeSigla || ctx.unidadeNome || "").trim();
    if (unidade) {
      push({
        chave: "BOLETIM_UNIDADE", valor: unidade, origem: "Configurações NBI",
        detalhe: "Unidade cadastrada nas Configurações NBI",
      });
    }
  }

  return out;
}

/** Registro de origens para o snapshot (auditoria do Bloco 9B). */
export function origensDeAssunto(
  tipo: string,
  campos: Record<string, string | boolean>,
  ctx: ContextoDerivacao = {},
): Record<string, { origem: OrigemDado | "Preenchimento manual"; substituido_manualmente: boolean; valor: string }> {
  const reg: Record<string, { origem: OrigemDado | "Preenchimento manual"; substituido_manualmente: boolean; valor: string }> = {};
  for (const d of calcularDerivados(tipo, campos, ctx)) {
    const manual = estaManual(campos, d.chave);
    reg[d.chave] = {
      origem: manual ? "Preenchimento manual" : d.origem,
      substituido_manualmente: manual,
      valor: String(campos[d.chave] ?? d.valor),
    };
  }
  return reg;
}

/** Missões padronizadas do serviço extraordinário (opção "Outro" no formulário). */
export const MISSOES_PADRAO: string[] = [
  "Cmt de GU",
  "COV",
  "Cmt de GU, COV",
  "Guarnição de socorro",
  "Serviço de sobreaviso",
  "Apoio administrativo",
  "Segurança de evento",
  "Instrução",
];

const CHAVE_MISSOES_LOCAIS = "nbi_missoes_personalizadas";

export function missoesCadastradas(): string[] {
  if (typeof window === "undefined") return MISSOES_PADRAO;
  try {
    const raw = window.localStorage.getItem(CHAVE_MISSOES_LOCAIS);
    const extras = raw ? (JSON.parse(raw) as string[]) : [];
    return [...MISSOES_PADRAO, ...extras.filter((x) => typeof x === "string" && x.trim())];
  } catch {
    return MISSOES_PADRAO;
  }
}

export function cadastrarMissao(valor: string): string[] {
  const v = valor.trim();
  if (typeof window === "undefined" || !v) return missoesCadastradas();
  try {
    const raw = window.localStorage.getItem(CHAVE_MISSOES_LOCAIS);
    const extras = raw ? (JSON.parse(raw) as string[]) : [];
    if (!MISSOES_PADRAO.includes(v) && !extras.includes(v)) extras.push(v);
    window.localStorage.setItem(CHAVE_MISSOES_LOCAIS, JSON.stringify(extras));
  } catch { /* armazenamento indisponível — segue apenas com os padrões */ }
  return missoesCadastradas();
}

// ============ Nomeação de comissão — composição estruturada ============

export interface IntegranteComissao {
  id: string;
  tipo: "militar" | "externo";
  militar_id?: string | null;
  /** Externos */
  nome?: string;
  documento_tipo?: "CPF" | "RG";
  documento?: string;
  tratamento?: "Sr." | "Sra.";
  /** Comum */
  funcao?: string;
}

export interface DadosMilitarComissao {
  posto_quadro: string;
  nome: string;
  matricula: string;
}

/** Trecho oficial de um integrante, no formato dos exemplares homologados. */
export function trechoIntegrante(
  i: IntegranteComissao,
  militar: DadosMilitarComissao | null,
): string {
  if (i.tipo === "militar") {
    if (!militar) return "";
    const base = [militar.posto_quadro, militar.nome].filter(Boolean).join(" ").trim();
    const id = militar.matricula ? `, ID FUNC ${militar.matricula}` : "";
    const fx = i.funcao?.trim() ? `, ${i.funcao.trim()}` : "";
    return `${base}${id}${fx}`;
  }
  const trat = i.tratamento ?? "Sr.";
  const nome = (i.nome ?? "").trim();
  if (!nome) return "";
  const doc = (i.documento ?? "").trim()
    ? `, ${i.documento_tipo ?? "CPF"} ${(i.documento ?? "").trim()}`
    : "";
  const fx = i.funcao?.trim() ? `, ${i.funcao.trim()}` : "";
  return `${trat} ${nome}${doc}${fx}`;
}

/** Junta os integrantes conforme a redação oficial: "A, B e C". */
export function comporComposicao(trechos: string[]): string {
  const t = trechos.filter((x) => x.trim());
  if (t.length === 0) return "";
  if (t.length === 1) return t[0];
  return `${t.slice(0, -1).join(", ")} e ${t[t.length - 1]}`;
}

export const FINALIDADES_COMISSAO: Array<{ id: string; label: string; texto: string; pedeObjeto: boolean }> = [
  { id: "servibilidade", label: "Avaliar servibilidade de material", texto: "para avaliar as condições de servibilidade", pedeObjeto: true },
  { id: "recebimento", label: "Receber e conferir material", texto: "para receber e conferir", pedeObjeto: true },
  { id: "inventario", label: "Realizar inventário de bens", texto: "para realizar o inventário", pedeObjeto: true },
  { id: "apuracao", label: "Apurar fatos administrativos", texto: "para apurar os fatos relativos", pedeObjeto: true },
  { id: "licitacao", label: "Acompanhar processo licitatório", texto: "para acompanhar o processo licitatório", pedeObjeto: true },
];

/** Monta o valor oficial de FINALIDADE a partir dos campos estruturados. */
export function comporFinalidade(
  finalidadeId: string,
  objeto: string,
  unidade: string,
): string {
  const base = FINALIDADES_COMISSAO.find((f) => f.id === finalidadeId);
  if (!base) return "";
  const obj = objeto.trim();
  const uni = unidade.trim();
  let txt = base.texto;
  if (base.pedeObjeto && obj) txt += ` do ${obj}`;
  if (uni) txt += ` do ${uni}`;
  return txt;
}
