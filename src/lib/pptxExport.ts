// Zet een chatantwoord om in een PowerPoint-presentatie (.pptx), in de browser.
// Net als een .docx is een .pptx een zip met XML. De indeling: een titeldia, dan
// een dia per kopje, en wat niet op één dia past loopt door op een vervolgdia.
// Tabellen worden een echte PowerPoint-tabel, zodat je ze daarna kunt bewerken.
// Elke dia heeft een titel in de titelplek, zodat een schermlezer en het overzicht
// in PowerPoint de dia's bij naam kennen.

import { documentBaseName, readAnswer } from './answerDocument';
import { inlineRuns, type Block, type InlineRun, type ListNode } from './markdownBlocks';
import { contrast, type ExportStyle } from './exportStyle';
import { todayLong, XML_HEAD, xmlEscape, zipOffice } from './officeXml';
import type { ExportFile, ExportInput } from './textExport';

export const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

const NS =
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

// Maten in EMU: 12700 per punt, 914400 per inch. Dia van 16:9.
const PT = 12700;
const SLIDE_W = 12192000;
const SLIDE_H = 6858000;
const MARGIN_X = 548640;
const CONTENT_W = SLIDE_W - 2 * MARGIN_X;
const TITLE_Y = 365760;
const TITLE_H = 868680;
const BODY_Y = 1417320;
const BODY_H = 4846320;
/** Zoveel punten hoogte mag de inhoud van één dia hebben (iets minder dan het vak). */
const BODY_BUDGET = 360;

interface Palette {
  title: string;
  text: string;
  muted: string;
  link: string;
  accent: string;
  border: string;
  headFill: string;
  headText: string;
  band: string | null;
  codeFill: string;
  coverFill: string;
  coverText: string;
  coverMuted: string;
  font: string;
}

/** De kleuren van de dia's, uit de gedeelde opmaak. */
function paletteOf(style: ExportStyle): Palette {
  return {
    title: style.heading,
    text: style.text,
    muted: style.muted,
    link: style.link,
    accent: style.accent,
    border: style.border,
    headFill: style.tableHeadFill,
    headText: style.tableHeadText,
    band: style.tableBand,
    codeFill: style.codeFill,
    coverFill: style.coverFill,
    coverText: style.coverText,
    coverMuted: style.coverMuted,
    font: style.font,
  };
}

// --- Wat er op een dia staat ---

export interface TextItem {
  kind: 'text';
  text: string;
  level: number;
  bullet: 'none' | 'dot' | 'num';
  number?: number;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  muted?: boolean;
}

export interface TableItem {
  kind: 'table';
  header: string[];
  align: (string | undefined)[];
  rows: string[][];
}

export interface SlideSpec {
  title: string;
  items: TextItem[];
  table?: TableItem;
}

const BODY_SIZE = 18;
const CODE_SIZE = 12;

/** Hoeveel er op een dia past: breedte van het tekstvak (EMU), hoogte (pt) en lettergrootte. */
export interface SlideMetrics {
  width: number;
  budget: number;
  bodySize: number;
  codeSize: number;
}

const DEFAULT_METRICS: SlideMetrics = { width: CONTENT_W, budget: BODY_BUDGET, bodySize: BODY_SIZE, codeSize: CODE_SIZE };

/** Hoeveel punten hoog een tekstregel op de dia wordt, geschat op het aantal tekens. */
function itemHeight(item: TextItem, m: SlideMetrics): number {
  const size = item.code ? m.codeSize : m.bodySize;
  const plain = inlineRuns(item.text).map((r) => r.text).join('');
  const indent = item.level * 0.5 * 72 + (item.bullet === 'none' ? 0 : 0.375 * 72);
  const width = m.width / PT - indent;
  const charsPerLine = Math.max(Math.floor(width / (size * (item.code ? 0.6 : 0.52))), 10);
  const lines = item.code ? 1 : Math.max(Math.ceil(plain.length / charsPerLine), 1);
  return lines * size * 1.2 + (item.code ? 0 : 6);
}

