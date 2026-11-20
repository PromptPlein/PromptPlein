// Zet een chatantwoord om in een echt Word-document (.docx), helemaal in de
// browser. De AI levert de inhoud als Markdown; de opmaak komt van hier: de
// Rijkshuisstijl, een eenvoudige stijl, of het eigen Word-sjabloon van de
// gebruiker met zijn kop- en voettekst, logo en stijlen. Er gaat niets naar een
// server, dus dit past bij de belofte dat chats in de browser blijven.

import { documentBaseName, readAnswer, type AnswerDocument } from './answerDocument';
import { isSerif, type ExportStyle } from './exportStyle';
import { inlineRuns, type Block, type InlineRun, type ListNode } from './markdownBlocks';
import { todayLong, XML_HEAD, xmlEscape, zipOffice } from './officeXml';

/** De keuze in Instellingen en het menu: twee vaste opmaken, een eigen beschreven opmaak, of je sjablonen. */
export type WordLook = 'rijk' | 'eenvoudig' | 'eigen' | 'sjabloon';

export interface WordSource {
  title: string;
  url: string;
}

export interface WordInput {
  /** Het antwoord zoals de AI het schreef (Markdown). */
  markdown: string;
  /** De bronnen van internet onder het antwoord, als die er zijn. */
  sources?: WordSource[];
}

export interface WordResult {
  data: Uint8Array;
  fileName: string;
}

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const W_NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

/** Breedte van de tekst op A4 met marges van 2,5 cm, in twintigsten van een punt. */
const TEXT_WIDTH = 9026;

// --- Kleuren en stijl per vormgeving ---

interface Palette {
  /** Kopjes en titel. */
  heading: string;
  /** Kop 3 en lager. */
  subheading: string;
  link: string;
  text: string;
  muted: string;
  border: string;
  tableHeadFill: string;
  tableHeadText: string;
  tableBand: string | null;
  codeFill: string;
  quoteBar: string;
}

/** Een eigen sjabloon heeft zijn eigen kleuren; wij voegen alleen neutrale lijnen toe. */
const SJABLOON: Palette = {
  heading: '',
  subheading: '',
  link: '0563C1',
  text: '',
  muted: '7F7F7F',
  border: 'BFBFBF',
  tableHeadFill: 'F2F2F2',
  tableHeadText: '',
  tableBand: null,
  codeFill: 'F2F2F2',
  quoteBar: 'A6A6A6',
};

/** Welke stijl-id's het document gebruikt. In een sjabloon heten ze soms anders ("Kop1"). */
interface StyleIds {
  title?: string;
  headings: (string | undefined)[];
  /** "List Paragraph", in een Nederlandse Word "Lijstalinea". */
  list?: string;
}

// --- Nummering voor lijsten ---

class Numbering {
  private nums: { id: number; abstract: number; start?: number; level: number }[] = [];
  private bulletNum: number | null = null;

  constructor(
    readonly bulletAbstract: number,
    readonly orderedAbstract: number,
    private nextNum: number,
  ) {}

  /** Opsommingen delen één nummering; een genummerde lijst begint telkens opnieuw. */
  numFor(list: ListNode, level: number): number {
    if (!list.ordered) {
      if (this.bulletNum === null) {
        this.bulletNum = this.nextNum++;
        this.nums.push({ id: this.bulletNum, abstract: this.bulletAbstract, level: 0 });
      }
      return this.bulletNum;
    }
    const id = this.nextNum++;
    this.nums.push({ id, abstract: this.orderedAbstract, start: list.start, level });
    return id;
  }

  get used(): boolean {
    return this.nums.length > 0;
  }

  abstractXml(): string {
    return abstractNum(this.bulletAbstract, false) + abstractNum(this.orderedAbstract, true);
  }

  numsXml(): string {
    return this.nums
      .map(
        (n) =>
          `<w:num w:numId="${n.id}"><w:abstractNumId w:val="${n.abstract}"/>` +
          (n.start !== undefined
            ? `<w:lvlOverride w:ilvl="${n.level}"><w:startOverride w:val="${n.start}"/></w:lvlOverride>`
            : '') +
          '</w:num>',
      )
      .join('');
  }
}

const BULLETS = ['•', '–', '•'];
const ORDERED_FORMATS = ['decimal', 'lowerLetter', 'lowerRoman'];

