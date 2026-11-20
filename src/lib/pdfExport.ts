// Zet een chatantwoord om in een PDF, helemaal in de browser en zonder
// bibliotheek. Een PDF is tekst met een lijst van posities; het enige lastige is
// regels afbreken, en daarvoor staan hieronder de letterbreedtes van Helvetica.
// Rijks Sans gaat er bewust niet in: het lettertype is niet vrij, en een PDF zou
// het moeten meenemen. Helvetica zit in elke PDF-lezer.

import { documentBaseName, readAnswer } from './answerDocument';
import { inlineRuns, type Block, type InlineRun, type ListNode } from './markdownBlocks';
import { todayLong } from './officeXml';
import type { ExportFile, ExportInput } from './textExport';

export type PdfLook = 'rijk' | 'eenvoudig';

// --- Letters ---

/** Breedtes van Helvetica en Helvetica-Bold voor de tekens 32 tot 255 (WinAnsi), per 1000. */
const REGULAR = '278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,0,556,0,222,556,333,1000,556,556,333,1000,667,333,1000,0,611,0,0,222,222,333,333,350,556,1000,333,1000,500,333,944,0,500,667,278,333,556,556,556,556,260,556,333,737,370,556,584,333,737,552,400,549,333,333,333,576,537,333,333,333,365,556,834,834,834,611,667,667,667,667,667,667,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,500,556,556,556,556,278,278,278,278,556,556,556,556,556,556,556,549,611,556,556,556,556,500,556,500'
  .split(',')
  .map(Number);
const BOLD = '278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584,0,556,0,278,556,500,1000,556,556,333,1000,667,333,1000,0,611,0,0,278,278,500,500,350,556,1000,333,1000,556,333,944,0,500,667,278,333,556,556,556,556,280,556,333,737,370,556,584,333,737,552,400,549,333,333,333,576,556,333,333,333,365,556,834,834,834,611,722,722,722,722,722,722,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,556,556,556,556,556,278,278,278,278,611,611,611,611,611,611,611,549,611,611,611,611,611,556,611,556'
  .split(',')
  .map(Number);

type FontKey = 'F1' | 'F2' | 'F3' | 'F4' | 'F5';
const FONTS: Record<FontKey, string> = {
  F1: 'Helvetica',
  F2: 'Helvetica-Bold',
  F3: 'Helvetica-Oblique',
  F4: 'Helvetica-BoldOblique',
  F5: 'Courier',
};

/** De tekens 128 tot 159 van WinAnsi, met hun Unicode-waarde. */
const WIN_ANSI_HIGH: Record<number, number> = {
  0x20ac: 128, 0x201a: 130, 0x0192: 131, 0x201e: 132, 0x2026: 133, 0x2020: 134, 0x2021: 135, 0x02c6: 136,
  0x2030: 137, 0x0160: 138, 0x2039: 139, 0x0152: 140, 0x017d: 142, 0x2018: 145, 0x2019: 146, 0x201c: 147,
  0x201d: 148, 0x2022: 149, 0x2013: 150, 0x2014: 151, 0x02dc: 152, 0x2122: 153, 0x0161: 154, 0x203a: 155,
  0x0153: 156, 0x017e: 158, 0x0178: 159,
};

/** Tekens die Helvetica niet kent, vervangen door iets wat er wel in staat. */
const SUBSTITUTE: Record<string, string> = {
  '→': '->', '←': '<-', '⇒': '=>', '≥': '>=', '≤': '<=', '≠': '!=', '≈': '~', '✓': 'v', '✔': 'v',
  '✗': 'x', '✘': 'x', '▪': '•', '◦': '•', '●': '•', '‑': '-', '‐': '-', '−': '-',
  ' ': ' ', ' ': ' ', ' ': ' ', '​': '',
};

/** Zet tekst om in WinAnsi-codes; wat Helvetica niet kan tonen, valt weg. */
function encode(text: string): number[] {
  const codes: number[] = [];
  for (const raw of text.normalize('NFC')) {
    const ch = SUBSTITUTE[raw] ?? raw;
    for (const c of ch) {
      const cp = c.codePointAt(0)!;
      if (cp >= 32 && cp <= 126) codes.push(cp);
      else if (cp >= 160 && cp <= 255) codes.push(cp);
      else if (WIN_ANSI_HIGH[cp]) codes.push(WIN_ANSI_HIGH[cp]);
      else if (cp === 9) codes.push(32);
    }
  }
  return codes;
}