function listItems(list: ListNode, level: number, out: TextItem[]) {
  list.items.forEach((item, i) => {
    out.push({
      kind: 'text',
      text: item.text,
      level,
      bullet: list.ordered ? 'num' : 'dot',
      number: list.ordered ? list.start + i : undefined,
    });
    for (const child of item.children) listItems(child, Math.min(level + 1, 4), out);
  });
}

/** Deelt het antwoord op in dia's: een nieuwe dia bij elke kop van niveau 1 of 2. */
export function planSlides(input: ExportInput, m: SlideMetrics = DEFAULT_METRICS): { title: string; slides: SlideSpec[] } {
  const read = readAnswer(input.markdown);
  const docTitle = read.plainTitle || 'Antwoord uit PromptPlein';
  const sections: { title: string; blocks: (Block | { kind: 'code'; code: string } | { kind: 'html' })[] }[] = [
    { title: docTitle, blocks: [] },
  ];
  for (const part of read.parts) {
    if (part.kind !== 'blocks') {
      sections[sections.length - 1].blocks.push(part);
      continue;
    }
    for (const b of part.blocks) {
      if (b.kind === 'heading' && b.level - read.shift <= 2) {
        sections.push({ title: inlineRuns(b.text).map((r) => r.text).join(''), blocks: [] });
      } else sections[sections.length - 1].blocks.push(b);
    }
  }
  if (input.sources?.length) {
    sections.push({
      title: 'Bronnen',
      blocks: [
        {
          kind: 'list',
          list: {
            ordered: true,
            start: 1,
            items: input.sources.map((s) => ({ text: `[${s.title.replace(/[[\]]/g, '')}](${s.url})`, children: [] })),
          },
        },
      ],
    });
  }

  const slides: SlideSpec[] = [];
  for (const section of sections) {
    let current: SlideSpec | null = null;
    let used = 0;
    let count = 0;
    const title = () => (count === 0 ? section.title : `${section.title} (vervolg)`);
    const fresh = () => {
      current = { title: title(), items: [] };
      slides.push(current);
      count++;
      used = 0;
      return current;
    };
    const add = (item: TextItem) => {
      const h = itemHeight(item, m);
      let slide = current as SlideSpec | null;
      if (!slide || slide.table || (used + h > m.budget && slide.items.length)) slide = fresh();
      slide.items.push(item);
      used += h;
    };

    for (const b of section.blocks) {
      switch (b.kind) {
        case 'spacer':
        case 'rule':
          break;
        case 'heading':
        case 'label':
          add({ kind: 'text', text: b.text, level: 0, bullet: 'none', bold: true });
          break;
        case 'paragraph':
          add({ kind: 'text', text: b.text, level: 0, bullet: 'none' });
          break;
        case 'quote':
          add({ kind: 'text', text: b.lines.join(' '), level: 0, bullet: 'none', italic: true, muted: true });
          break;
        case 'list': {
          const items: TextItem[] = [];
          listItems(b.list, 0, items);
          items.forEach(add);
          break;
        }
        case 'code':
          for (const line of b.code.replace(/\t/g, '    ').split('\n')) {
            add({ kind: 'text', text: line, level: 0, bullet: 'none', code: true });
          }
          break;
        case 'html':
          add({ kind: 'text', text: 'Hier stond een HTML-bestand. Dat download je los in de chat.', level: 0, bullet: 'none', italic: true, muted: true });
          break;
        case 'table': {
          // Een tabel krijgt een eigen dia; lange tabellen lopen door, met de kop opnieuw.
          const size = tableFontSize(b.header.length);
          const widths = columnWidths(b.header, b.rows, m.width);
          const rowHeight = (row: string[]) =>
            Math.max(
              ...widths.map((w, c) => {
                const text = inlineRuns(row[c] ?? '').map((r) => r.text).join('');
                return Math.max(Math.ceil((text.length * size * 0.52) / (w / PT - 14)), 1);
              }),
            ) *
              size *
              1.2 +
            12;
          let rows: string[][] = [];
          let height = rowHeight(b.header);
          const flush = () => {
            const slide: SlideSpec = current && !(current as SlideSpec).items.length && !(current as SlideSpec).table ? current : fresh();
            slide.table = { kind: 'table', header: b.header, align: b.align, rows };
            current = null;
            rows = [];
            height = rowHeight(b.header);
          };
          for (const row of b.rows) {
            const h = rowHeight(row);
            if (rows.length && height + h > m.budget + 20) flush();
            rows.push(row);
            height += h;
          }
          flush();
          break;
        }
      }
    }
    // Een kop zonder inhoud krijgt toch zijn dia, behalve de lege eerste (de titeldia dekt die).
    if (count === 0 && section !== sections[0]) fresh();
  }
  return { title: docTitle, slides };
}

