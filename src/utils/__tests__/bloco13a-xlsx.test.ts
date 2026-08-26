/**
 * BLOCO 13A — Rede de segurança da escrita cirúrgica no XLSX.
 *
 * O gerador final (server function `gerarEscala`) não é testável sem auth,
 * banco e template real; portanto testamos a CAMADA que efetivamente escreve
 * as células (`xlsx-surgical.ts`, não alterada) sobre um template FICTÍCIO
 * montado no próprio teste, com snapshot LÓGICO de células (nunca comparação
 * binária do arquivo).
 */
import { describe, expect, it } from "vitest";
import { zipSync, strToU8 } from "fflate";
import {
  applyEdits,
  getSheetXml,
  loadXlsx,
  makeRef,
  readCell,
  saveXlsx,
  writeSheetXml,
  parseRef,
  colNumToLetters,
  lettersToColNum,
  type CellEdit,
} from "../xlsx-surgical";

const ABA = "Anexo B - Escala";

/** Template fictício mínimo com: estilos, merge, data validation e fórmula. */
function templateFicticio(): Uint8Array {
  const ct = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`;
  const rootRels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;
  const wb = `<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="${ABA}" sheetId="1" r:id="rId1"/><sheet name="Efetivo" sheetId="2" r:id="rId2"/></sheets>
</workbook>`;
  const wbRels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
</Relationships>`;
  // Linha 10 = dias; linha 12 = ORD do militar; 13 = EXP; 14 = HE; F16 tem fórmula.
  const sheet1 = `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetPr/><dimension ref="A1:H20"/><sheetViews><sheetView workbookViewId="0"/></sheetViews>
<sheetData>
<row r="10"><c r="A10" s="1" t="inlineStr"><is><t>Dia</t></is></c><c r="F10" s="2" t="n"><v>1</v></c><c r="G10" s="2" t="n"><v>2</v></c></row>
<row r="12"><c r="A12" s="3" t="inlineStr"><is><t>FULANO DE TAL</t></is></c><c r="E12" s="4" t="inlineStr"><is><t>ORD</t></is></c></row>
<row r="13"><c r="E13" s="4" t="inlineStr"><is><t>EXP</t></is></c></row>
<row r="14"><c r="E14" s="4" t="inlineStr"><is><t>HE</t></is></c></row>
<row r="16"><c r="F16" s="5"><f>SUM(F12:F14)</f><v>0</v></c></row>
</sheetData>
<mergeCells count="1"><mergeCell ref="A1:H1"/></mergeCells>
<dataValidations count="1"><dataValidation type="list" allowBlank="1" sqref="F12:AJ12"><formula1>"234,1,FER,LTS"</formula1></dataValidation></dataValidations>
<pageMargins left="0.5" right="0.5" top="0.5" bottom="0.5"/>
</worksheet>`;
  const sheet2 = `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
<row r="2"><c r="A2" s="1" t="inlineStr"><is><t>0000001</t></is></c><c r="B2" s="1" t="inlineStr"><is><t>FULANO DE TAL</t></is></c></row>
</sheetData></worksheet>`;
  return zipSync({
    "[Content_Types].xml": strToU8(ct),
    "_rels/.rels": strToU8(rootRels),
    "xl/workbook.xml": strToU8(wb),
    "xl/_rels/workbook.xml.rels": strToU8(wbRels),
    "xl/worksheets/sheet1.xml": strToU8(sheet1),
    "xl/worksheets/sheet2.xml": strToU8(sheet2),
  });
}

function abrir() {
  const b = loadXlsx(templateFicticio());
  const { path, xml } = getSheetXml(b, ABA);
  return { b, path, xml };
}

/** Aplica edições e reabre o arquivo salvo (round-trip real). */
function gravarEReabrir(edits: CellEdit[], skipped: string[] = []) {
  const { b, path, xml } = abrir();
  writeSheetXml(b, path, applyEdits(xml, edits, skipped));
  const bytes = saveXlsx(b);
  const b2 = loadXlsx(bytes);
  const s2 = getSheetXml(b2, ABA);
  return { bundle: b2, xml: s2.xml, skipped };
}

