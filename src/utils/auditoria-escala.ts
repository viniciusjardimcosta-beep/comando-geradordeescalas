/**
 * MODO AUDITORIA — somente leitura.
 *
 * Recebe o .xlsx final gerado pelo motor e produz um relatório passo a passo
 * por militar: carga prevista vs. soma real das siglas lançadas (ORD, CM,
 * EXP/TELE, HE), com diagnóstico da provável causa de qualquer diferença.
 *
 * NÃO IMPORTA nada de escala.functions.ts e NÃO altera o motor — replica
 * apenas as tabelas de horas/siglas (que são constantes do domínio).
 */

import {
  loadXlsx,
  getSheetXml,
  readCell,
  iterRows,
  makeRef,
} from "./xlsx-surgical";

/* ---------- tabelas de domínio (replicadas, não importadas) ---------- */

const ORD_HORAS: Record<string, number> = {
  "1": 6, "2": 6, "3": 6, "4": 6,
  "12": 12, "13": 12, "14": 12, "23": 12, "24": 12, "34": 12,
  "123": 18, "124": 18, "134": 18, "234": 18,
  "1234": 24, "2341": 24,
};

const SIGLAS_AFASTAMENTO = new Set([
  "RDC","F","LTS","OP","VIA","LAS","LFC","LGE","LAD","LPA","LE","LIP","FE",
  "LCC","LIN","TRA","FJ","RSP","FER","DIS","LGL","LNJ","LAA","CBA","CTSP","C",
  "TRF","CA1","FN","FNJ","DCP","DSP","AFM","DOA","LRP","LSI","PRD","AGA","AGM",
  "PRA","PRS","PPR","PSC","PRT","LAI","CPR","CPS","LAC","LCJ","LFE","PRE","DES",
  "EDT","AJS","AGJ","LMC","LDC","LQE","LQP","PR","CA","RR","CA2","CA3","CA4",
  "FC1","FC2","FC3","FC4","FC5","FC6",
]);

const COL_INI = 6; // F = dia 1

function cargaBase(dias: number): number {
  return ({ 28: 160, 29: 165, 30: 171, 31: 177 } as Record<number, number>)[dias] ?? 177;
}
function cargaMensalProporcional(dias: number, afDias: number): number {
  return Math.round(cargaBase(dias) * (1 - afDias / dias));
}

function horasOrd(s: string): number {
  return ORD_HORAS[s] ?? 0;
}
function horasComp(s: string): { tipo: "CM" | "EXP" | "TELE" | null; h: number } {
  const m = /^(CM|EXP|TELE)(\d{1,2})$/i.exec(s.trim());
  if (!m) return { tipo: null, h: 0 };
  return { tipo: m[1].toUpperCase() as "CM" | "EXP" | "TELE", h: Number(m[2]) };
}
function horasHe(s: string): number {
  const m = /^HE(\d{1,2})$/i.exec(s.trim());
  return m ? Number(m[1]) : 0;
}

function diasNoMes(ano: number, mes: number): number {
  return new Date(ano, mes, 0).getDate();
}

/* ---------- tipos do relatório ---------- */

export type CausaDiagnostico =
  | "ok"
  | "arredondamento"
  | "CM"
  | "HE"
  | "EXP"
  | "leitura da planilha"
  | "virada de mês"
  | "fórmula do Excel";

export interface LancamentoAuditado {
  dia: number;
  celula: string;
  linha: "ORD" | "EXP" | "HE";
  sigla: string;
  horas: number;
  acumulado: number;
  observacao?: string;
}

export interface RelatorioMilitar {
  nome: string;
  matricula: string;
  rowOrd: number;
  diasAfastado: number;
  cargaPrevista: number;
  horasOrdinarias: number;
  horasCM: number;
  horasEXP: number; // EXP + TELE
  horasHE: number;
  totalFinal: number;
  diferenca: number;
  lancamentos: LancamentoAuditado[];
  causas: CausaDiagnostico[];
  detalhes: string[];
}

export interface RelatorioAuditoria {
  mes: number;
  ano: number;
  dias: number;
  militares: RelatorioMilitar[];
  alertasGlobais: string[];
}

/* ---------- núcleo ---------- */