function abstractNum(id: number, ordered: boolean): string {
  let levels = '';
  for (let lvl = 0; lvl < 9; lvl++) {
    const fmt = ordered ? ORDERED_FORMATS[lvl % 3] : 'bullet';
    const text = ordered ? `%${lvl + 1}.` : BULLETS[lvl % 3];
    levels +=
      `<w:lvl w:ilvl="${lvl}"><w:start w:val="1"/><w:numFmt w:val="${fmt}"/>` +
      `<w:lvlText w:val="${xmlEscape(text)}"/><w:lvlJc w:val="left"/>` +
      `<w:pPr><w:ind w:left="${360 * (lvl + 1)}" w:hanging="360"/></w:pPr></w:lvl>`;
  }
  return `<w:abstractNum w:abstractNumId="${id}"><w:multiLevelType w:val="hybridMultilevel"/>${levels}</w:abstractNum>`;
}

// --- Van blokken naar WordprocessingML ---

interface Ctx {
  palette: Palette;
  styles: StyleIds;
  numbering: Numbering;
  /** Hoeveel kopniveaus omhoog: na een titel uit "# " wordt "## " Kop 1. */
  shift: number;
}

interface RunExtra {
  bold?: boolean;
  italic?: boolean;
  color?: string;
  size?: number;
  /** Code in een codeblok: het vlak zit al op de alinea. */
  plainCode?: boolean;
}

function runXml(run: InlineRun, ctx: Ctx, extra: RunExtra = {}): string {
  let rPr = '';
  if (run.code) rPr += '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/>';
  if (run.bold || extra.bold) rPr += '<w:b/>';
  if (run.italic || extra.italic) rPr += '<w:i/>';
  const color = run.link ? ctx.palette.link : extra.color;
  if (color) rPr += `<w:color w:val="${color}"/>`;
  if (run.code) rPr += '<w:sz w:val="19"/>';
  else if (extra.size) rPr += `<w:sz w:val="${extra.size}"/>`;
  if (run.link) rPr += '<w:u w:val="single"/>';
  if (run.code && !extra.plainCode) rPr += `<w:shd w:val="clear" w:color="auto" w:fill="${ctx.palette.codeFill}"/>`;
  return `<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ''}<w:t xml:space="preserve">${xmlEscape(run.text)}</w:t></w:r>`;
}

/** De stukken van een regel, met links als veld zodat er geen relaties nodig zijn. */
function inlineXml(text: string, ctx: Ctx, extra: RunExtra = {}): string {
  const runs = inlineRuns(text);
  let out = '';
  let i = 0;
  while (i < runs.length) {
    const link = runs[i].link;
    if (!link) {
      out += runXml(runs[i], ctx, extra);
      i++;
      continue;
    }
    let inner = '';
    while (i < runs.length && runs[i].link === link) {
      inner += runXml(runs[i], ctx, extra);
      i++;
    }
    out += `<w:fldSimple w:instr="${xmlEscape(` HYPERLINK "${link}" `)}">${inner}</w:fldSimple>`;
  }
  return out;
}

function paragraph(pPr: string, content: string): string {
  return `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ''}${content}</w:p>`;
}

function headingXml(level: number, text: string, ctx: Ctx): string {
  const lvl = Math.min(Math.max(level - ctx.shift, 1), 6);
  const id = ctx.styles.headings[lvl - 1] ?? ctx.styles.headings.find(Boolean);
  if (id) return paragraph(`<w:pStyle w:val="${id}"/>`, inlineXml(text, ctx));
  // Geen kopstijl in het sjabloon: dan vet en iets groter, en bij de volgende alinea houden.
  return paragraph('<w:keepNext/><w:spacing w:before="240" w:after="80"/>', inlineXml(text, ctx, { bold: true, size: lvl <= 1 ? 32 : lvl === 2 ? 28 : 24 }));
}