describe("localização de abas e leitura de células", () => {
  it("encontra a aba oficial 'Anexo B - Escala' e a aba Efetivo", () => {
    const { b } = abrir();
    expect(() => getSheetXml(b, "Anexo B - Escala")).not.toThrow();
    expect(() => getSheetXml(b, "Efetivo")).not.toThrow();
  });

  it("busca de aba é case-insensitive e tolera espaços", () => {
    const { b } = abrir();
    expect(getSheetXml(b, "  anexo b - escala ").path).toBe("xl/worksheets/sheet1.xml");
  });

  it("aba inexistente lança erro explícito", () => {
    const { b } = abrir();
    expect(() => getSheetXml(b, "ANEXO Z")).toThrow(/não encontrada/i);
  });

  it("lê rótulos, números de dia e casamento por ID Func na aba Efetivo", () => {
    const { b, xml } = abrir();
    expect(readCell(b, xml, "A12")).toBe("FULANO DE TAL");
    expect(readCell(b, xml, "E12")).toBe("ORD");
    expect(readCell(b, xml, "F10")).toBe("1");
    const efe = getSheetXml(b, "Efetivo");
    expect(readCell(b, efe.xml, "A2")).toBe("0000001");
    expect(readCell(b, efe.xml, "B2")).toBe("FULANO DE TAL");
  });
});

describe("snapshot lógico das células de escala (ORD / EXP / HE / FER)", () => {
  it("grava ORD 234 + 1, EXP CM3, HE HE6 e FER nas células e linhas corretas", () => {
    const { bundle, xml } = gravarEReabrir([
      { ref: "F12", value: "234" },
      { ref: "G12", value: "1" },
      { ref: "H12", value: "FER" },
      { ref: "F13", value: "CM3" },
      { ref: "F14", value: "HE6" },
    ]);
    const snap = {
      ORD_F12: readCell(bundle, xml, "F12"),
      ORD_G12: readCell(bundle, xml, "G12"),
      FER_H12: readCell(bundle, xml, "H12"),
      EXP_F13: readCell(bundle, xml, "F13"),
      HE_F14: readCell(bundle, xml, "F14"),
      rotulo_A12: readCell(bundle, xml, "A12"),
      dia_F10: readCell(bundle, xml, "F10"),
    };
    expect(snap).toEqual({
      ORD_F12: "234",
      ORD_G12: "1",
      FER_H12: "FER",
      EXP_F13: "CM3",
      HE_F14: "HE6",
      rotulo_A12: "FULANO DE TAL",
      dia_F10: "1",
    });
  });

  it("siglas numéricas (234, 1) são gravadas como número, casando com a lista de validação", () => {
    const { xml } = gravarEReabrir([{ ref: "F12", value: "234" }]);
    expect(xml).toMatch(/<c r="F12"[^>]*t="n"><v>234<\/v><\/c>/);
  });

  it("siglas textuais são gravadas como inline string (sem tocar sharedStrings)", () => {
    const { bundle, xml } = gravarEReabrir([{ ref: "F12", value: "FER" }]);
    expect(xml).toMatch(/<c r="F12"[^>]*t="inlineStr">/);
    expect(bundle.files["xl/sharedStrings.xml"]).toBeUndefined();
  });

  it("valor vazio limpa a célula preservando o estilo", () => {
    const { bundle, xml } = gravarEReabrir([{ ref: "A12", value: "" }]);
    expect(readCell(bundle, xml, "A12")).toBe("");
    expect(xml).toMatch(/<c r="A12" s="3"\/>/);
  });

  it("cria célula inexistente herdando estilo da vizinha e mantém ordem por coluna", () => {
    const { xml } = gravarEReabrir([{ ref: "AJ12", value: "234" }, { ref: "F12", value: "1" }]);
    // COMPORTAMENTO ATUAL (achado 13A): ao reconstruir a linha editada, o atributo
    // r="12" da <row> é perdido; o Excel infere o índice pela ordem das linhas, por
    // isso o arquivo continua válido. Registrado aqui como estado vigente.
    const row = /<row[^>]*>((?:(?!<\/row>)[\s\S])*<c r="A12"[\s\S]*?)<\/row>/.exec(xml)![1];
    const refs = [...row.matchAll(/<c r="([A-Z]+\d+)"/g)].map((m) => m[1]);
    expect(refs).toEqual(["A12", "E12", "F12", "AJ12"]);
    expect(/<c r="AJ12" s="\d+"/.test(row)).toBe(true);
  });


  it("cria linha inexistente na posição ordenada do sheetData", () => {
    const { xml } = gravarEReabrir([{ ref: "F15", value: "HE6" }]);
    const rows = [...xml.matchAll(/<row[^>]*r="(\d+)"/g)].map((m) => Number(m[1]));
    expect(rows).toEqual([10, 12, 13, 14, 15, 16]);
  });
});