export function tableFontSize(cols: number): number {
  return cols > 6 ? 11 : cols > 4 ? 12 : 14;
}

export function columnWidths(header: string[], rows: string[][], width = CONTENT_W): number[] {
  const cols = header.length;
  const size = tableFontSize(cols);
  // Nooit smaller dan het langste woord, anders breekt "Budget" midden in het woord.
  const longestWord = header.map((h, c) =>
    Math.max(...[h, ...rows.map((r) => r[c] ?? '')].flatMap((t) => inlineRuns(t).map((r) => r.text).join('').split(/\s+/)).map((w) => w.length)),
  );
  const wordMin = longestWord.map((n) => Math.min((n * size * 0.62 + 16) * PT, width / 2));
  const want = header.map((h, c) => {
    const lengths = [h, ...rows.map((r) => r[c] ?? '')].map((t) => inlineRuns(t).map((r) => r.text).join('').length);
    return Math.min(Math.max(...lengths, 4), 60);
  });
  const total = want.reduce((a, b) => a + b, 0);
  const min = width / cols / 2.5;
  const raw = want.map((w, c) => Math.max((w / total) * width, min, wordMin[c]));
  const sum = raw.reduce((a, b) => a + b, 0);
  const widths = raw.map((w) => Math.floor((w / sum) * width));
  widths[widths.length - 1] += width - widths.reduce((a, b) => a + b, 0);
  return widths;
}

// --- XML ---

export class Links {
  readonly targets: string[] = [];
  id(url: string): string {
    let i = this.targets.indexOf(url);
    if (i < 0) {
      this.targets.push(url);
      i = this.targets.length - 1;
    }
    return `rIdL${i + 1}`;
  }
}

function runXml(run: InlineRun, size: number, color: string, links: Links, extra: { bold?: boolean; italic?: boolean; code?: boolean }): string {
  const bold = extra.bold || run.bold;
  const italic = extra.italic || run.italic;
  const code = extra.code || run.code;
  const attrs = `lang="nl-NL" sz="${Math.round(size * 100)}"${bold ? ' b="1"' : ''}${italic ? ' i="1"' : ''} dirty="0"`;
  const fill = `<a:solidFill><a:srgbClr val="${color}"/></a:solidFill>`;
  const font = code ? '<a:latin typeface="Consolas"/><a:cs typeface="Consolas"/>' : '';
  const link = run.link ? `<a:hlinkClick r:id="${links.id(run.link)}"/>` : '';
  return `<a:r><a:rPr ${attrs}>${fill}${font}${link}</a:rPr><a:t>${xmlEscape(run.text)}</a:t></a:r>`;
}

function runsXml(text: string, size: number, color: string, palette: Palette, links: Links, extra: { bold?: boolean; italic?: boolean; code?: boolean } = {}): string {
  const runs = extra.code ? [{ text }] : inlineRuns(text);
  return runs
    .filter((r) => r.text)
    .map((r) => runXml(r, size, r.link ? palette.link : color, links, extra))
    .join('');
}