function widthOf(text: string, font: FontKey, size: number): number {
  if (font === 'F5') return encode(text).length * 600 * size / 1000;
  const table = font === 'F2' || font === 'F4' ? BOLD : REGULAR;
  let w = 0;
  for (const code of encode(text)) w += table[code - 32] || 556;
  return (w * size) / 1000;
}

/** Een PDF-tekenreeks: haakjes en backslash ontsnapt, hoge tekens als octaal. */
function pdfString(text: string): string {
  let out = '(';
  for (const code of encode(text)) {
    if (code === 40 || code === 41 || code === 92) out += '\\' + String.fromCharCode(code);
    else if (code > 126) out += '\\' + code.toString(8).padStart(3, '0');
    else out += String.fromCharCode(code);
  }
  return out + ')';
}

/** Een tekenreeks voor de documentgegevens (titel), in UTF-16 zodat alles kan. */
function pdfUnicode(text: string): string {
  let hex = 'FEFF';
  for (let i = 0; i < text.length; i++) hex += text.charCodeAt(i).toString(16).padStart(4, '0');
  return `<${hex.toUpperCase()}>`;
}

// --- Kleuren ---

interface Palette {
  heading: string;
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
  titleRule: string;
}

const RIJK: Palette = {
  heading: '154273',
  subheading: '01689B',
  link: '01689B',
  text: '1E293B',
  muted: '64748B',
  border: 'CBD5E1',
  tableHeadFill: '154273',
  tableHeadText: 'FFFFFF',
  tableBand: 'F1F5F9',
  codeFill: 'F1F5F9',
  quoteBar: '01689B',
  titleRule: '154273',
};

const EENVOUDIG: Palette = {
  heading: '1F2937',
  subheading: '374151',
  link: '1D4ED8',
  text: '111827',
  muted: '6B7280',
  border: 'D1D5DB',
  tableHeadFill: 'F3F4F6',
  tableHeadText: '111827',
  tableBand: null,
  codeFill: 'F3F4F6',
  quoteBar: '9CA3AF',
  titleRule: 'D1D5DB',
};

function rgb(hex: string): string {
  const n = parseInt(hex, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => (v / 255).toFixed(3)).join(' ');
}

// --- Pagina's ---

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN_X = 70.87;
const MARGIN_TOP = 70;
const MARGIN_BOTTOM = 72;
const TEXT_W = PAGE_W - 2 * MARGIN_X;

const BODY_SIZE = 10.5;
const BODY_LEADING = 15;

interface Piece {
  text: string;
  font: FontKey;
  color: string;
  link?: string;
}

interface Link {
  x: number;
  y: number;
  w: number;
  h: number;
  url: string;
}

function fontFor(run: InlineRun, forceBold = false, forceItalic = false): FontKey {
  if (run.code) return 'F5';
  const bold = forceBold || run.bold;
  const italic = forceItalic || run.italic;
  return bold && italic ? 'F4' : bold ? 'F2' : italic ? 'F3' : 'F1';
}

class Layout {
  pages: { ops: string[]; links: Link[] }[] = [];
  /** Afstand vanaf de bovenkant van de pagina. */
  y = MARGIN_TOP;

  constructor(readonly palette: Palette) {
    this.newPage();
  }

  get page() {
    return this.pages[this.pages.length - 1];
  }

  newPage() {
    this.pages.push({ ops: [], links: [] });
    this.y = MARGIN_TOP;
  }

  /** Past er nog `height` op deze pagina? Anders een nieuwe. */
  ensure(height: number) {
    if (this.y + height > PAGE_H - MARGIN_BOTTOM && this.y > MARGIN_TOP) this.newPage();
  }

  fillRect(x: number, top: number, w: number, h: number, color: string) {
    this.page.ops.push(`${rgb(color)} rg ${x.toFixed(2)} ${(PAGE_H - top - h).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`);
  }

  line(x1: number, top1: number, x2: number, top2: number, color: string, width = 0.75) {
    this.page.ops.push(
      `${rgb(color)} RG ${width} w ${x1.toFixed(2)} ${(PAGE_H - top1).toFixed(2)} m ${x2.toFixed(2)} ${(PAGE_H - top2).toFixed(2)} l S`,
    );
  }

  text(x: number, baseline: number, text: string, font: FontKey, size: number, color: string) {
    if (!text) return;
    this.page.ops.push(
      `BT /${font} ${size} Tf ${rgb(color)} rg ${x.toFixed(2)} ${(PAGE_H - baseline).toFixed(2)} Td ${pdfString(text)} Tj ET`,
    );
  }

