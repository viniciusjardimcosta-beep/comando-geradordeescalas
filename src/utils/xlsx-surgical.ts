/**
 * Edição cirúrgica de arquivos .xlsx.
 *
 * Em vez de desserializar o workbook (como ExcelJS faz), abrimos o .xlsx como
 * ZIP, modificamos APENAS o XML das células que precisamos preencher e
 * regravamos o ZIP. Isso preserva 100% do arquivo original:
 * listas suspensas (data validation), formatação condicional, fórmulas,
 * estilos, tabelas, gráficos, macros, etc.
 *
 * Estratégia para escrita: célula como inline string (`t="inlineStr"`).
 * Não precisamos mexer em sharedStrings.xml.
 */

import { unzipSync, zipSync, strToU8, strFromU8 } from "fflate";

export interface XlsxBundle {
  files: Record<string, Uint8Array>;
  /** Mapa: nome de aba (case-insensitive trim) -> caminho interno do XML da sheet */
  sheetByName: Map<string, string>;
  /** sharedStrings (lazy carregada) */
  sharedStrings: string[] | null;
}

const dec = (b: Uint8Array) => strFromU8(b);
const enc = (s: string) => strToU8(s);

/* -------------------------------------------------------------------------- */
/* Carregar / salvar                                                          */
/* -------------------------------------------------------------------------- */

export function loadXlsx(bytes: Uint8Array): XlsxBundle {
  const files = unzipSync(bytes);

  const wbXml = files["xl/workbook.xml"] ? dec(files["xl/workbook.xml"]) : "";
  const relsXml = files["xl/_rels/workbook.xml.rels"]
    ? dec(files["xl/_rels/workbook.xml.rels"])
    : "";

  // Mapear rId -> Target (caminho do XML). Atributos podem vir em qualquer ordem.
  const rIdToTarget = new Map<string, string>();
  for (const m of relsXml.matchAll(/<Relationship\b([^>]*)\/>/g)) {
    const attrs = m[1];
    const id = /\bId="([^"]+)"/.exec(attrs)?.[1];
    const target = /\bTarget="([^"]+)"/.exec(attrs)?.[1];
    if (id && target) rIdToTarget.set(id, target);
  }

  // Mapear nome da aba -> rId. Atributos podem estar em qualquer ordem.
  const sheetByName = new Map<string, string>();
  for (const m of wbXml.matchAll(/<sheet\b([^>]*)\/>/g)) {
    const attrs = m[1];
    const name = /\bname="([^"]+)"/.exec(attrs)?.[1];
    const rid = /\br:id="([^"]+)"/.exec(attrs)?.[1];
    if (!name || !rid) continue;
    const target = rIdToTarget.get(rid);
    if (!target) continue;
    const path = target.startsWith("/")
      ? target.slice(1)
      : `xl/${target.replace(/^\.?\//, "")}`;
    sheetByName.set(decodeXmlAttr(name).trim().toLowerCase(), path);
  }

  return { files, sheetByName, sharedStrings: null };
}

export function saveXlsx(bundle: XlsxBundle): Uint8Array {
  return zipSync(bundle.files, { level: 6 });
}

/* -------------------------------------------------------------------------- */
/* Leitura de células                                                         */
/* -------------------------------------------------------------------------- */

function ensureSharedStrings(bundle: XlsxBundle): string[] {
  if (bundle.sharedStrings) return bundle.sharedStrings;
  const buf = bundle.files["xl/sharedStrings.xml"];
  if (!buf) {
    bundle.sharedStrings = [];
    return bundle.sharedStrings;
  }
  const xml = dec(buf);
  const out: string[] = [];
  // Cada <si> é uma string. Pode conter <t> simples ou múltiplos <r><t>.
  for (const m of xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
    const inner = m[1];
    let text = "";
    for (const t of inner.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) {
      text += decodeXmlText(t[1]);
    }
    out.push(text);
  }
  bundle.sharedStrings = out;
  return out;
}

