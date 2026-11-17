// Zet de tabellen uit een chatantwoord om in een Excel-bestand (.xlsx), in de
// browser. Elke tabel krijgt een eigen tabblad, met de kop vet en vast, een
// filter erop en getallen als echte getallen, zodat je er meteen mee rekent.

import { splitAnswer } from './chatFiles';
import { parseBlocks, plainInline, type Block } from './markdownBlocks';
import { fileNameFrom, XML_HEAD, xmlEscape, zipOffice } from './officeXml';

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

interface FoundTable {
  name: string;
  header: string[];
  rows: string[][];
}

/** De tabellen in een antwoord, met de kop erboven als naam. */
export function findTables(markdown: string): FoundTable[] {
  const tables: FoundTable[] = [];
  let lastHeading = '';
  for (const segment of splitAnswer(markdown)) {
    if (segment.kind !== 'text') continue;
    for (const block of parseBlocks(segment.text) as Block[]) {
      if (block.kind === 'heading' || block.kind === 'label') lastHeading = plainInline(block.text);
      if (block.kind === 'table') {
        tables.push({
          name: lastHeading,
          header: block.header.map(plainInline),
          rows: block.rows.map((row) => block.header.map((_, i) => plainInline(row[i] ?? ''))),
        });
        lastHeading = '';
      }
    }
  }
  return tables;
}

/** Heeft dit antwoord een tabel? Snel genoeg om bij elk antwoord te vragen. */
export function hasTable(markdown: string): boolean {
  return /^\s*\|.*\|\s*$/m.test(markdown) && findTables(markdown).length > 0;
}

type CellValue =
  | { kind: 'text'; text: string }
  | { kind: 'number'; value: number; format: 'integer' | 'decimal' | 'percent' | 'euro' };

/** "1.234,5", "12%" en "€ 1.200" worden getallen; de rest blijft tekst. */
function readCell(raw: string): CellValue {
  const text = raw.trim();
  const match = /^(-?)\s*(€)?\s*(-?)(\d{1,3}(?:\.\d{3})+|\d+)(,\d+)?\s*(%)?$/.exec(text);
  if (!match || (match[2] && match[6])) return { kind: 'text', text };
  const [, sign1, euro, sign2, whole, fraction, percent] = match;
  // Een getal met een voorloopnul (postcode, zaaknummer) blijft tekst.
  if (/^0\d/.test(whole)) return { kind: 'text', text };
  let value = Number(`${whole.replace(/\./g, '')}${fraction ? '.' + fraction.slice(1) : ''}`);
  if (sign1 || sign2) value = -value;
  if (percent) return { kind: 'number', value: value / 100, format: 'percent' };
  return { kind: 'number', value, format: euro ? 'euro' : fraction ? 'decimal' : 'integer' };
}