  /** Breekt stukken tekst af op de breedte en geeft de regels terug. */
  wrap(pieces: Piece[], width: number, size: number): Piece[][] {
    const words: Piece[] = [];
    for (const piece of pieces) {
      for (const part of piece.text.split(/(\s+)/)) {
        if (part) words.push({ ...piece, text: /^\s+$/.test(part) ? ' ' : part });
      }
    }
    const lines: Piece[][] = [];
    let line: Piece[] = [];
    let lineW = 0;
    const push = () => {
      while (line.length && line[line.length - 1].text === ' ') line.pop();
      lines.push(line);
      line = [];
      lineW = 0;
    };
    for (const word of words) {
      if (word.text === ' ' && !line.length) continue;
      const w = widthOf(word.text, word.font, size);
      if (lineW + w > width && line.length) {
        push();
        if (word.text === ' ') continue;
      }
      // Een woord dat langer is dan de regel (een lange link), in stukken.
      if (w > width) {
        let rest = word.text;
        while (rest) {
          let n = rest.length;
          while (n > 1 && widthOf(rest.slice(0, n), word.font, size) > width - lineW) n--;
          line.push({ ...word, text: rest.slice(0, n) });
          rest = rest.slice(n);
          if (rest) push();
        }
        lineW = widthOf(line.map((p) => p.text).join(''), word.font, size);
        continue;
      }
      line.push(word);
      lineW += w;
    }
    if (line.length || !lines.length) push();
    return lines;
  }

  /** Tekent één regel stukken vanaf x; links worden aanklikbaar. */
  drawLine(pieces: Piece[], x: number, top: number, size: number, leading: number) {
    const baseline = top + (leading - size) / 2 + size * 0.8;
    let cx = x;
    let i = 0;
    while (i < pieces.length) {
      // Stukken met dezelfde letter, kleur en link samen in één keer.
      let text = pieces[i].text;
      let j = i + 1;
      while (
        j < pieces.length &&
        pieces[j].font === pieces[i].font &&
        pieces[j].color === pieces[i].color &&
        pieces[j].link === pieces[i].link
      ) {
        text += pieces[j].text;
        j++;
      }
      const w = widthOf(text, pieces[i].font, size);
      this.text(cx, baseline, text, pieces[i].font, size, pieces[i].color);
      const link = pieces[i].link;
      if (link && text.trim()) {
        this.page.links.push({ x: cx, y: PAGE_H - top - leading, w, h: leading, url: link });
        this.line(cx, baseline + 1.2, cx + w, baseline + 1.2, pieces[i].color, 0.5);
      }
      cx += w;
      i = j;
    }
  }

  /** Een alinea: afbreken, en waar nodig over de pagina heen. */
  paragraph(
    pieces: Piece[],
    opts: { size?: number; leading?: number; indent?: number; width?: number; after?: number; bar?: string } = {},
  ) {
    const size = opts.size ?? BODY_SIZE;
    const leading = opts.leading ?? BODY_LEADING;
    const x = MARGIN_X + (opts.indent ?? 0);
    const lines = this.wrap(pieces, opts.width ?? TEXT_W - (opts.indent ?? 0), size);
    for (const line of lines) {
      this.ensure(leading);
      if (opts.bar) this.fillRect(x - 10, this.y, 2, leading, opts.bar);
      this.drawLine(line, x, this.y, size, leading);
      this.y += leading;
    }
    this.y += opts.after ?? 6;
  }
}

function piecesOf(text: string, color: string, palette: Palette, bold = false, italic = false): Piece[] {
  return inlineRuns(text).map((run) => ({
    text: run.text,
    font: fontFor(run, bold, italic),
    color: run.link ? palette.link : color,
    link: run.link,
  }));
}

const HEADING_SIZES = [16, 13.5, 12, 10.5];

function heading(layout: Layout, level: number, text: string) {
  const p = layout.palette;
  const size = HEADING_SIZES[Math.min(level, 4) - 1];
  const before = level <= 1 ? 14 : 10;
  // Een kop niet als laatste regel onderaan een pagina.
  layout.ensure(before + size * 1.3 + BODY_LEADING * 2);
  if (layout.y > MARGIN_TOP) layout.y += before;
  layout.paragraph(piecesOf(text, level <= 2 ? p.heading : p.subheading, p, true), {
    size,
    leading: size * 1.3,
    after: 4,
  });
}