export function getSheetXml(bundle: XlsxBundle, sheetNameLike: string): {
  path: string;
  xml: string;
} {
  const key = sheetNameLike.trim().toLowerCase();
  let path = bundle.sheetByName.get(key);
  if (!path) {
    // tentativa fuzzy: contém
    for (const [n, p] of bundle.sheetByName.entries()) {
      if (n.includes(key)) {
        path = p;
        break;
      }
    }
  }
  if (!path) throw new Error(`Aba não encontrada: ${sheetNameLike}`);
  const buf = bundle.files[path];
  if (!buf) throw new Error(`XML da aba ausente no arquivo: ${path}`);
  return { path, xml: dec(buf) };
}

/**
 * Lê uma célula específica como string. Resolve sharedStrings, números,
 * inline strings e booleanos. Não avalia fórmulas — devolve o `<v>` cacheado
 * quando existir.
 */
export function readCell(
  bundle: XlsxBundle,
  sheetXml: string,
  ref: string,
): string {
  // <c r="REF" ... > ... </c>
  const re = new RegExp(
    `<c\\b([^>]*?)\\br="${ref}"([^>]*)(?:/>|>([\\s\\S]*?)</c>)`,
    "",
  );
  const m = sheetXml.match(re);
  if (!m) return "";
  const attrsBefore = m[1] || "";
  const attrsAfter = m[2] || "";
  const inner = m[3] || "";
  const allAttrs = attrsBefore + " " + attrsAfter;
  const t = /\bt="([^"]+)"/.exec(allAttrs)?.[1] ?? "n";

  if (!inner) return "";

  if (t === "s") {
    const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
    if (!v) return "";
    const idx = Number(v);
    const ss = ensureSharedStrings(bundle);
    return ss[idx] ?? "";
  }
  if (t === "inlineStr" || t === "str") {
    let text = "";
    for (const tm of inner.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) {
      text += decodeXmlText(tm[1]);
    }
    return text;
  }
  if (t === "b") {
    const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? "";
    return v === "1" ? "TRUE" : "FALSE";
  }
  // número
  const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? "";
  return v;
}

/**
 * Itera linhas de uma aba retornando (rowNumber, mapa coluna->ref).
 * Útil para descobrir o intervalo usado.
 */