function listXml(list: ListNode, level: number, ctx: Ctx, endsBlock = true): string {
  const numId = ctx.numbering.numFor(list, level);
  let out = '';
  list.items.forEach((item, index) => {
    const lastItem = index === list.items.length - 1;
    // Alleen na het laatste item van de hele lijst komt witruimte, ook als dat genest is.
    const last = endsBlock && lastItem && item.children.length === 0;
    out += paragraph(
      (ctx.styles.list ? `<w:pStyle w:val="${ctx.styles.list}"/>` : '') +
        `<w:numPr><w:ilvl w:val="${level}"/><w:numId w:val="${numId}"/></w:numPr>` +
        `<w:spacing w:before="0" w:after="${last ? 160 : 60}"/>`,
      inlineXml(item.text, ctx),
    );
    item.children.forEach((child, c) => {
      out += listXml(child, Math.min(level + 1, 8), ctx, endsBlock && lastItem && c === item.children.length - 1);
    });
  });
  return out;
}

function tableXml(block: Extract<Block, { kind: 'table' }>, ctx: Ctx): string {
  const { palette } = ctx;
  const cols = Math.max(block.header.length, 1);
  const width = Math.floor(TEXT_WIDTH / cols);
  const border = (side: string) => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="${palette.border}"/>`;
  const jc = (i: number) => {
    const align = block.align[i];
    return align === 'right' ? '<w:jc w:val="right"/>' : align === 'center' ? '<w:jc w:val="center"/>' : '';
  };

  const cell = (text: string, i: number, fill: string | null, head: boolean) =>
    `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>` +
    (fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>` : '') +
    '</w:tcPr>' +
    paragraph(
      `${head ? '<w:keepNext/>' : ''}<w:spacing w:before="0" w:after="0"/>${jc(i)}`,
      inlineXml(text, ctx, head ? { bold: true, color: palette.tableHeadText || undefined } : {}),
    ) +
    '</w:tc>';

  let rows =
    '<w:tr><w:trPr><w:cantSplit/><w:tblHeader/></w:trPr>' +
    block.header.map((text, i) => cell(text, i, palette.tableHeadFill, true)).join('') +
    '</w:tr>';
  block.rows.forEach((row, r) => {
    const fill = palette.tableBand && r % 2 === 1 ? palette.tableBand : null;
    rows +=
      '<w:tr><w:trPr><w:cantSplit/></w:trPr>' +
      block.header.map((_, c) => cell(row[c] ?? '', c, fill, false)).join('') +
      '</w:tr>';
  });

  return (
    '<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/>' +
    `<w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(border).join('')}</w:tblBorders>` +
    '<w:tblLayout w:type="fixed"/>' +
    '<w:tblCellMar><w:top w:w="57" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="57" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar>' +
    '<w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/>' +
    `</w:tblPr><w:tblGrid>${Array.from({ length: cols }, () => `<w:gridCol w:w="${width}"/>`).join('')}</w:tblGrid>` +
    rows +
    '</w:tbl>' +
    // Na een tabel moet een alinea staan, anders plakt de volgende tabel eraan vast.
    paragraph('<w:spacing w:before="0" w:after="120"/>', '')
  );
}

function blockXml(block: Block, ctx: Ctx): string {
  const { palette } = ctx;
  switch (block.kind) {
    case 'spacer':
      return '';
    case 'rule':
      return paragraph(
        `<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="${palette.border}"/></w:pBdr><w:spacing w:before="120" w:after="240"/>`,
        '',
      );
    case 'heading':
      return headingXml(block.level, block.text, ctx);
    case 'label':
      return paragraph('<w:keepNext/><w:spacing w:before="200" w:after="60"/>', inlineXml(block.text, ctx, { bold: true }));
    case 'paragraph':
      return paragraph('', inlineXml(block.text, ctx));
    case 'quote':
      return block.lines
        .map((line, i) =>
          paragraph(
            `<w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="${palette.quoteBar}"/></w:pBdr>` +
              `<w:spacing w:before="0" w:after="${i === block.lines.length - 1 ? 200 : 80}"/><w:ind w:left="284" w:right="284"/>`,
            inlineXml(line, ctx, { color: palette.muted, italic: true }),
          ),
        )
        .join('');
    case 'list':
      return listXml(block.list, 0, ctx);
    case 'table':
      return tableXml(block, ctx);
  }
}

function codeXml(code: string, ctx: Ctx): string {
  const lines = code.replace(/\s+$/, '').split('\n');
  return lines
    .map((line, i) =>
      paragraph(
        `<w:shd w:val="clear" w:color="auto" w:fill="${ctx.palette.codeFill}"/>` +
          `<w:spacing w:before="0" w:after="${i === lines.length - 1 ? 160 : 0}" w:line="240" w:lineRule="auto"/>`,
        runXml({ text: line || ' ', code: true }, ctx, { plainCode: true }),
      ),
    )
    .join('');
}