function list(layout: Layout, node: ListNode, depth: number) {
  const p = layout.palette;
  const indent = 16 + depth * 16;
  node.items.forEach((item, i) => {
    const marker = node.ordered ? `${node.start + i}.` : depth % 2 ? '–' : '•';
    layout.ensure(BODY_LEADING);
    const markerW = widthOf(marker, 'F1', BODY_SIZE);
    const top = layout.y;
    const pageBefore = layout.pages.length;
    layout.paragraph(piecesOf(item.text, p.text, p), { indent, after: 2 });
    // De markering op de eerste regel van het item, ook als die op een nieuwe pagina viel.
    const page = layout.pages.length === pageBefore ? layout.page : layout.pages[pageBefore - 1];
    const baseline = top + (BODY_LEADING - BODY_SIZE) / 2 + BODY_SIZE * 0.8;
    page.ops.push(
      `BT /F1 ${BODY_SIZE} Tf ${rgb(p.text)} rg ${(MARGIN_X + indent - 6 - markerW).toFixed(2)} ${(PAGE_H - baseline).toFixed(2)} Td ${pdfString(marker)} Tj ET`,
    );
    for (const child of item.children) list(layout, child, depth + 1);
  });
  if (depth === 0) layout.y += 4;
}

function table(layout: Layout, block: Extract<Block, { kind: 'table' }>) {
  const p = layout.palette;
  const size = 9.5;
  const leading = 13;
  const pad = 5;
  const cols = block.header.length;
  const cell = (row: string[], c: number) => row[c] ?? '';

  // Kolombreedtes: eerst de langste woorden, de rest naar wat elke kolom wil.
  const natural: number[] = [];
  const minimum: number[] = [];
  for (let c = 0; c < cols; c++) {
    const texts = [block.header[c], ...block.rows.map((r) => cell(r, c))];
    natural[c] = Math.max(...texts.map((t) => widthOf(inlineRuns(t).map((r) => r.text).join(''), 'F1', size))) + 2 * pad + 2;
    minimum[c] = Math.min(
      Math.max(...texts.flatMap((t) => t.split(/\s+/).map((w) => widthOf(w, 'F2', size)))) + 2 * pad,
      TEXT_W / cols,
    );
  }
  const totalNatural = natural.reduce((a, b) => a + b, 0);
  let widths: number[];
  if (totalNatural <= TEXT_W) widths = natural.map((w) => (w / totalNatural) * TEXT_W);
  else {
    const totalMin = minimum.reduce((a, b) => a + b, 0);
    const extra = Math.max(TEXT_W - totalMin, 0);
    const want = natural.map((w, c) => Math.max(w - minimum[c], 0));
    const totalWant = want.reduce((a, b) => a + b, 0) || 1;
    widths = minimum.map((m, c) => m + (extra * want[c]) / totalWant);
    const sum = widths.reduce((a, b) => a + b, 0);
    widths = widths.map((w) => (w / sum) * TEXT_W);
  }

  const layoutRow = (row: string[], head: boolean) => {
    const color = head ? p.tableHeadText : p.text;
    const lines = widths.map((w, c) => layout.wrap(piecesOf(cell(row, c), color, p, head), w - 2 * pad, size));
    return { lines, height: Math.max(...lines.map((l) => l.length)) * leading + 2 * pad };
  };

  const drawRow = (row: ReturnType<typeof layoutRow>, fill: string | null, head: boolean) => {
    if (fill) layout.fillRect(MARGIN_X, layout.y, TEXT_W, row.height, fill);
    let x = MARGIN_X;
    row.lines.forEach((lines, c) => {
      const align = block.align[c];
      lines.forEach((line, l) => {
        const lineW = line.reduce((sum, piece) => sum + widthOf(piece.text, piece.font, size), 0);
        const offset = align === 'right' ? widths[c] - 2 * pad - lineW : align === 'center' ? (widths[c] - 2 * pad - lineW) / 2 : 0;
        layout.drawLine(line, x + pad + offset, layout.y + pad + l * leading, size, leading);
      });
      x += widths[c];
    });
    layout.y += row.height;
    layout.line(MARGIN_X, layout.y, MARGIN_X + TEXT_W, layout.y, head ? p.tableHeadFill : p.border, head ? 1 : 0.5);
  };

  const header = layoutRow(block.header, true);
  const headFill = p.tableHeadFill;
  layout.ensure(header.height + 30);
  layout.y += 2;
  drawRow(header, headFill, true);
  block.rows.forEach((r, i) => {
    const row = layoutRow(r, false);
    if (layout.y + row.height > PAGE_H - MARGIN_BOTTOM) {
      layout.newPage();
      drawRow(header, headFill, true);
    }
    drawRow(row, p.tableBand && i % 2 === 1 ? p.tableBand : null, false);
  });
  layout.y += 10;
}