export function iterRows(sheetXml: string): Array<{ r: number; cells: string[] }> {
  const out: Array<{ r: number; cells: string[] }> = [];
  for (const rm of sheetXml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const r = Number(/\br="(\d+)"/.exec(rm[1])?.[1] ?? "0");
    const refs: string[] = [];
    for (const cm of rm[2].matchAll(/<c\b[^>]*\br="([^"]+)"/g)) refs.push(cm[1]);
    out.push({ r, cells: refs });
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Escrita de células                                                         */
/* -------------------------------------------------------------------------- */

export interface CellEdit {
  ref: string;
  /** valor a escrever (string). Use "" para limpar. */
  value: string;
  /**
   * Se true, força a célula a virar inline string mesmo se contiver fórmula.
   * Default: false — células com fórmula são PRESERVADAS por padrão.
   */
  overwriteFormula?: boolean;
}

/** Lista de refs (ex: "F12") que foram puladas porque contêm fórmula. */
export type SkippedFormulaRefs = string[];

/**
 * Aplica um conjunto de edições ao XML da sheet e devolve o XML novo.
 * - Mantém o atributo `s=` (estilo) original quando a célula já existe.
 * - Se a célula não existe, cria-a dentro da `<row>` correspondente,
 *   criando a `<row>` se necessário, mantendo ordem por coluna.
 */
export function applyEdits(sheetXml: string, edits: CellEdit[], skipped?: SkippedFormulaRefs): string {
  if (edits.length === 0) return sheetXml;

  // Agrupar edições por linha
  const byRow = new Map<number, CellEdit[]>();
  for (const e of edits) {
    const { row } = parseRef(e.ref);
    const arr = byRow.get(row) ?? [];
    arr.push(e);
    byRow.set(row, arr);
  }

  let xml = sheetXml;

  // Garantir <sheetData>
  const sdMatch = /<sheetData\b([^>]*)>([\s\S]*?)<\/sheetData>/.exec(xml);
  const sdSelfClose = /<sheetData\b([^>]*)\/>/.exec(xml);
  if (!sdMatch && !sdSelfClose) {
    throw new Error("sheetData não encontrado no XML da aba.");
  }
  if (sdSelfClose && !sdMatch) {
    xml = xml.replace(sdSelfClose[0], `<sheetData${sdSelfClose[1]}></sheetData>`);
  }

  for (const [rowNum, rowEdits] of byRow.entries()) {
    xml = upsertRow(xml, rowNum, rowEdits, skipped);
  }

  return xml;
}

function upsertRow(xml: string, rowNum: number, edits: CellEdit[], skipped?: SkippedFormulaRefs): string {
  const rowRe = new RegExp(
    `<row\\b([^>]*)\\br="${rowNum}"([^>]*)(?:/>|>([\\s\\S]*?)</row>)`,
    "",
  );
  const m = rowRe.exec(xml);

  if (!m) {
    // Criar nova <row> e inseri-la no lugar certo dentro do <sheetData>
    const newRowXml = buildRow(rowNum, edits, null);
    return insertRowInOrder(xml, rowNum, newRowXml);
  }

  const attrsBefore = m[1] || "";
  const attrsAfter = m[2] || "";
  const inner = m[3] || "";
  const allAttrs = (attrsBefore + " " + attrsAfter).trim();

  // Mapear células existentes
  const existing = new Map<
    string,
    { full: string; styleAttr: string; hasFormula: boolean }
  >();
  for (const cm of inner.matchAll(/<c\b[^>]*\/>|<c\b[^>]*>[\s\S]*?<\/c>/g)) {
    const refMatch = /\br="([^"]+)"/.exec(cm[0]);
    if (!refMatch) continue;
    const styleMatch = /\bs="([^"]+)"/.exec(cm[0]);
    const hasFormula = /<f\b/.test(cm[0]);
    existing.set(refMatch[1], {
      full: cm[0],
      styleAttr: styleMatch ? ` s="${styleMatch[1]}"` : "",
      hasFormula,
    });
  }

  // Aplicar edições nas existentes; coletar adições
  const editByRef = new Map(edits.map((e) => [e.ref, e]));
  const additions: { ref: string; xml: string }[] = [];

  let newInner = inner;
  for (const [ref, e] of editByRef.entries()) {
    const ex = existing.get(ref);
    if (ex) {
      // PROTEÇÃO DE FÓRMULAS: nunca sobrescrever célula com fórmula a menos que pedido explicitamente
      if (ex.hasFormula && !e.overwriteFormula) {
        if (skipped) skipped.push(ref);
        continue;
      }
      const cellXml = buildCell(ref, e.value, ex.styleAttr);
      newInner = newInner.replace(ex.full, cellXml);
    } else {
      // Tentar herdar estilo de uma célula vizinha na mesma linha
      const inheritedStyle = pickNearestStyle(existing, ref);
      additions.push({
        ref,
        xml: buildCell(ref, e.value, inheritedStyle),
      });
    }
  }

  // Inserir novas células ordenadas por coluna
  if (additions.length) {
    newInner = insertCellsInOrder(newInner, additions);
  }

  // O atributo r="N" é consumido pela regex; reinseri-lo é obrigatório para
  // manter o índice da linha (idempotência em edições subsequentes).
  const rebuilt = `<row r="${rowNum}"${allAttrs ? " " + allAttrs : ""}>${newInner}</row>`;
  return xml.replace(m[0], rebuilt);
}

function pickNearestStyle(
  existing: Map<string, { full: string; styleAttr: string }>,
  ref: string,
): string {
  const target = parseRef(ref).col;
  let best: { dist: number; styleAttr: string } | null = null;
  for (const [r, info] of existing.entries()) {
    if (!info.styleAttr) continue;
    const c = parseRef(r).col;
    const d = Math.abs(c - target);
    if (!best || d < best.dist) best = { dist: d, styleAttr: info.styleAttr };
  }
  return best?.styleAttr ?? "";
}

