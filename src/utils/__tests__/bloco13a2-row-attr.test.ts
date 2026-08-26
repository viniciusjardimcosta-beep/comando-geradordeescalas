/**
 * BLOCO 13A.2 — Integridade do atributo `r` da tag <row> em xlsx-surgical.
 *
 * Correção autorizada: `upsertRow` reinsere `r="N"` na linha reconstruída.
 * Estes testes travam o comportamento (preservação, idempotência, ordem).
 */
import { describe, expect, it } from "vitest";
import { applyEdits } from "../xlsx-surgical";

const rows = (xml: string) => Array.from(xml.matchAll(/<row\b[^>]*>/g)).map((m) => m[0]);
const rowsComR = (xml: string, r: number) =>
  rows(xml).filter((t) => new RegExp(`\\br="${r}"`).test(t));

function sheet(inner: string): string {
  return `<worksheet><sheetData>${inner}</sheetData><mergeCells count="1"><mergeCell ref="A12:B12"/></mergeCells>` +
    `<dataValidations count="1"><dataValidation type="list" sqref="F12:AJ12"><formula1>"234,1,ORD"</formula1></dataValidation></dataValidations></worksheet>`;
}

const LINHA12 =
  `<row r="12" ht="30" customHeight="1" spans="1:6" s="7" customFormat="1" hidden="0" outlineLevel="2">` +
  `<c r="A12" s="3" t="inlineStr"><is><t>orig</t></is></c>` +
  `<c r="B12" s="4"><f>SUM(C12:D12)</f><v>9</v></c>` +
  `<c r="C12" s="5" t="n"><v>42</v></c>` +
  `</row>`;

describe("BLOCO 13A.2 — atributo r da <row>", () => {
  it("1. preserva r=\"12\" após edição, exatamente uma vez", () => {
    const out = applyEdits(sheet(LINHA12), [{ ref: "A12", value: "234" }]);
    expect(rowsComR(out, 12)).toHaveLength(1);
    expect(rows(out)).toHaveLength(1);
    expect(/<row\b[^>]*\br="12"/.test(out)).toBe(true);
  });

  it("2. preserva todos os demais atributos da linha", () => {
    const out = applyEdits(sheet(LINHA12), [{ ref: "A12", value: "ORD" }]);
    const tag = rows(out)[0];
    for (const attr of [
      'r="12"',
      'ht="30"',
      'customHeight="1"',
      'spans="1:6"',
      's="7"',
      'customFormat="1"',
      'hidden="0"',
      'outlineLevel="2"',
    ]) {
      expect(tag).toContain(attr);
    }
  });

  it("3. duas passadas não duplicam a linha 12", () => {
    let xml = applyEdits(sheet(LINHA12), [{ ref: "A12", value: "234" }]);
    xml = applyEdits(xml, [{ ref: "D12", value: "1" }]);
    expect(rowsComR(xml, 12)).toHaveLength(1);
    expect(rows(xml)).toHaveLength(1);
    expect(/<row\s*>/.test(xml)).toBe(false);
    // conteúdo das duas passadas coexiste na MESMA linha
    expect(xml).toContain('<c r="A12"');
    expect(xml).toContain('<c r="D12"');
  });

  it("3b. terceira passada criando nova linha mantém ordem e unicidade", () => {
    let xml = applyEdits(sheet(LINHA12), [{ ref: "A12", value: "a" }]);
    xml = applyEdits(xml, [{ ref: "B13", value: "b" }]);
    xml = applyEdits(xml, [{ ref: "A12", value: "a2" }]);
    expect(rowsComR(xml, 12)).toHaveLength(1);
    expect(rowsComR(xml, 13)).toHaveLength(1);
    expect(xml.indexOf('r="12"')).toBeLessThan(xml.indexOf('r="13"'));
  });

  it("4. linhas não consecutivas (12, 18, 25): r correto, ordem correta, sem duplicação", () => {
    const base = sheet(
      LINHA12 +
        `<row r="18" ht="20"><c r="A18" s="3"/></row>` +
        `<row r="25"><c r="A25" s="3"/></row>`,
    );
    const out = applyEdits(base, [
      { ref: "A12", value: "x" },
      { ref: "A18", value: "y" },
      { ref: "A25", value: "z" },
      { ref: "A20", value: "novo" },
    ]);
    for (const r of [12, 18, 20, 25]) expect(rowsComR(out, r)).toHaveLength(1);
    expect(rows(out)).toHaveLength(4);
    const pos = [12, 18, 20, 25].map((r) => out.indexOf(`r="${r}"`));
    expect(pos).toEqual([...pos].sort((a, b) => a - b));
    expect(rows(out)[1]).toContain('ht="20"');
  });

  it("5. integridade das células: fórmula preservada, estilos, valores e tipos", () => {
    const skipped: string[] = [];
    const out = applyEdits(
      sheet(LINHA12),
      [
        { ref: "A12", value: "FER" },
        { ref: "B12", value: "tentativa" },
        { ref: "C12", value: "234" },
        { ref: "E12", value: "novo" },
      ],
      skipped,
    );
    // fórmula intocada e reportada como pulada
    expect(skipped).toEqual(["B12"]);
    expect(out).toContain("<f>SUM(C12:D12)</f>");
    // estilos preservados
    expect(out).toMatch(/<c r="A12" s="3"[^>]*t="inlineStr"/);
    expect(out).toMatch(/<c r="C12" s="5" t="n"><v>234<\/v><\/c>/);
    // texto vira inlineStr; numérico vira t="n"
    expect(out).toContain("<t xml:space=\"preserve\">FER</t>");
    // célula nova herda estilo de vizinha
    expect(out).toMatch(/<c r="E12" s="[0-9]+"/);
    // merges e validações intactos
    expect(out).toContain('<mergeCell ref="A12:B12"/>');
    expect(out).toContain('<dataValidation type="list" sqref="F12:AJ12">');
  });
});