function code(layout: Layout, text: string) {
  const p = layout.palette;
  const size = 8.5;
  const leading = 11.5;
  const maxChars = Math.floor((TEXT_W - 16) / (size * 0.6));
  const lines = text
    .replace(/\t/g, '    ')
    .split('\n')
    .flatMap((line) => {
      const parts: string[] = [];
      for (let i = 0; i < Math.max(line.length, 1); i += maxChars) parts.push(line.slice(i, i + maxChars));
      return parts;
    });
  layout.y += 2;
  lines.forEach((line, i) => {
    layout.ensure(leading);
    const first = i === 0;
    const last = i === lines.length - 1;
    layout.fillRect(MARGIN_X, layout.y - (first ? 4 : 0), TEXT_W, leading + (first ? 4 : 0) + (last ? 4 : 0), p.codeFill);
    layout.drawLine([{ text: line, font: 'F5', color: p.text }], MARGIN_X + 8, layout.y, size, leading);
    layout.y += leading;
  });
  layout.y += 12;
}

function block(layout: Layout, b: Block) {
  const p = layout.palette;
  switch (b.kind) {
    case 'spacer':
      return;
    case 'rule':
      layout.ensure(14);
      layout.line(MARGIN_X, layout.y + 6, MARGIN_X + TEXT_W, layout.y + 6, p.border);
      layout.y += 14;
      return;
    case 'heading':
      return heading(layout, b.level, b.text);
    case 'label':
      layout.ensure(BODY_LEADING * 2);
      return layout.paragraph(piecesOf(b.text, p.text, p, true), { after: 2 });
    case 'paragraph':
      return layout.paragraph(piecesOf(b.text, p.text, p));
    case 'quote':
      return layout.paragraph(piecesOf(b.lines.join(' '), p.muted, p, false, true), { indent: 12, bar: p.quoteBar });
    case 'list':
      return list(layout, b.list, 0);
    case 'table':
      return table(layout, b);
  }
}

/** Het chatantwoord als PDF, in de kleuren van de gekozen vormgeving. */
export async function buildPdf(input: ExportInput, look: PdfLook): Promise<ExportFile> {
  const read = readAnswer(input.markdown);
  const palette = look === 'rijk' ? RIJK : EENVOUDIG;
  const layout = new Layout(palette);

  if (read.title) {
    layout.paragraph(piecesOf(read.title, palette.heading, palette, true), { size: 22, leading: 27, after: 2 });
    layout.line(MARGIN_X, layout.y + 4, MARGIN_X + TEXT_W, layout.y + 4, palette.titleRule, 1.5);
    layout.y += 22;
  }
  const level = (n: number) => Math.max(n - read.shift, 1);
  for (const part of read.parts) {
    if (part.kind === 'blocks') {
      for (const b of part.blocks) block(layout, b.kind === 'heading' ? { ...b, level: level(b.level) } : b);
    } else if (part.kind === 'code') code(layout, part.code);
    else
      layout.paragraph(
        [{ text: 'Hier stond een HTML-bestand. Dat download je los in de chat.', font: 'F3', color: palette.muted }],
      );
  }
  if (input.sources?.length) {
    heading(layout, 1, 'Bronnen');
    list(
      layout,
      {
        ordered: true,
        start: 1,
        items: input.sources.map((s) => ({ text: `${s.title.replace(/[[\]]/g, '')}: ${s.url}`, children: [] })),
      },
      0,
    );
  }

  // Voettekst op elke pagina: titel links, paginanummer rechts.
  const footerTitle = read.plainTitle || 'Antwoord uit PromptPlein';
  const total = layout.pages.length;
  layout.pages.forEach((page, i) => {
    const top = PAGE_H - 40;
    if (look === 'rijk') {
      page.ops.push(`${rgb(palette.border)} RG 0.5 w ${MARGIN_X} ${(PAGE_H - top + 12).toFixed(2)} m ${MARGIN_X + TEXT_W} ${(PAGE_H - top + 12).toFixed(2)} l S`);
    }
    const label = `Pagina ${i + 1} van ${total}`;
    const titleText = widthOf(footerTitle, 'F1', 8) > TEXT_W - 80 ? `${footerTitle.slice(0, 70)}…` : footerTitle;
    page.ops.push(`BT /F1 8 Tf ${rgb(palette.muted)} rg ${MARGIN_X} ${(PAGE_H - top).toFixed(2)} Td ${pdfString(titleText)} Tj ET`);
    page.ops.push(
      `BT /F1 8 Tf ${rgb(palette.muted)} rg ${(MARGIN_X + TEXT_W - widthOf(label, 'F1', 8)).toFixed(2)} ${(PAGE_H - top).toFixed(2)} Td ${pdfString(label)} Tj ET`,
    );
  });

  const data = await writePdf(layout, read.plainTitle || 'Antwoord uit PromptPlein');
  return { data, fileName: `${documentBaseName(read, input.markdown)}.pdf`, mime: 'application/pdf' };
}