function buildBody(input: WordInput, ctx: Ctx, read: AnswerDocument, withTitle: boolean): string {
  let body = '';
  if (withTitle && read.title) {
    body += ctx.styles.title
      ? paragraph(`<w:pStyle w:val="${ctx.styles.title}"/>`, inlineXml(read.title, ctx))
      : headingXml(1 + ctx.shift, read.title, ctx);
  }
  for (const part of read.parts) {
    if (part.kind === 'blocks') body += part.blocks.map((b) => blockXml(b, ctx)).join('');
    else if (part.kind === 'code') body += codeXml(part.code, ctx);
    else
      body += paragraph(
        '',
        runXml({ text: 'Hier stond een HTML-bestand. Dat download je los in de chat.', italic: true }, ctx, {
          color: ctx.palette.muted,
        }),
      );
  }
  if (input.sources?.length) {
    body += headingXml(1 + ctx.shift, 'Bronnen', ctx);
    body += listXml(
      {
        ordered: true,
        start: 1,
        items: input.sources.map((s) => ({ text: `${s.title.replace(/[[\]]/g, '')}: ${s.url}`, children: [] })),
      },
      0,
      ctx,
    );
  }
  return body || paragraph('', '');
}

function fileNameFor(read: AnswerDocument, markdown: string): string {
  return `${documentBaseName(read, markdown)}.docx`;
}

// --- Een document met onze eigen stijl ---

function stylesXml(p: ExportStyle): string {
  const font = xmlEscape(p.font);
  const heading = (n: number, size: number, color: string, before: number) =>
    `<w:style w:type="paragraph" w:styleId="Heading${n}"><w:name w:val="heading ${n}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/>` +
    `<w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="${before}" w:after="80"/><w:outlineLvl w:val="${n - 1}"/></w:pPr>` +
    `<w:rPr><w:b/><w:color w:val="${color}"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr></w:style>`;

  return (
    XML_HEAD +
    `<w:styles ${W_NS}>` +
    '<w:docDefaults><w:rPrDefault><w:rPr>' +
    `<w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:eastAsia="${font}" w:cs="${font}"/>` +
    `<w:color w:val="${p.text}"/><w:sz w:val="21"/><w:szCs w:val="21"/><w:lang w:val="nl-NL" w:eastAsia="nl-NL" w:bidi="ar-SA"/>` +
    '</w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="288" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
    '<w:style w:type="character" w:default="1" w:styleId="DefaultParagraphFont"><w:name w:val="Default Paragraph Font"/><w:uiPriority w:val="1"/><w:semiHidden/></w:style>' +
    '<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:semiHidden/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="10"/><w:qFormat/>' +
    `<w:pPr><w:pBdr><w:bottom w:val="single" w:sz="12" w:space="6" w:color="${p.titleRule}"/></w:pBdr><w:spacing w:before="0" w:after="360" w:line="240" w:lineRule="auto"/></w:pPr>` +
    `<w:rPr><w:b/><w:color w:val="${p.heading}"/><w:sz w:val="48"/><w:szCs w:val="48"/></w:rPr></w:style>` +
    heading(1, 32, p.heading, 360) +
    heading(2, 26, p.heading, 280) +
    heading(3, 23, p.subheading, 220) +
    heading(4, 21, p.subheading, 200) +
    '<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:uiPriority w:val="34"/><w:qFormat/><w:pPr><w:ind w:left="720"/></w:pPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Footer"><w:name w:val="footer"/><w:basedOn w:val="Normal"/>' +
    `<w:pPr><w:tabs><w:tab w:val="right" w:pos="${TEXT_WIDTH}"/></w:tabs><w:spacing w:after="0"/></w:pPr><w:rPr><w:color w:val="${p.muted}"/><w:sz w:val="16"/></w:rPr></w:style>` +
    '</w:styles>'
  );
}

