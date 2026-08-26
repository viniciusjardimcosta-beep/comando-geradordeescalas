/**
 * BLOCO 13A — Harness de teste do motor de escalas.
 *
 * REGRA: `src/utils/escala.functions.ts` NÃO é alterado.
 *
 * Como o motor (`escalar`) é interno ao módulo e o único export é a server
 * function `gerarEscala` (que exige auth + banco + template real), este harness
 * gera, em tempo de teste, uma CÓPIA FIEL do código-fonte do motor com:
 *   - o bloco `export const gerarEscala = createServerFn(...)` removido
 *     (é a última declaração do arquivo);
 *   - os imports de servidor removidos (createServerFn / auth-middleware);
 *   - um bloco `export { ... }` acrescentado ao final para expor os internos.
 *
 * Nenhuma linha de lógica é reescrita: o texto do motor é o mesmo byte a byte.
 * Assim, os testes exercitam o comportamento REAL e atual do motor.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const SRC = resolve(import.meta.dirname, "../escala.functions.ts");
const OUT = resolve(import.meta.dirname, ".generated/escala-internals.ts");

const EXPOSTOS = [
  "escalar",
  "classificarPosto",
  "isFeriado",
  "isDiaExpediente",
  "rotuloSemana",
  "diasNoMes",
  "dataKey",
  "excelSerialUTC",
  "feriadosBrasil",
  "normMatricula",
  "normNome",
  "SIGLAS_AFASTAMENTO",
  "SIGLAS_ORD_VALIDAS",
  "SIGLAS_COMP_VALIDAS",
  "SIGLAS_HE_VALIDAS",
  "ParametrosSchema",
];

function gerar(): void {
  const src = readFileSync(SRC, "utf8");
  const corte = src.indexOf("export const gerarEscala");
  if (corte < 0) throw new Error("Motor: âncora 'export const gerarEscala' não encontrada.");
  const corpo = src
    .slice(0, corte)
    .replace('import { createServerFn } from "@tanstack/react-start";\n', "")
    .replace(
      'import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";\n',
      "",
    );
  const header =
    "/* ARQUIVO GERADO AUTOMATICAMENTE PELOS TESTES — NÃO EDITAR.\n" +
    "   Cópia fiel de src/utils/escala.functions.ts (sem a server function). */\n" +
    "/* eslint-disable */\n// @ts-nocheck\n";
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${header}${corpo}\nexport { ${EXPOSTOS.join(", ")} };\n`);
}

gerar();

export const motor = await import("./.generated/escala-internals");

/* ------------------------------------------------------------------ */
/* Fábricas de dados FICTÍCIOS (regra permanente de exemplos)         */
/* ------------------------------------------------------------------ */

export interface MilitarFake {
  rowOrd: number;
  nome: string;
  nomeNorm: string;
  matricula: string;
  posto: string;
  postoCat: "ten" | "sgt" | "cb" | "sd" | "outro";
  isCov: boolean;
  isCg: boolean;
  isAdm: boolean;
  ativo: boolean;
  cargaH: number;
  ultimoServico: number;
  afastDias: Set<number>;
  afastSigla: Map<number, string>;
  grupoOrdem?: number;
  tipoEscala: "24h" | "parcial";
}

let seqRow = 12;

export function militar(over: Partial<MilitarFake> & { nome: string }): MilitarFake {
  const nome = over.nome;
  return {
    rowOrd: seqRow += 3,
    nome: "",
    nomeNorm: nome
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim(),
    matricula: "0000000",
    posto: "Soldado QPBM",
    postoCat: "sd",
    isCov: false,
    isCg: false,
    isAdm: false,
    ativo: true,
    cargaH: 0,
    ultimoServico: -99,
    afastDias: new Set<number>(),
    afastSigla: new Map<number, string>(),
    tipoEscala: "24h",
    ...over,
  };
}

export function resetRows(): void {
  seqRow = 12;
}

export function parametros(over: Record<string, unknown> = {}) {
  return motor.ParametrosSchema.parse({ ...over });
}

export function ia(over: Record<string, unknown> = {}) {
  return {
    afastamentos: [],
    reforcos: [],
    excecoes: [],
    lancamentos: [],
    viradaAnterior: [],
    limitesHe: [],
    ...over,
  } as any;
}

export interface RodadaResultado {
  ord: Map<number, Map<number, string>>;
  exp: Map<number, Map<number, string>>;
  he: Map<number, Map<number, string>>;
  alertas: Array<{ tipo: string; msg: string }>;
  falhas: Array<{ dia: number; etapa: string; motivo: string }>;
  furos: Array<{ dia: number; escalados: number; faltantes: number; cg: number; cov: number }>;
}

/** Executa o motor real e devolve mapas + diagnósticos. */
export function rodar(opts: {
  militares: MilitarFake[];
  mes: number;
  ano: number;
  dias?: number;
  par?: Record<string, unknown>;
  ia?: Record<string, unknown>;
}): RodadaResultado {
  const dias = opts.dias ?? motor.diasNoMes(opts.mes, opts.ano);
  const alertas: RodadaResultado["alertas"] = [];
  const falhas: RodadaResultado["falhas"] = [];
  const furos: RodadaResultado["furos"] = [];
  const r = motor.escalar(
    opts.militares as any,
    dias,
    opts.mes,
    opts.ano,
    parametros(opts.par ?? {}),
    ia(opts.ia ?? {}),
    alertas as any,
    falhas as any,
    furos as any,
  );
  return { ...r, alertas, falhas, furos };
}

/** Linha de um militar como array [dia1..diaN] de siglas (ou ""). */
export function linha(
  mapa: Map<number, Map<number, string>>,
  m: MilitarFake,
  dias: number,
): string[] {
  const out: string[] = [];
  for (let d = 1; d <= dias; d++) out.push(mapa.get(d)?.get(m.rowOrd) ?? "");
  return out;
}

/** Dias (1-indexed) em que a sigla exata aparece na linha do militar. */
export function diasCom(
  mapa: Map<number, Map<number, string>>,
  m: MilitarFake,
  dias: number,
  sigla: string,
): number[] {
  const out: number[] = [];
  for (let d = 1; d <= dias; d++) if (mapa.get(d)?.get(m.rowOrd) === sigla) out.push(d);
  return out;
}