/** Schrijft de objecten, de inhoud (ingepakt) en de verwijzingstabel. */
async function writePdf(layout: Layout, title: string): Promise<Uint8Array> {
  const { zlibSync, strToU8 } = await import('fflate');
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (data: Uint8Array) => {
    chunks.push(data);
    length += data.length;
  };
  const ascii = (text: string) => strToU8(text, true);
  const object = (id: number, body: string, stream?: Uint8Array) => {
    offsets[id] = length;
    if (stream) {
      push(ascii(`${id} 0 obj\n${body}\nstream\n`));
      push(stream);
      push(ascii('\nendstream\nendobj\n'));
    } else push(ascii(`${id} 0 obj\n${body}\nendobj\n`));
  };

  push(ascii('%PDF-1.4\n'));
  push(new Uint8Array([37, 226, 227, 207, 211, 10]));

  const fontIds = Object.keys(FONTS).map((_, i) => 3 + i);
  let next = 3 + fontIds.length;
  const pageIds: number[] = [];
  const pageObjects: (() => void)[] = [];
  for (const page of layout.pages) {
    const pageId = next++;
    const contentId = next++;
    const linkIds = page.links.map(() => next++);
    pageIds.push(pageId);
    pageObjects.push(() => {
      const fonts = Object.keys(FONTS)
        .map((key, i) => `/${key} ${fontIds[i]} 0 R`)
        .join(' ');
      const annots = linkIds.length ? ` /Annots [${linkIds.map((id) => `${id} 0 R`).join(' ')}]` : '';
      object(
        pageId,
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << ${fonts} >> >> /Contents ${contentId} 0 R${annots} >>`,
      );
      const stream = zlibSync(ascii(page.ops.join('\n')), { level: 6 });
      object(contentId, `<< /Length ${stream.length} /Filter /FlateDecode >>`, stream);
      page.links.forEach((link, i) => {
        const url = link.url.replace(/[\\()]/g, (c) => `\\${c}`).replace(/[^\x20-\x7e]/g, encodeURIComponent);
        object(
          linkIds[i],
          `<< /Type /Annot /Subtype /Link /Rect [${link.x.toFixed(2)} ${link.y.toFixed(2)} ${(link.x + link.w).toFixed(2)} ${(link.y + link.h).toFixed(2)}] /Border [0 0 0] /A << /Type /Action /S /URI /URI (${url}) >> >>`,
        );
      });
    });
  }
  const infoId = next++;

  object(1, '<< /Type /Catalog /Pages 2 0 R /Lang (nl-NL) /ViewerPreferences << /DisplayDocTitle true >> >>');
  object(2, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`);
  Object.values(FONTS).forEach((name, i) => {
    const encoding = name === 'Courier' ? '' : ' /Encoding /WinAnsiEncoding';
    object(fontIds[i], `<< /Type /Font /Subtype /Type1 /BaseFont /${name}${encoding} >>`);
  });
  pageObjects.forEach((write) => write());
  const date = new Date();
  const stamp = `D:${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  object(
    infoId,
    `<< /Title ${pdfUnicode(title)} /Subject ${pdfUnicode(`PromptPlein, ${todayLong()}`)} /Producer (PromptPlein) /CreationDate (${stamp}) >>`,
  );

  const xrefAt = length;
  let xref = `xref\n0 ${next}\n0000000000 65535 f \n`;
  for (let id = 1; id < next; id++) xref += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  push(ascii(`${xref}trailer\n<< /Size ${next} /Root 1 0 R /Info ${infoId} 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`));

  const out = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}