function insertCellsInOrder(
  innerXml: string,
  additions: { ref: string; xml: string }[],
): string {
  // Coletar todas as células com posição
  const cells: { ref: string; col: number; xml: string }[] = [];
  for (const cm of innerXml.matchAll(/<c\b[^>]*\/>|<c\b[^>]*>[\s\S]*?<\/c>/g)) {
    const refMatch = /\br="([^"]+)"/.exec(cm[0]);
    if (!refMatch) continue;
    cells.push({
      ref: refMatch[1],
      col: parseRef(refMatch[1]).col,
      xml: cm[0],
    });
  }
  for (const a of additions) {
    cells.push({ ref: a.ref, col: parseRef(a.ref).col, xml: a.xml });
  }
  cells.sort((a, b) => a.col - b.col);

  // Preservar conteúdo não-célula (raríssimo, mas seguro)
  const nonCell = innerXml.replace(/<c\b[^>]*\/>|<c\b[^>]*>[\s\S]*?<\/c>/g, "");
  return nonCell + cells.map((c) => c.xml).join("");
}

function insertRowInOrder(xml: string, rowNum: number, rowXml: string): string {
  // Encontrar row anterior mais próxima
  let inserted = false;
  let result = xml;
  const rows = Array.from(xml.matchAll(/<row\b[^>]*\br="(\d+)"[^>]*(?:\/>|>[\s\S]*?<\/row>)/g));
  for (let i = 0; i < rows.length; i++) {
    const r = Number(rows[i][1]);
    if (r > rowNum) {
      // inserir antes desta
      const idx = rows[i].index!;
      result = xml.slice(0, idx) + rowXml + xml.slice(idx);
      inserted = true;
      break;
    }
  }
  if (!inserted) {
    // inserir antes de </sheetData>
    result = xml.replace("</sheetData>", `${rowXml}</sheetData>`);
  }
  return result;
}

function buildRow(rowNum: number, edits: CellEdit[], _style: null): string {
  const cells = edits
    .slice()
    .sort((a, b) => parseRef(a.ref).col - parseRef(b.ref).col)
    .map((e) => buildCell(e.ref, e.value, ""))
    .join("");
  return `<row r="${rowNum}">${cells}</row>`;
}

function buildCell(ref: string, value: string, styleAttr: string): string {
  if (value === "" || value == null) {
    // célula vazia preservando estilo
    return `<c r="${ref}"${styleAttr}/>`;
  }
  // Valores numéricos puros: gravar como célula numérica nativa (t="n")
  // para casar com listas de validação que armazenam números (ex.: 234, 1).
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return `<c r="${ref}"${styleAttr} t="n"><v>${value}</v></c>`;
  }
  return `<c r="${ref}"${styleAttr} t="inlineStr"><is><t xml:space="preserve">${encodeXmlText(value)}</t></is></c>`;
}

/* -------------------------------------------------------------------------- */
/* Persistir alterações em uma sheet                                          */
/* -------------------------------------------------------------------------- */

export function writeSheetXml(
  bundle: XlsxBundle,
  sheetPath: string,
  newXml: string,
): void {
  bundle.files[sheetPath] = enc(newXml);
}

/* -------------------------------------------------------------------------- */
/* Helpers de referência A1                                                   */
/* -------------------------------------------------------------------------- */

export function colNumToLetters(n: number): string {
  // 1 -> A
  let s = "";
  let x = n;
  while (x > 0) {
    const r = (x - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s;
}

export function lettersToColNum(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) {
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n;
}

export function makeRef(row: number, col: number): string {
  return `${colNumToLetters(col)}${row}`;
}

export function parseRef(ref: string): { row: number; col: number } {
  const m = /^([A-Z]+)(\d+)$/.exec(ref);
  if (!m) throw new Error(`ref inválida: ${ref}`);
  return { col: lettersToColNum(m[1]), row: Number(m[2]) };
}

/* -------------------------------------------------------------------------- */
/* XML escape                                                                 */
/* -------------------------------------------------------------------------- */

function encodeXmlText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function decodeXmlText(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, "&");
}

function decodeXmlAttr(s: string): string {
  return decodeXmlText(s);
}
