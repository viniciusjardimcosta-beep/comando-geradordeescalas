import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import * as XLSXReal from "xlsx";
import {
  lerPlanilhaMeta,
  detectAnexoB,
  detectMesAnoAnexoB,
  type XlsxModule,
} from "@/lib/escalas/planilhaMeta";

function mkFile(sheets: Record<string, unknown[][]>): File {
  const wb = XLSXReal.utils.book_new();
  for (const [n, rows] of Object.entries(sheets)) {
    XLSXReal.utils.book_append_sheet(wb, XLSXReal.utils.aoa_to_sheet(rows), n);
  }
  const buf = XLSXReal.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return new File([buf], "fict.xlsx");
}

const fixture = () =>
  mkFile({ Efetivo: [["ID Func", "Nome"], ["000001", "Militar Fictício"]], "Anexo B - Escala": [["ESCALA MARÇO/2030"]] });

describe("BLOCO 14B.3 — lazy load do xlsx", () => {
  it("A. rota não possui import estático de xlsx (nem helpers diretos)", () => {
    const rota = readFileSync("src/routes/app.importar.tsx", "utf8");
    expect(rota).not.toMatch(/^\s*import\s+[^;]*from\s+["']xlsx["']/m);
    const helper = readFileSync("src/lib/escalas/planilhaMeta.ts", "utf8");
    expect(helper).not.toMatch(/^\s*import\s+(?!type)[^;]*from\s+["']xlsx["']/m);
  });

  it("B. módulo só é carregado quando a leitura começa", async () => {
    const loader = vi.fn(async () => XLSXReal as unknown as XlsxModule);
    const f = fixture();
    expect(loader).not.toHaveBeenCalled();
    await lerPlanilhaMeta(f, loader);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("C/G. importação válida produz resultado idêntico à lógica anterior", async () => {
    const f = fixture();
    const meta = await lerPlanilhaMeta(f, async () => XLSXReal as unknown as XlsxModule);
    const wb = XLSXReal.read(await f.arrayBuffer(), { type: "array" });
    const nome = detectAnexoB(wb.SheetNames)!;
    expect(meta).toEqual({
      sheetNames: ["Efetivo", "Anexo B - Escala"],
      anexoBName: "Anexo B - Escala",
      ...detectMesAnoAnexoB(XLSXReal as unknown as XlsxModule, wb, nome),
    });
    expect(meta.mes).toBe(3);
    expect(meta.ano).toBe(2030);
  });

  it("C. loader padrão (import dinâmico real) funciona", async () => {
    const meta = await lerPlanilhaMeta(fixture());
    expect(meta.anexoBName).toBe("Anexo B - Escala");
  });

  it("planilha sem Anexo B mantém comportamento (anexoBName null)", async () => {
    const meta = await lerPlanilhaMeta(mkFile({ Outra: [["x"]] }));
    expect(meta).toEqual({ sheetNames: ["Outra"], anexoBName: null, mes: undefined, ano: undefined });
  });

  it("D/E/F. falha no import dinâmico rejeita (tratável) e retry funciona", async () => {
    let n = 0;
    const loader = vi.fn(async () => {
      if (n++ === 0) throw new Error("chunk load failed");
      return XLSXReal as unknown as XlsxModule;
    });
    let loading = true;
    const tentar = async () => {
      loading = true;
      try { return await lerPlanilhaMeta(fixture(), loader); }
      catch { return "erro" as const; }
      finally { loading = false; }
    };
    expect(await tentar()).toBe("erro");
    expect(loading).toBe(false);
    const ok = await tentar();
    expect(ok).not.toBe("erro");
    expect(loading).toBe(false);
  });

  it("arquivo corrompido não-zip é rejeitado ou lido sem Anexo B (sem crash silencioso)", async () => {
    const bad = new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4, 5])], "x.xlsx");
    let r: unknown;
    try { r = await lerPlanilhaMeta(bad); } catch (e) { r = e; }
    if (r instanceof Error) expect(r).toBeInstanceOf(Error);
    else expect((r as { anexoBName: string | null }).anexoBName).toBeNull();
  });
});