function itemXml(item: TextItem, palette: Palette, links: Links): string {
  const size = item.code ? CODE_SIZE : BODY_SIZE;
  const indent = 342900;
  const marL = item.level * 457200 + (item.bullet === 'none' ? 0 : indent);
  const bullet =
    item.bullet === 'dot'
      ? `<a:buClr><a:srgbClr val="${contrast(palette.accent, 'FFFFFF') < 3 ? palette.text : palette.accent}"/></a:buClr><a:buFont typeface="Arial"/><a:buChar char="${item.level % 2 ? '–' : '•'}"/>`
      : item.bullet === 'num'
        ? `<a:buClr><a:srgbClr val="${palette.text}"/></a:buClr><a:buFont typeface="+mj-lt"/><a:buAutoNum type="arabicPeriod" startAt="${item.number ?? 1}"/>`
        : '<a:buNone/>';
  const spacing = item.code
    ? '<a:lnSpc><a:spcPct val="100000"/></a:lnSpc><a:spcBef><a:spcPts val="0"/></a:spcBef>'
    : '<a:lnSpc><a:spcPct val="100000"/></a:lnSpc><a:spcBef><a:spcPts val="600"/></a:spcBef>';
  const pPr = `<a:pPr marL="${marL}" indent="${item.bullet === 'none' ? 0 : -indent}">${spacing}${bullet}</a:pPr>`;
  const color = item.muted ? palette.muted : palette.text;
  const body = runsXml(item.code && !item.text ? ' ' : item.text, size, color, palette, links, {
    bold: item.bold,
    italic: item.italic,
    code: item.code,
  });
  return `<a:p>${pPr}${body}<a:endParaRPr lang="nl-NL" sz="${size * 100}" dirty="0"/></a:p>`;
}

const GROUP =
  '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
  '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';

function xfrm(x: number, y: number, w: number, h: number): string {
  return `<a:xfrm><a:off x="${Math.round(x)}" y="${Math.round(y)}"/><a:ext cx="${Math.round(w)}" cy="${Math.round(h)}"/></a:xfrm>`;
}

function titleShape(id: number, text: string, x: number, y: number, w: number, h: number, size: number, color: string, palette: Palette, links: Links, anchor = 'b'): string {
  return (
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Titel ${id}"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>` +
    `<p:spPr>${xfrm(x, y, w, h)}</p:spPr>` +
    `<p:txBody><a:bodyPr vert="horz" wrap="square" lIns="0" tIns="0" rIns="0" bIns="0" anchor="${anchor}"><a:normAutofit/></a:bodyPr><a:lstStyle/>` +
    `<a:p><a:pPr algn="l"><a:lnSpc><a:spcPct val="90000"/></a:lnSpc></a:pPr>${runsXml(text, size, color, palette, links, { bold: true })}<a:endParaRPr lang="nl-NL" sz="${size * 100}" dirty="0"/></a:p>` +
    '</p:txBody></p:sp>'
  );
}