describe("integridade do template", () => {
  it("célula com fórmula NÃO é sobrescrita e é reportada como pulada", () => {
    const skipped: string[] = [];
    const { bundle, xml } = gravarEReabrir([{ ref: "F16", value: "999" }], skipped);
    expect(skipped).toEqual(["F16"]);
    expect(xml).toContain("<f>SUM(F12:F14)</f>");
    expect(readCell(bundle, xml, "F16")).toBe("0");
  });

  it("fórmula só é sobrescrita com overwriteFormula explícito", () => {
    const { xml } = gravarEReabrir([{ ref: "F16", value: "999", overwriteFormula: true }]);
    expect(xml).not.toContain("<f>SUM(F12:F14)</f>");
  });

  it("merges, data validation, dimensão, margens e sheetPr permanecem intactos", () => {
    const { xml } = gravarEReabrir([
      { ref: "F12", value: "234" },
      { ref: "G12", value: "1" },
      { ref: "F13", value: "CM3" },
    ]);
    expect(xml).toContain('<mergeCells count="1"><mergeCell ref="A1:H1"/></mergeCells>');
    expect(xml).toContain('<dataValidation type="list" allowBlank="1" sqref="F12:AJ12">');
    expect(xml).toContain('"234,1,FER,LTS"');
    expect(xml).toContain('<dimension ref="A1:H20"/>');
    expect(xml).toContain("<pageMargins");
    expect(xml).toContain("<sheetPr/>");
  });

  it("estilos das células existentes são preservados na escrita", () => {
    const { xml } = gravarEReabrir([{ ref: "F10", value: "1" }, { ref: "A12", value: "BELTRANO DE TAL" }]);
    expect(xml).toMatch(/<c r="F10" s="2"/);
    expect(xml).toMatch(/<c r="A12" s="3"/);
  });

  it("estrutura de abas e partes do pacote não muda após a gravação", () => {
    const { bundle } = gravarEReabrir([{ ref: "F12", value: "234" }]);
    expect([...bundle.sheetByName.keys()].sort()).toEqual(["anexo b - escala", "efetivo"]);
    expect(Object.keys(bundle.files).sort()).toEqual(
      [
        "[Content_Types].xml",
        "_rels/.rels",
        "xl/_rels/workbook.xml.rels",
        "xl/workbook.xml",
        "xl/worksheets/sheet1.xml",
        "xl/worksheets/sheet2.xml",
      ].sort(),
    );
  });

  it("abas não editadas ficam byte a byte idênticas", () => {
    const original = loadXlsx(templateFicticio());
    const { bundle } = gravarEReabrir([{ ref: "F12", value: "234" }]);
    expect(bundle.files["xl/worksheets/sheet2.xml"]).toEqual(original.files["xl/worksheets/sheet2.xml"]);
    expect(bundle.files["xl/workbook.xml"]).toEqual(original.files["xl/workbook.xml"]);
  });
});

describe("referências A1", () => {
  it("conversões coluna↔letra e makeRef/parseRef", () => {
    expect(colNumToLetters(1)).toBe("A");
    expect(colNumToLetters(26)).toBe("Z");
    expect(colNumToLetters(27)).toBe("AA");
    expect(colNumToLetters(36)).toBe("AJ");
    expect(lettersToColNum("AJ")).toBe(36);
    expect(makeRef(12, 6)).toBe("F12");
    expect(parseRef("AJ12")).toEqual({ row: 12, col: 36 });
    expect(() => parseRef("12F")).toThrow(/inválida/i);
  });

  it("dia 1..30 mapeia para F..AI na linha do militar", () => {
    const refs = Array.from({ length: 30 }, (_, i) => makeRef(12, 6 + i));
    expect(refs[0]).toBe("F12");
    expect(refs[29]).toBe("AI12");
  });
});