function footerXml(title: string, style: ExportStyle): string {
  const field = (instr: string) =>
    `<w:fldSimple w:instr=" ${instr} "><w:r><w:t>1</w:t></w:r></w:fldSimple>`;
  const top = style.footerRule ? `<w:pBdr><w:top w:val="single" w:sz="4" w:space="6" w:color="${style.border}"/></w:pBdr>` : '';
  return (
    XML_HEAD +
    `<w:ftr ${W_NS}><w:p><w:pPr><w:pStyle w:val="Footer"/>${top}</w:pPr>` +
    `<w:r><w:t xml:space="preserve">${xmlEscape(title)}</w:t></w:r><w:r><w:tab/></w:r>` +
    `<w:r><w:t xml:space="preserve">Pagina </w:t></w:r>${field('PAGE')}<w:r><w:t xml:space="preserve"> van </w:t></w:r>${field('NUMPAGES')}` +
    '</w:p></w:ftr>'
  );
}

async function buildOwn(input: WordInput, style: ExportStyle): Promise<WordResult> {
  const read = readAnswer(input.markdown);
  const numbering = new Numbering(1, 2, 1);
  const ctx: Ctx = {
    palette: style,
    styles: {
      title: 'Title',
      headings: ['Heading1', 'Heading2', 'Heading3', 'Heading4', 'Heading4', 'Heading4'],
      list: 'ListParagraph',
    },
    numbering,
    shift: read.shift,
  };
  const body = buildBody(input, ctx, read, true);
  const title = read.plainTitle || 'Antwoord uit PromptPlein';

  const sectPr =
    '<w:sectPr><w:footerReference w:type="default" r:id="rIdFooter"/>' +
    '<w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1418" w:right="1440" w:bottom="1418" w:left="1440" w:header="709" w:footer="567" w:gutter="0"/></w:sectPr>';

  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const data = await zipOffice({
    '[Content_Types].xml':
      XML_HEAD +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
      '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>' +
      '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>' +
      '<Override PartName="/word/fontTable.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.fontTable+xml"/>' +
      '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>' +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
      '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
      '</Types>',
    '_rels/.rels':
      XML_HEAD +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
      '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' +
      '</Relationships>',
    'docProps/core.xml':
      XML_HEAD +
      '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
      `<dc:title>${xmlEscape(title)}</dc:title><dc:language>nl-NL</dc:language>` +
      `<dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>` +
      '</cp:coreProperties>',
    'docProps/app.xml':
      XML_HEAD +
      '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>PromptPlein</Application></Properties>',
    'word/_rels/document.xml.rels':
      XML_HEAD +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '<Relationship Id="rIdNumbering" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>' +
      '<Relationship Id="rIdSettings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>' +
      '<Relationship Id="rIdFonts" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/fontTable" Target="fontTable.xml"/>' +
      '<Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>' +
      '</Relationships>',
    'word/document.xml': XML_HEAD + `<w:document ${W_NS}><w:body>${body}${sectPr}</w:body></w:document>`,
    'word/styles.xml': stylesXml(style),
    'word/numbering.xml':
      XML_HEAD + `<w:numbering ${W_NS}>${numbering.abstractXml()}${numbering.numsXml()}</w:numbering>`,
    'word/settings.xml':
      XML_HEAD +
      `<w:settings ${W_NS}><w:defaultTabStop w:val="709"/><w:characterSpacingControl w:val="doNotCompress"/>` +
      '<w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>',
    // De letter staat niet in het bestand (Rijks Sans is niet vrij). Wie hem niet
    // heeft, krijgt van Word een vergelijkbare letter: Arial of Times New Roman.
    'word/fontTable.xml':
      XML_HEAD +
      `<w:fonts ${W_NS}>` +
      `<w:font w:name="${xmlEscape(style.font)}"><w:altName w:val="${isSerif(style.font) ? 'Times New Roman' : 'Arial'}"/><w:family w:val="${isSerif(style.font) ? 'roman' : 'swiss'}"/><w:pitch w:val="variable"/></w:font>` +
      '<w:font w:name="Consolas"><w:family w:val="modern"/><w:pitch w:val="fixed"/></w:font>' +
      '</w:fonts>',
    'word/footer1.xml': footerXml(read.plainTitle, style),
  });
  return { data, fileName: fileNameFor(read, input.markdown) };
}

// --- Een document in het eigen sjabloon van de gebruiker ---

export class TemplateError extends Error {}

