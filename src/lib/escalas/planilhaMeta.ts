// BLOCO 14B.3 — PERF-04: leitura de metadados da planilha com carregamento
// dinâmico (lazy) da biblioteca xlsx. A lógica de detecção é idêntica à que
// existia em src/routes/app.importar.tsx — apenas foi movida para cá.
import type * as XLSXType from "xlsx";

export type XlsxModule = typeof XLSXType;

/** Carregamento dinâmico: o módulo só entra na rede quando a leitura começa. */
export const carregarXlsx = (): Promise<XlsxModule> => import("xlsx");

export function detectAnexoB(names: string[]) {
  return names.find((n) => n.trim().toLowerCase().includes("anexo b"));
}

/** Tenta achar mês/ano escrito na aba Anexo B (procura "MES" e "ANO" ou string tipo "Janeiro/2026"). */
export function detectMesAnoAnexoB(
  XLSX: XlsxModule,
  wb: XLSXType.WorkBook,
  anexoBName: string,
): { mes?: number; ano?: number } {
  const ws = wb.Sheets[anexoBName];
  if (!ws) return {};
  const mesesNomes = ["janeiro","fevereiro","março","marco","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
  const range = ws["!ref"] ? XLSX.utils.decode_range(ws["!ref"]) : null;
  if (!range) return {};
  const maxRow = Math.min(range.e.r, 12);
  for (let r = 0; r <= maxRow; r++) {
    for (let c = range.s.c; c <= Math.min(range.e.c, 30); c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      const v = cell?.v;
      if (typeof v !== "string") continue;
      const lower = v.toLowerCase();
      for (let i = 0; i < mesesNomes.length; i++) {
        if (lower.includes(mesesNomes[i])) {
          const anoMatch = lower.match(/(20\d{2})/);
          const mapMes = i <= 2 ? i + 1 : i === 3 ? 3 : i; // marco também = 3
          return { mes: mapMes, ano: anoMatch ? Number(anoMatch[1]) : undefined };
        }
      }
    }
  }
  return {};
}

export type PlanilhaMeta = {
  sheetNames: string[];
  anexoBName: string | null;
  mes?: number;
  ano?: number;
};

/**
 * Lê a planilha e devolve os metadados usados pela tela de importação.
 * `loader` é injetável apenas para testes; em produção usa o import dinâmico.
 */
export async function lerPlanilhaMeta(
  file: File,
  loader: () => Promise<XlsxModule> = carregarXlsx,
): Promise<PlanilhaMeta> {
  const XLSX = await loader();
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const found = detectAnexoB(wb.SheetNames);
  const det = found ? detectMesAnoAnexoB(XLSX, wb, found) : {};
  return { sheetNames: wb.SheetNames, anexoBName: found ?? null, mes: det.mes, ano: det.ano };
}