function textShape(id: number, name: string, paragraphs: string, x: number, y: number, w: number, h: number, fill?: string): string {
  return (
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${xmlEscape(name)}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr>${xfrm(x, y, w, h)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${fill ? `<a:solidFill><a:srgbClr val="${fill}"/></a:solidFill>` : '<a:noFill/>'}</p:spPr>` +
    // Met een vlak erachter staat de tekst niet tegen de rand.
    `<p:txBody><a:bodyPr wrap="square" ${fill ? 'lIns="91440" tIns="91440" rIns="91440" bIns="91440"' : 'lIns="0" tIns="0" rIns="0" bIns="0"'} anchor="t"><a:normAutofit/></a:bodyPr><a:lstStyle/>${paragraphs}</p:txBody></p:sp>`
  );
}

function rectShape(id: number, name: string, x: number, y: number, w: number, h: number, color: string): string {
  return (
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr>${xfrm(x, y, w, h)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr>` +
    '<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="nl-NL" dirty="0"/></a:p></p:txBody></p:sp>'
  );
}

function footerShape(id: number, title: string, palette: Palette): string {
  const y = SLIDE_H - 420000;
  const run = (text: string) =>
    `<a:r><a:rPr lang="nl-NL" sz="1000" dirty="0"><a:solidFill><a:srgbClr val="${palette.muted}"/></a:solidFill></a:rPr><a:t>${xmlEscape(text)}</a:t></a:r>`;
  const left = textShape(id, 'Voettekst', `<a:p>${run(title.length > 90 ? `${title.slice(0, 88)}…` : title)}</a:p>`, MARGIN_X, y, CONTENT_W - 900000, 228600);
  const number =
    `<p:sp><p:nvSpPr><p:cNvPr id="${id + 1}" name="Dianummer"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr>${xfrm(SLIDE_W - MARGIN_X - 800000, y, 800000, 228600)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>` +
    `<p:txBody><a:bodyPr wrap="none" lIns="0" tIns="0" rIns="0" bIns="0"/><a:lstStyle/><a:p><a:pPr algn="r"/>` +
    `<a:fld id="{B6F15528-21DE-4FAA-801E-634DDDAF4B2B}" type="slidenum"><a:rPr lang="nl-NL" sz="1000" dirty="0"><a:solidFill><a:srgbClr val="${palette.muted}"/></a:solidFill></a:rPr><a:t>‹nr.›</a:t></a:fld></a:p></p:txBody></p:sp>`;
  return left + number;
}

function tableXml(id: number, table: TableItem, palette: Palette, links: Links): string {
  const widths = columnWidths(table.header, table.rows);
  const size = tableFontSize(table.header.length);
  const line = (tag: string, color: string | null) =>
    color
      ? `<a:${tag} w="9525"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></a:${tag}>`
      : `<a:${tag} w="0"><a:noFill/></a:${tag}>`;
  const cell = (text: string, c: number, head: boolean, fill: string | null) => {
    const align = table.align[c] === 'right' ? 'r' : table.align[c] === 'center' ? 'ctr' : 'l';
    const color = head ? palette.headText : palette.text;
    return (
      `<a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:pPr algn="${align}"/>${runsXml(text, size, color, palette, links, { bold: head })}<a:endParaRPr lang="nl-NL" sz="${size * 100}" dirty="0"/></a:p></a:txBody>` +
      `<a:tcPr marL="91440" marR="91440" marT="64008" marB="64008" anchor="t">${line('lnL', null)}${line('lnR', null)}${line('lnT', null)}${line('lnB', head ? palette.headFill : palette.border)}` +
      `${fill ? `<a:solidFill><a:srgbClr val="${fill}"/></a:solidFill>` : '<a:noFill/>'}</a:tcPr></a:tc>`
    );
  };
  const rowH = Math.round(size * 1.2 * PT + 128016);
  const rows = [
    `<a:tr h="${rowH}">${table.header.map((h, c) => cell(h, c, true, palette.headFill)).join('')}</a:tr>`,
    ...table.rows.map(
      (row, r) =>
        `<a:tr h="${rowH}">${table.header.map((_, c) => cell(row[c] ?? '', c, false, palette.band && r % 2 === 1 ? palette.band : null)).join('')}</a:tr>`,
    ),
  ].join('');
  return (
    `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id}" name="Tabel ${id}"/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr>` +
    `<p:xfrm><a:off x="${MARGIN_X}" y="${BODY_Y}"/><a:ext cx="${CONTENT_W}" cy="${rowH * (table.rows.length + 1)}"/></p:xfrm>` +
    '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table">' +
    `<a:tbl><a:tblPr firstRow="1" bandRow="${palette.band ? 1 : 0}"/><a:tblGrid>${widths.map((w) => `<a:gridCol w="${w}"/>`).join('')}</a:tblGrid>${rows}</a:tbl>` +
    '</a:graphicData></a:graphic></p:graphicFrame>'
  );
}

function slideXml(shapes: string, background?: string): string {
  const bg = background
    ? `<p:bg><p:bgPr><a:solidFill><a:srgbClr val="${background}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>`
    : '';
  return (
    XML_HEAD +
    `<p:sld ${NS}><p:cSld>${bg}<p:spTree>${GROUP}${shapes}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`
  );
}

function slideRels(links: Links): string {
  return (
    XML_HEAD +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    `<Relationship Id="rId1" Type="${REL}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>` +
    links.targets
      .map((url, i) => `<Relationship Id="rIdL${i + 1}" Type="${REL}/hyperlink" Target="${xmlEscape(url)}" TargetMode="External"/>`)
      .join('') +
    '</Relationships>'
  );
}

function coverSlide(title: string, palette: Palette, links: Links): string {
  const shapes =
    titleShape(2, title, MARGIN_X, 1600000, CONTENT_W, 2400000, 40, palette.coverText, palette, links) +
    rectShape(3, 'Lijn', MARGIN_X, 4180000, 1371600, 54864, palette.coverFill === 'FFFFFF' ? palette.border : palette.coverText) +
    textShape(
      4,
      'Ondertitel',
      `<a:p><a:r><a:rPr lang="nl-NL" sz="1800" dirty="0"><a:solidFill><a:srgbClr val="${palette.coverMuted}"/></a:solidFill></a:rPr><a:t>${xmlEscape(`PromptPlein, ${todayLong()}`)}</a:t></a:r></a:p>`,
      MARGIN_X,
      4420000,
      CONTENT_W,
      457200,
    );
  return slideXml(shapes, palette.coverFill === 'FFFFFF' ? undefined : palette.coverFill);
}

function contentSlide(spec: SlideSpec, docTitle: string, palette: Palette, links: Links): string {
  let shapes =
    titleShape(2, spec.title, MARGIN_X, TITLE_Y, CONTENT_W, TITLE_H, 28, palette.title, palette, links) +
    rectShape(3, 'Lijn', MARGIN_X, TITLE_Y + TITLE_H + 91440, 914400, 36576, palette.accent);
  if (spec.items.length) {
    // Alleen code: een grijs vak zo hoog als de regels, niet de hele dia.
    const code = spec.items.every((i) => i.code);
    const height = code
      ? Math.min(Math.round((spec.items.length * CODE_SIZE * 1.2 + 16) * PT), BODY_H)
      : BODY_H;
    shapes += textShape(
      4,
      'Inhoud',
      spec.items.map((item) => itemXml(item, palette, links)).join(''),
      MARGIN_X,
      BODY_Y,
      CONTENT_W,
      height,
      code ? palette.codeFill : undefined,
    );
  }
  if (spec.table) shapes += tableXml(5, spec.table, palette, links);
  shapes += footerShape(6, docTitle, palette);
  return slideXml(shapes);
}

function themeXml(palette: Palette): string {
  const solid = '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>';
  return (
    XML_HEAD +
    '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="PromptPlein"><a:themeElements>' +
    '<a:clrScheme name="PromptPlein">' +
    `<a:dk1><a:srgbClr val="${palette.text}"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1>` +
    `<a:dk2><a:srgbClr val="${palette.title}"/></a:dk2><a:lt2><a:srgbClr val="F1F5F9"/></a:lt2>` +
    '<a:accent1><a:srgbClr val="01689B"/></a:accent1><a:accent2><a:srgbClr val="154273"/></a:accent2>' +
    '<a:accent3><a:srgbClr val="D52B1E"/></a:accent3><a:accent4><a:srgbClr val="64748B"/></a:accent4>' +
    '<a:accent5><a:srgbClr val="8FCAE7"/></a:accent5><a:accent6><a:srgbClr val="39870C"/></a:accent6>' +
    `<a:hlink><a:srgbClr val="${palette.link}"/></a:hlink><a:folHlink><a:srgbClr val="${palette.title}"/></a:folHlink>` +
    '</a:clrScheme>' +
    `<a:fontScheme name="PromptPlein"><a:majorFont><a:latin typeface="${palette.font}"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>` +
    `<a:minorFont><a:latin typeface="${palette.font}"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>` +
    '<a:fmtScheme name="PromptPlein">' +
    `<a:fillStyleLst>${solid}${solid}${solid}</a:fillStyleLst>` +
    `<a:lnStyleLst>${`<a:ln w="6350">${solid}</a:ln>`.repeat(3)}</a:lnStyleLst>` +
    `<a:effectStyleLst>${'<a:effectStyle><a:effectLst/></a:effectStyle>'.repeat(3)}</a:effectStyleLst>` +
    `<a:bgFillStyleLst>${solid}${solid}${solid}</a:bgFillStyleLst>` +
    '</a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>'
  );
}

function masterXml(): string {
  const titlePh =
    '<p:sp><p:nvSpPr><p:cNvPr id="2" name="Titel"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>' +
    `<p:spPr>${xfrm(MARGIN_X, TITLE_Y, CONTENT_W, TITLE_H)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>` +
    '<p:txBody><a:bodyPr anchor="b"><a:normAutofit/></a:bodyPr><a:lstStyle/><a:p><a:endParaRPr lang="nl-NL"/></a:p></p:txBody></p:sp>';
  const level = (sz: number) => `<a:lvl1pPr><a:defRPr sz="${sz}"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/></a:defRPr></a:lvl1pPr>`;
  return (
    XML_HEAD +
    `<p:sldMaster ${NS}><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree>${GROUP}${titlePh}</p:spTree></p:cSld>` +
    '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>' +
    '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>' +
    `<p:txStyles><p:titleStyle><a:lvl1pPr><a:defRPr sz="2800" b="1"><a:solidFill><a:schemeClr val="tx2"/></a:solidFill><a:latin typeface="+mj-lt"/></a:defRPr></a:lvl1pPr></p:titleStyle>` +
    `<p:bodyStyle>${level(1800)}</p:bodyStyle><p:otherStyle>${level(1800)}</p:otherStyle></p:txStyles>` +
    '</p:sldMaster>'
  );
}

function layoutXml(): string {
  const titlePh =
    '<p:sp><p:nvSpPr><p:cNvPr id="2" name="Titel"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>' +
    '<p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="nl-NL"/></a:p></p:txBody></p:sp>';
  return (
    XML_HEAD +
    `<p:sldLayout ${NS} type="titleOnly" preserve="1"><p:cSld name="Alleen titel"><p:spTree>${GROUP}${titlePh}</p:spTree></p:cSld>` +
    '<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>'
  );
}

/** Het chatantwoord als PowerPoint, in de kleuren van de gekozen vormgeving. */
export async function buildPptx(input: ExportInput, style: ExportStyle, template?: Uint8Array | null): Promise<ExportFile> {
  if (template) return (await import('./pptxTemplate')).buildPptxFromTemplate(input, template);
  const palette = paletteOf(style);
  const { title, slides } = planSlides(input);
  const read = readAnswer(input.markdown);

  const files: Record<string, string> = {};
  const all: { xml: string; links: Links }[] = [];
  const coverLinks = new Links();
  all.push({ xml: coverSlide(title, palette, coverLinks), links: coverLinks });
  for (const spec of slides) {
    const links = new Links();
    all.push({ xml: contentSlide(spec, title, palette, links), links });
  }
  all.forEach((slide, i) => {
    files[`ppt/slides/slide${i + 1}.xml`] = slide.xml;
    files[`ppt/slides/_rels/slide${i + 1}.xml.rels`] = slideRels(slide.links);
  });

  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const slideOverrides = all
    .map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`)
    .join('');
  files['[Content_Types].xml'] =
    XML_HEAD +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>' +
    '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>' +
    '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>' +
    '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>' +
    '<Override PartName="/ppt/presProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presProps+xml"/>' +
    '<Override PartName="/ppt/viewProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.viewProps+xml"/>' +
    '<Override PartName="/ppt/tableStyles.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.tableStyles+xml"/>' +
    slideOverrides +
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
    '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
    '</Types>';
  files['_rels/.rels'] =
    XML_HEAD +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    `<Relationship Id="rId1" Type="${REL}/officeDocument" Target="ppt/presentation.xml"/>` +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
    `<Relationship Id="rId3" Type="${REL}/extended-properties" Target="docProps/app.xml"/>` +
    '</Relationships>';
  files['docProps/core.xml'] =
    XML_HEAD +
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    `<dc:title>${xmlEscape(title)}</dc:title><dc:language>nl-NL</dc:language>` +
    `<dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>` +
    '</cp:coreProperties>';
  files['docProps/app.xml'] =
    XML_HEAD +
    `<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>PromptPlein</Application><Slides>${all.length}</Slides></Properties>`;
  files['ppt/presentation.xml'] =
    XML_HEAD +
    `<p:presentation ${NS} saveSubsetFonts="1">` +
    '<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>' +
    `<p:sldIdLst>${all.map((_, i) => `<p:sldId id="${256 + i}" r:id="rIdS${i + 1}"/>`).join('')}</p:sldIdLst>` +
    `<p:sldSz cx="${SLIDE_W}" cy="${SLIDE_H}"/><p:notesSz cx="6858000" cy="9144000"/>` +
    '</p:presentation>';
  files['ppt/_rels/presentation.xml.rels'] =
    XML_HEAD +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    `<Relationship Id="rId1" Type="${REL}/slideMaster" Target="slideMasters/slideMaster1.xml"/>` +
    `<Relationship Id="rId2" Type="${REL}/theme" Target="theme/theme1.xml"/>` +
    `<Relationship Id="rId3" Type="${REL}/presProps" Target="presProps.xml"/>` +
    `<Relationship Id="rId4" Type="${REL}/viewProps" Target="viewProps.xml"/>` +
    `<Relationship Id="rId5" Type="${REL}/tableStyles" Target="tableStyles.xml"/>` +
    all.map((_, i) => `<Relationship Id="rIdS${i + 1}" Type="${REL}/slide" Target="slides/slide${i + 1}.xml"/>`).join('') +
    '</Relationships>';
  files['ppt/presProps.xml'] = XML_HEAD + `<p:presentationPr ${NS}/>`;
  files['ppt/viewProps.xml'] =
    XML_HEAD +
    `<p:viewPr ${NS}><p:normalViewPr><p:restoredLeft sz="15620"/><p:restoredTop sz="94660"/></p:normalViewPr><p:gridSpacing cx="76200" cy="76200"/></p:viewPr>`;
  files['ppt/tableStyles.xml'] =
    XML_HEAD + '<a:tblStyleLst xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>';
  files['ppt/slideMasters/slideMaster1.xml'] = masterXml();
  files['ppt/slideMasters/_rels/slideMaster1.xml.rels'] =
    XML_HEAD +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    `<Relationship Id="rId1" Type="${REL}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>` +
    `<Relationship Id="rId2" Type="${REL}/theme" Target="../theme/theme1.xml"/>` +
    '</Relationships>';
  files['ppt/slideLayouts/slideLayout1.xml'] = layoutXml();
  files['ppt/slideLayouts/_rels/slideLayout1.xml.rels'] =
    XML_HEAD +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    `<Relationship Id="rId1" Type="${REL}/slideMaster" Target="../slideMasters/slideMaster1.xml"/>` +
    '</Relationships>';
  files['ppt/theme/theme1.xml'] = themeXml(palette);

  const data = await zipOffice(files);
  return { data, fileName: `${documentBaseName(read, input.markdown)}.pptx`, mime: PPTX_MIME };
}