/** Zoekt de stijl-id's op naam: in een Nederlandse Word heet "heading 1" als id "Kop1". */
function templateStyles(stylesXmlText: string): StyleIds {
  const byName = new Map<string, string>();
  for (const match of stylesXmlText.matchAll(/<w:style\b([^>]*)>([\s\S]*?)<\/w:style>/g)) {
    const id = /w:styleId="([^"]+)"/.exec(match[1])?.[1];
    const type = /w:type="([^"]+)"/.exec(match[1])?.[1];
    const name = /<w:name w:val="([^"]+)"/.exec(match[2])?.[1];
    if (id && name && type === 'paragraph') byName.set(name.toLowerCase(), id);
  }
  return {
    title: byName.get('title'),
    headings: [1, 2, 3, 4, 5, 6].map((n) => byName.get(`heading ${n}`)),
    list: byName.get('list paragraph'),
  };
}

/**
 * Een sjabloon bevat alleen de stijlen die erin gebruikt zijn. Een sjabloon met
 * alleen een logo en voettekst kent dus geen Kop 1, en dan werden de koppen
 * vette gewone tekst. Ontbrekende stijlen komen er hier bij, met de standaard
 * van Word: de letter van het sjabloon en de accentkleur van zijn thema.
 */
const TEMPLATE_STYLE_DEFS: { name: string; id: string; xml: string }[] = [
  { name: 'title', id: 'Title', xml: templateHeadingStyle('Title', 'Title', 56, null) },
  { name: 'heading 1', id: 'Heading1', xml: templateHeadingStyle('Heading1', 'heading 1', 32, 0) },
  { name: 'heading 2', id: 'Heading2', xml: templateHeadingStyle('Heading2', 'heading 2', 26, 1) },
  { name: 'heading 3', id: 'Heading3', xml: templateHeadingStyle('Heading3', 'heading 3', 24, 2) },
  { name: 'heading 4', id: 'Heading4', xml: templateHeadingStyle('Heading4', 'heading 4', 22, 3) },
  {
    name: 'list paragraph',
    id: 'ListParagraph',
    xml: '<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:uiPriority w:val="34"/><w:qFormat/><w:pPr><w:ind w:left="720"/></w:pPr></w:style>',
  },
];

function templateHeadingStyle(id: string, name: string, size: number, outline: number | null): string {
  const pPr =
    outline === null
      ? '<w:spacing w:before="0" w:after="240"/>'
      : `<w:keepNext/><w:keepLines/><w:spacing w:before="${outline === 0 ? 360 : 240}" w:after="80"/><w:outlineLvl w:val="${outline}"/>`;
  return (
    `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/>` +
    `<w:uiPriority w:val="${outline === null ? 10 : 9}"/><w:qFormat/><w:pPr>${pPr}</w:pPr>` +
    `<w:rPr><w:b/><w:color w:val="2F5496" w:themeColor="accent1" w:themeShade="BF"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr></w:style>`
  );
}

/** Vult de stijlen van het sjabloon aan; geeft de nieuwe styles.xml en de stijl-id's. */
function completeTemplateStyles(stylesXmlText: string): { xml: string; styles: StyleIds } {
  const found = templateStyles(stylesXmlText);
  if (!/<\/w:styles>/.test(stylesXmlText)) return { xml: stylesXmlText, styles: found };
  const usedIds = new Set([...stylesXmlText.matchAll(/w:styleId="([^"]+)"/g)].map((m) => m[1]));
  const have = new Map<string, string | undefined>([
    ['title', found.title],
    ['list paragraph', found.list],
    ...[1, 2, 3, 4].map((n) => [`heading ${n}`, found.headings[n - 1]] as [string, string | undefined]),
  ]);
  // In een Nederlandse Word heet de standaardstijl vaak "Standaard" als id.
  const normal =
    /<w:style\b[^>]*w:type="paragraph"[^>]*w:default="1"[^>]*w:styleId="([^"]+)"/.exec(stylesXmlText)?.[1] ??
    /<w:style\b[^>]*w:default="1"[^>]*w:type="paragraph"[^>]*w:styleId="([^"]+)"/.exec(stylesXmlText)?.[1];
  let added = '';
  for (const def of TEMPLATE_STYLE_DEFS) {
    if (have.get(def.name)) continue;
    // Bestaat de id al onder een andere naam, dan krijgt de onze een eigen id.
    const id = usedIds.has(def.id) ? `PromptPlein${def.id}` : def.id;
    let xml = def.xml.replace(`w:styleId="${def.id}"`, `w:styleId="${id}"`);
    xml = normal ? xml.replace(/w:val="Normal"/g, `w:val="${normal}"`) : xml.replace(/<w:basedOn w:val="Normal"\/><w:next w:val="Normal"\/>|<w:basedOn w:val="Normal"\/>/g, '');
    added += xml;
    usedIds.add(id);
    have.set(def.name, id);
  }
  const h = (n: number) => have.get(`heading ${n}`);
  return {
    xml: added ? stylesXmlText.replace('</w:styles>', `${added}</w:styles>`) : stylesXmlText,
    styles: {
      title: have.get('title'),
      headings: [h(1), h(2), h(3), h(4), found.headings[4] ?? h(4), found.headings[5] ?? h(4)],
      list: have.get('list paragraph'),
    },
  };
}