export function auditarEscalaXlsx(
  xlsxBytes: Uint8Array,
  mes: number,
  ano: number,
): RelatorioAuditoria {
  const dias = diasNoMes(ano, mes);
  const bundle = loadXlsx(xlsxBytes);

  const alertasGlobais: string[] = [];

  let anexo: { path: string; xml: string };
  let efetivo: { path: string; xml: string };
  try {
    anexo = getSheetXml(bundle, "anexo b");
  } catch {
    throw new Error('Arquivo não possui aba "Anexo B - Escala".');
  }
  try {
    efetivo = getSheetXml(bundle, "efetivo");
  } catch {
    throw new Error('Arquivo não possui aba "Efetivo".');
  }

  /* mapa efetivoRow -> linha do bloco no Anexo B (lendo fórmulas =Efetivo!X{n}) */
  const efetivoToAnexo = new Map<number, number>();
  for (const rm of anexo.xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const r = Number(/\br="(\d+)"/.exec(rm[1])?.[1] ?? "0");
    if (!r) continue;
    const m = rm[2].match(/Efetivo!\$?[A-Z]\$?(\d+)/);
    if (m) {
      const efRow = Number(m[1]);
      if (!efetivoToAnexo.has(efRow)) efetivoToAnexo.set(efRow, r);
    }
  }

  /* listar militares pela aba Efetivo */
  const efRows = iterRows(efetivo.xml);
  const maxEfRow = efRows.length ? Math.max(...efRows.map((r) => r.r)) : 100;

  interface Militar {
    rowEf: number;
    rowOrd: number;
    nome: string;
    matricula: string;
  }
  const militares: Militar[] = [];
  for (let r = 2; r <= maxEfRow; r++) {
    const idFunc = readCell(bundle, efetivo.xml, makeRef(r, 2)).trim();
    const nome = readCell(bundle, efetivo.xml, makeRef(r, 3)).trim();
    if (!nome) continue;
    const rowOrd = efetivoToAnexo.get(r);
    if (!rowOrd) continue;
    militares.push({ rowEf: r, rowOrd, nome, matricula: idFunc });
  }

  if (militares.length === 0) {
    alertasGlobais.push(
      "Nenhum bloco de militar encontrado no Anexo B — verifique se o arquivo é a planilha final gerada.",
    );
  }

  const relatorios: RelatorioMilitar[] = [];

  for (const mil of militares) {
    const lancs: LancamentoAuditado[] = [];
    let horasOrdinarias = 0;
    let horasCM = 0;
    let horasEXP = 0;
    let horasHEt = 0;
    let afastados = 0;
    let acumulado = 0;

    const detalhes: string[] = [];

    for (let d = 1; d <= dias; d++) {
      const col = COL_INI + (d - 1);
      const refOrd = makeRef(mil.rowOrd, col);
      const refExp = makeRef(mil.rowOrd + 1, col);
      const refHe = makeRef(mil.rowOrd + 2, col);

      const vOrd = readCell(bundle, anexo.xml, refOrd).trim();
      const vExp = readCell(bundle, anexo.xml, refExp).trim();
      const vHe = readCell(bundle, anexo.xml, refHe).trim();

      if (vOrd) {
        if (SIGLAS_AFASTAMENTO.has(vOrd)) {
          afastados++;
          lancs.push({
            dia: d, celula: refOrd, linha: "ORD", sigla: vOrd, horas: 0, acumulado,
            observacao: "afastamento (não conta na carga)",
          });
        } else {
          const h = horasOrd(vOrd);
          if (h === 0 && vOrd) {
            detalhes.push(`Dia ${d} célula ${refOrd}: sigla ORD "${vOrd}" não reconhecida — não somou horas.`);
          }
          horasOrdinarias += h;
          acumulado += h;
          lancs.push({ dia: d, celula: refOrd, linha: "ORD", sigla: vOrd, horas: h, acumulado });
        }
      }
      if (vExp) {
        const { tipo, h } = horasComp(vExp);
        if (!tipo) {
          detalhes.push(`Dia ${d} célula ${refExp}: sigla EXP "${vExp}" não reconhecida.`);
        } else {
          if (tipo === "CM") horasCM += h;
          else horasEXP += h;
          acumulado += h;
        }
        lancs.push({ dia: d, celula: refExp, linha: "EXP", sigla: vExp, horas: h, acumulado });
      }
      if (vHe) {
        const h = horasHe(vHe);
        if (h === 0) {
          detalhes.push(`Dia ${d} célula ${refHe}: sigla HE "${vHe}" não reconhecida.`);
        }
        horasHEt += h;
        acumulado += h;
        lancs.push({ dia: d, celula: refHe, linha: "HE", sigla: vHe, horas: h, acumulado });
      }
    }

    /* virada de mês: cada "234" no dia D deve ter continuação em D+1
       ("1" ordinário, ou CM/HE quando a madrugada fecha carga/excedente) */
    for (const l of lancs) {
      if (l.linha === "ORD" && l.sigla === "234" && l.dia < dias) {
        const segOrd = lancs.find((x) => x.dia === l.dia + 1 && x.linha === "ORD");
        const segComp = lancs.find(
          (x) => x.dia === l.dia + 1 && (x.linha === "EXP" || x.linha === "HE") && x.horas > 0,
        );
        if ((!segOrd || segOrd.sigla !== "1") && !segComp) {
          detalhes.push(
            `Dia ${l.dia} célula ${l.celula}: 234 (18h) sem complemento "1" (6h) ou CM/HE no dia ${l.dia + 1} — virada incompleta.`,
          );
        }
      }
    }

    const cargaPrevista = cargaMensalProporcional(dias, afastados);
    const totalFinal = horasOrdinarias + horasCM + horasEXP + horasHEt;
    const diferenca = totalFinal - cargaPrevista;

    const causas: CausaDiagnostico[] = [];
    if (diferenca === 0) {
      causas.push("ok");
    } else {
      const absDif = Math.abs(diferenca);
      if (absDif < 1) causas.push("arredondamento");
      if (detalhes.some((d) => d.includes("não reconhecida"))) causas.push("leitura da planilha");
      if (detalhes.some((d) => d.includes("virada incompleta"))) causas.push("virada de mês");

      // qual bloco mais provável: maior contribuição relativa
      const blocos: Array<{ c: CausaDiagnostico; v: number }> = [
        { c: "CM", v: horasCM },
        { c: "HE", v: horasHEt },
        { c: "EXP", v: horasEXP },
      ];
      blocos.sort((a, b) => b.v - a.v);
      if (blocos[0].v > 0 && causas.length === 0) causas.push(blocos[0].c);
      if (causas.length === 0) causas.push("fórmula do Excel");
    }

    relatorios.push({
      nome: mil.nome,
      matricula: mil.matricula,
      rowOrd: mil.rowOrd,
      diasAfastado: afastados,
      cargaPrevista,
      horasOrdinarias,
      horasCM,
      horasEXP,
      horasHE: horasHEt,
      totalFinal,
      diferenca,
      lancamentos: lancs,
      causas,
      detalhes,
    });
  }

  return { mes, ano, dias, militares: relatorios, alertasGlobais };
}

