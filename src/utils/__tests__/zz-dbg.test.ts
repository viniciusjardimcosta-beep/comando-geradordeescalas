import { it } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { loadXlsx, getSheetXml, applyEdits } from "../xlsx-surgical";
const sheet1 = `<worksheet><sheetData>
<row r="10"><c r="F10" s="2" t="n"><v>1</v></c></row>
<row r="12"><c r="A12" s="3" t="inlineStr"><is><t>FULANO DE TAL</t></is></c><c r="E12" s="4" t="inlineStr"><is><t>ORD</t></is></c></row>
</sheetData></worksheet>`;
it("dbg", () => {
  const b = loadXlsx(zipSync({
    "[Content_Types].xml": strToU8("<Types/>"),
    "xl/workbook.xml": strToU8('<workbook xmlns:r="x"><sheets><sheet name="Anexo B - Escala" sheetId="1" r:id="rId1"/></sheets></workbook>'),
    "xl/_rels/workbook.xml.rels": strToU8('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'),
    "xl/worksheets/sheet1.xml": strToU8(sheet1),
  }));
  const { xml } = getSheetXml(b, "Anexo B - Escala");
  console.log(applyEdits(xml, [{ ref: "AJ12", value: "234" }, { ref: "F12", value: "1" }]));
});