const PLACEHOLDER = (name: string) => new RegExp(`\\{\\{?\\s*${name}\\s*\\}?\\}`, 'gi');

/** De zichtbare tekst van een alinea; Word knipt "{titel}" vaak in stukjes. */
function paragraphText(p: string): string {
  return [...p.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('');
}

/** Vult {titel} en {datum} in, met de opmaak van het eerste stukje tekst. */
function fillPlaceholders(xml: string, values: Record<string, string>): string {
  return xml.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g, (p) => {
    const text = paragraphText(p);
    if (!Object.keys(values).some((key) => PLACEHOLDER(key).test(text))) return p;
    let next = text;
    for (const [key, value] of Object.entries(values)) next = next.replace(PLACEHOLDER(key), xmlEscape(value));
    const open = /^<w:p\b[^>]*>/.exec(p)![0];
    const pPr = /<w:pPr>[\s\S]*?<\/w:pPr>/.exec(p)?.[0] ?? '';
    const rPr = /<w:r\b[^>]*>\s*(<w:rPr>[\s\S]*?<\/w:rPr>)/.exec(p)?.[1] ?? '';
    return `${open}${pPr}<w:r>${rPr}<w:t xml:space="preserve">${next}</w:t></w:r></w:p>`;
  });
}

function maxId(xml: string, attr: string): number {
  let max = 0;
  for (const m of xml.matchAll(new RegExp(`${attr}="(\\d+)"`, 'g'))) max = Math.max(max, Number(m[1]));
  return max;
}