/* ---------- export CSV ---------- */

export function relatorioParaCsv(rel: RelatorioAuditoria): string {
  const linhas: string[] = [];
  linhas.push(
    [
      "Militar","Matrícula","Dias Afastado","Carga Prevista","ORD","CM","EXP","HE","Total","Diferença","Causas",
    ].join(";"),
  );
  for (const m of rel.militares) {
    linhas.push([
      esc(m.nome), esc(m.matricula), m.diasAfastado, m.cargaPrevista,
      m.horasOrdinarias, m.horasCM, m.horasEXP, m.horasHE,
      m.totalFinal, m.diferenca, esc(m.causas.join(" / ")),
    ].join(";"));
  }
  linhas.push("");
  linhas.push("Detalhamento por lançamento");
  linhas.push(["Militar","Dia","Célula","Linha","Sigla","Horas","Acumulado","Observação"].join(";"));
  for (const m of rel.militares) {
    for (const l of m.lancamentos) {
      linhas.push([
        esc(m.nome), l.dia, l.celula, l.linha, esc(l.sigla),
        l.horas, l.acumulado, esc(l.observacao ?? ""),
      ].join(";"));
    }
  }
  return linhas.join("\n");
}
function esc(s: string | number): string {
  const v = String(s);
  if (/[;"\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}