function columnName(index: number): string {
  let name = '';
  let n = index + 1;
  while (n > 0) {
    const rest = (n - 1) % 26;
    name = String.fromCharCode(65 + rest) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

/** Tabbladnamen: hoogstens 31 tekens, zonder []:*?/\ en niet dubbel. */
function sheetNames(tables: FoundTable[]): string[] {
  const used = new Set<string>();
  return tables.map((table, i) => {
    const base = (table.name || `Tabel ${i + 1}`).replace(/[[\]:*?/\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 28) || `Tabel ${i + 1}`;
    let name = base;
    let n = 2;
    while (used.has(name.toLowerCase())) name = `${base} ${n++}`;
    used.add(name.toLowerCase());
    return name;
  });
}

// Stijlen: 0 gewoon, 1 kop, 2 heel getal, 3 procent, 4 euro, 5 tekst met terugloop,
// 6 getal met decimalen.
const STYLES_XML =
  XML_HEAD +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<numFmts count="1"><numFmt numFmtId="165" formatCode="&quot;€&quot; #,##0.00"/></numFmts>' +
  '<fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font>' +
  '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font></fonts>' +
  '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FF154273"/><bgColor indexed="64"/></patternFill></fill></fills>' +
  '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>' +
  '<border><left/><right/><top/><bottom style="thin"><color rgb="FFCBD5E1"/></bottom><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="7">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"><alignment vertical="top" wrapText="1"/></xf>' +
  '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment vertical="center" wrapText="1"/></xf>' +
  '<xf numFmtId="3" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"><alignment vertical="top"/></xf>' +
  '<xf numFmtId="10" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"><alignment vertical="top"/></xf>' +
  '<xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"><alignment vertical="top"/></xf>' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"><alignment vertical="top" wrapText="1"/></xf>' +
  '<xf numFmtId="4" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"><alignment vertical="top"/></xf>' +
  '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

function sheetXml(table: FoundTable): string {
  const cols = table.header.length;
  const widths = table.header.map((head, c) =>
    Math.min(Math.max(head.length, ...table.rows.map((row) => (row[c] ?? '').length), 6) + 2, 60),
  );

  const textCell = (ref: string, text: string, style: number) =>
    `<c r="${ref}" t="inlineStr" s="${style}"><is><t xml:space="preserve">${xmlEscape(text)}</t></is></c>`;

  let rows = `<row r="1">${table.header.map((head, c) => textCell(`${columnName(c)}1`, head, 1)).join('')}</row>`;
  table.rows.forEach((row, r) => {
    const n = r + 2;
    rows += `<row r="${n}">`;
    for (let c = 0; c < cols; c++) {
      const ref = `${columnName(c)}${n}`;
      const cell = readCell(row[c] ?? '');
      if (cell.kind === 'number') {
        const style = { integer: 2, percent: 3, euro: 4, decimal: 6 }[cell.format];
        rows += `<c r="${ref}" s="${style}"><v>${cell.value}</v></c>`;
      } else if (cell.text) {
        rows += textCell(ref, cell.text, 5);
      }
    }
    rows += '</row>';
  });

  const last = `${columnName(cols - 1)}${table.rows.length + 1}`;
  return (
    XML_HEAD +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
    '<sheetFormatPr defaultRowHeight="15"/>' +
    `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` +
    `<sheetData>${rows}</sheetData>` +
    `<autoFilter ref="A1:${last}"/>` +
    '</worksheet>'
  );
}

/** Maakt het Excel-bestand met alle tabellen uit het antwoord. */
export async function buildExcelWorkbook(markdown: string): Promise<{ data: Uint8Array; fileName: string } | null> {
  const tables = findTables(markdown);
  if (!tables.length) return null;
  const names = sheetNames(tables);

  const files: Record<string, string> = {
    '[Content_Types].xml':
      XML_HEAD +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      tables
        .map(
          (_, i) =>
            `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
        )
        .join('') +
      '</Types>',
    '_rels/.rels':
      XML_HEAD +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>',
    'xl/workbook.xml':
      XML_HEAD +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      `<sheets>${names.map((name, i) => `<sheet name="${xmlEscape(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>` +
      `<definedNames>${tables
        .map(
          (t, i) =>
            `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${xmlEscape(names[i].replace(/'/g, "''"))}'!$A$1:$${columnName(t.header.length - 1)}$${t.rows.length + 1}</definedName>`,
        )
        .join('')}</definedNames>` +
      '</workbook>',
    'xl/_rels/workbook.xml.rels':
      XML_HEAD +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      tables
        .map(
          (_, i) =>
            `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
        )
        .join('') +
      `<Relationship Id="rId${tables.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
      '</Relationships>',
    'xl/styles.xml': STYLES_XML,
  };
  tables.forEach((table, i) => {
    files[`xl/worksheets/sheet${i + 1}.xml`] = sheetXml(table);
  });

  const title = tables[0].name || 'Tabellen uit PromptPlein';
  return { data: await zipOffice(files), fileName: `${fileNameFrom(title, 'Tabellen uit PromptPlein')}.xlsx` };
}