async function buildFromTemplate(input: WordInput, template: Uint8Array): Promise<WordResult> {
  const { unzipSync, strFromU8 } = await import('fflate');
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(template);
  } catch {
    throw new TemplateError('Het sjabloon is geen Word-bestand dat te openen is.');
  }
  const text = (path: string) => (files[path] ? strFromU8(files[path]) : null);
  const out: Record<string, string | Uint8Array> = { ...files };

  const documentXml = text('word/document.xml');
  const contentTypes = text('[Content_Types].xml');
  if (!documentXml || !contentTypes) throw new TemplateError('Het sjabloon is geen Word-bestand dat te openen is.');
  if (files['word/vbaProject.bin']) throw new TemplateError('Het sjabloon bevat macro’s. Kies een .docx of .dotx zonder macro’s.');

  const read = readAnswer(input.markdown);
  const stylesText = text('word/styles.xml') ?? '';

  // Nummering: onze lijsten krijgen id's boven wat het sjabloon al heeft.
  let numberingXml = text('word/numbering.xml');
  const base = numberingXml ? Math.max(maxId(numberingXml, 'w:abstractNumId'), maxId(numberingXml, 'w:numId')) + 1 : 1;
  const numbering = new Numbering(base, base + 1, base + 2);

  const completed = completeTemplateStyles(stylesText);
  if (completed.xml !== stylesText) out['word/styles.xml'] = completed.xml;
  const ctx: Ctx = { palette: SJABLOON, styles: completed.styles, numbering, shift: read.shift };
  const values = { titel: read.plainTitle, datum: todayLong() };

  const bodyMatch = /(<w:body\b[^>]*>)([\s\S]*)(<\/w:body>)/.exec(documentXml);
  if (!bodyMatch) throw new TemplateError('Het sjabloon is geen Word-bestand dat te openen is.');
  const bodyInner = bodyMatch[2];

  // Staat {inhoud} in het sjabloon, dan komt de tekst daar; de rest blijft staan.
  // Zo niet, dan vervangt de tekst de inhoud en blijven kop- en voettekst staan.
  const contentParagraph = [...bodyInner.matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)].find((m) =>
    PLACEHOLDER('inhoud').test(paragraphText(m[0])),
  );
  let newInner: string;
  if (contentParagraph) {
    const titleInTemplate = PLACEHOLDER('titel').test(paragraphText(bodyInner));
    const body = buildBody(input, ctx, read, !titleInTemplate);
    const at = contentParagraph.index!;
    newInner = fillPlaceholders(bodyInner.slice(0, at), values) + body + fillPlaceholders(bodyInner.slice(at + contentParagraph[0].length), values);
  } else {
    const at = bodyInner.lastIndexOf('<w:sectPr');
    const tail = at >= 0 ? bodyInner.slice(at) : '';
    const finalSectPr = tail && !/<\/w:p>/.test(tail) ? tail : '';
    newInner = buildBody(input, ctx, read, true) + finalSectPr;
  }
  out['word/document.xml'] = documentXml.slice(0, bodyMatch.index) + bodyMatch[1] + newInner + bodyMatch[3] + documentXml.slice(bodyMatch.index + bodyMatch[0].length);

  // Kop- en voetteksten: ook daar {titel} en {datum} invullen.
  for (const path of Object.keys(files)) {
    if (/^word\/(header|footer)\d*\.xml$/.test(path)) out[path] = fillPlaceholders(text(path)!, values);
  }

  if (numbering.used) {
    if (numberingXml) {
      const firstNum = numberingXml.search(/<w:num\s+w:numId=/);
      const abstracts = numbering.abstractXml();
      numberingXml =
        firstNum >= 0
          ? numberingXml.slice(0, firstNum) + abstracts + numberingXml.slice(firstNum)
          : numberingXml.replace('</w:numbering>', abstracts + '</w:numbering>');
      const cleanup = numberingXml.indexOf('<w:numIdMacAtCleanup');
      numberingXml =
        cleanup >= 0
          ? numberingXml.slice(0, cleanup) + numbering.numsXml() + numberingXml.slice(cleanup)
          : numberingXml.replace('</w:numbering>', numbering.numsXml() + '</w:numbering>');
      out['word/numbering.xml'] = numberingXml;
    } else {
      out['word/numbering.xml'] =
        XML_HEAD + `<w:numbering ${W_NS}>${numbering.abstractXml()}${numbering.numsXml()}</w:numbering>`;
      const rels = text('word/_rels/document.xml.rels') ?? '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
      out['word/_rels/document.xml.rels'] = rels.replace(
        '</Relationships>',
        '<Relationship Id="rIdPromptPleinNumbering" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/></Relationships>',
      );
      out['[Content_Types].xml'] = contentTypes.replace(
        '</Types>',
        '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/></Types>',
      );
    }
  }

  // Een .dotx is een sjabloon; het resultaat is een gewoon document.
  const types = out['[Content_Types].xml'];
  out['[Content_Types].xml'] = (typeof types === 'string' ? types : contentTypes).replace(
    'wordprocessingml.template.main+xml',
    'wordprocessingml.document.main+xml',
  );

  return { data: await zipOffice(out), fileName: fileNameFor(read, input.markdown) };
}

/** Maakt het Word-bestand: in het sjabloon als dat er is, anders in deze opmaak. */
export async function buildWordDocument(
  input: WordInput,
  style: ExportStyle,
  template?: Uint8Array | null,
): Promise<WordResult> {
  if (template) return buildFromTemplate(input, template);
  return buildOwn(input, style);
}

/** Controleert bij het toevoegen of een sjabloon bruikbaar is. Geeft een fout of null. */
export async function checkWordTemplate(template: Uint8Array): Promise<string | null> {
  try {
    await buildFromTemplate({ markdown: '# Proef\n\nTekst met een lijst:\n\n- een\n- twee' }, template);
    return null;
  } catch (error) {
    return error instanceof TemplateError ? error.message : 'Het sjabloon is geen Word-bestand dat te openen is.';
  }
}
