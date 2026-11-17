// De Markdown van de AI, gelezen als blokken: koppen, alinea's, lijsten,
// tabellen en citaten. Het scherm (RichText) en de Word- en Excel-download lezen
// met dezelfde regels, zodat het document laat zien wat er in de chat stond.

export interface ListNode {
  ordered: boolean;
  start: number;
  items: { text: string; children: ListNode[] }[];
}

export type Align = 'left' | 'center' | 'right' | undefined;

export type Block =
  | { kind: 'spacer' }
  | { kind: 'rule' }
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'label'; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'quote'; lines: string[] }
  | { kind: 'list'; list: ListNode }
  | { kind: 'table'; header: string[]; align: Align[]; rows: string[][] };

const LIST_LINE = /^(\s*)([-*•]|\d+[.)])\s+(.*)$/;
const TABLE_DIVIDER = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/;

function splitRow(line: string): string[] {
  const cells = line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim().replace(/\\\|/g, '|'));
  return cells;
}

function isRow(line: string | undefined): boolean {
  return Boolean(line && line.trim().startsWith('|'));
}

function alignOf(cell: string): Align {
  const left = cell.startsWith(':');
  const right = cell.endsWith(':');
  if (left && right) return 'center';
  if (right) return 'right';
  return left ? 'left' : undefined;
}

/** Leest een lijst vanaf `start`. Een losse witregel tussen items breekt hem niet. */
function parseList(lines: string[], start: number): { list: ListNode; next: number } {
  const first = LIST_LINE.exec(lines[start])!;
  const ordered = /\d/.test(first[2]);
  const root: ListNode = { ordered, start: ordered ? parseInt(first[2], 10) : 1, items: [] };
  const stack: { indent: number; list: ListNode }[] = [
    { indent: first[1].replace(/\t/g, '    ').length, list: root },
  ];

  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      let ahead = i + 1;
      while (ahead < lines.length && !lines[ahead].trim()) ahead++;
      if (ahead >= lines.length || !LIST_LINE.test(lines[ahead])) break;
      i = ahead;
      continue;
    }
    const match = LIST_LINE.exec(line);
    if (!match) break;

    const indent = match[1].replace(/\t/g, '    ').length;
    const isOrdered = /\d/.test(match[2]);
    let top = stack[stack.length - 1];

    if (indent >= top.indent + 2 && top.list.items.length > 0) {
      const child: ListNode = {
        ordered: isOrdered,
        start: isOrdered ? parseInt(match[2], 10) : 1,
        items: [],
      };
      top.list.items[top.list.items.length - 1].children.push(child);
      stack.push({ indent, list: child });
      top = stack[stack.length - 1];
    } else {
      while (stack.length > 1 && indent < stack[stack.length - 1].indent) stack.pop();
      top = stack[stack.length - 1];
    }

    // Een ander soort lijst op het hoogste niveau is een nieuwe lijst. Zo blijft
    // "2." na een losse opsomming gewoon 2 heten, dankzij `start`.
    if (top.list.ordered !== isOrdered) {
      if (stack.length === 1) break;
      stack.pop();
      top = stack[stack.length - 1];
      const sibling: ListNode = {
        ordered: isOrdered,
        start: isOrdered ? parseInt(match[2], 10) : 1,
        items: [],
      };
      top.list.items[top.list.items.length - 1].children.push(sibling);
      stack.push({ indent, list: sibling });
      top = stack[stack.length - 1];
    }

    top.list.items.push({ text: match[3], children: [] });
    i++;
  }

  return { list: root, next: i };
}

/** Maakt een half binnengekomen regel af, of verbergt hem nog even. */
function finishTail(line: string): string | null {
  if (/^\s*(#{1,6}|[-*•]|\d+[.)]|-{2}|\*{2})\s*$/.test(line)) return null;

  let tail = line.replace(/\[([^\]]*)\]\([^)]*$/, '$1');
  const bold = tail.match(/\*\*/g)?.length ?? 0;
  if (bold % 2 === 1) tail += '**';
  const code = tail.match(/`/g)?.length ?? 0;
  if (code % 2 === 1) tail += '`';
  return tail;
}

export function parseBlocks(text: string, streaming = false): Block[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n');

  if (streaming) {
    const finished = finishTail(lines[lines.length - 1]);
    if (finished === null) lines.pop();
    else lines[lines.length - 1] = finished;
  }

  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trimEnd();

    if (!line.trim()) {
      blocks.push({ kind: 'spacer' });
      i++;
      continue;
    }

    const heading = /^\s*(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push({ kind: 'heading', level: heading[1].length, text: heading[2] });
      i++;
      continue;
    }

    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      blocks.push({ kind: 'rule' });
      i++;
      continue;
    }

    // Tabel: kop plus scheidingsregel. Tijdens het streamen telt een tabel die
    // nog binnenkomt al mee, zodat de rijen niet eerst als ruwe tekst verschijnen.
    const atTail = streaming && i + 1 >= lines.length - 1;
    if (isRow(line) && (TABLE_DIVIDER.test(lines[i + 1] ?? '') || atTail)) {
      const hasDivider = TABLE_DIVIDER.test(lines[i + 1] ?? '');
      const header = splitRow(line);
      const align = hasDivider ? splitRow(lines[i + 1]).map(alignOf) : [];
      i += hasDivider ? 2 : 1;
      const rows: string[][] = [];
      while (i < lines.length && isRow(lines[i])) {
        rows.push(splitRow(lines[i]));
        i++;
      }
      blocks.push({ kind: 'table', header, align, rows });
      continue;
    }

    if (/^\s*>/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) {
        quote.push(lines[i].replace(/^\s*>\s?/, ''));
        i++;
      }
      blocks.push({ kind: 'quote', lines: quote });
      continue;
    }

    if (LIST_LINE.test(line)) {
      const { list, next } = parseList(lines, i);
      blocks.push({ kind: 'list', list });
      i = next;
      continue;
    }

    // Een regel die volledig **vet** is, leest als een kopje ("**Persona 1**").
    const wholeBold = /^\s*\*\*([^*]+)\*\*:?\s*$/.exec(line);
    if (wholeBold) {
      blocks.push({ kind: 'label', text: wholeBold[1] });
      i++;
      continue;
    }

    blocks.push({ kind: 'paragraph', text: line });
    i++;
  }

  return blocks;
}

/** Vet, `code`, links en cursief binnen één regel; split hierop houdt de stukken. */
export const INLINE_TOKENS =
  /(\*\*.+?\*\*|`[^`]+`|\[[^\]]+\]\((?:https?:\/\/|mailto:)[^\s)]+\)|https?:\/\/[^\s<>)\]]+|\*(?=[^*\s])[^*]*[^*\s]\*|(?<![\p{L}\p{N}_])_(?=[^_\s])[^_]*[^_\s]_(?![\p{L}\p{N}_]))/gu;


/** Een stuk tekst met de opmaak die erbij hoort, voor een document. */
export interface InlineRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  link?: string;
}

/** Leest één regel als stukken met opmaak, met dezelfde regels als het scherm. */
export function inlineRuns(text: string, inherit: Omit<InlineRun, 'text'> = {}): InlineRun[] {
  const runs: InlineRun[] = [];
  for (const part of text.split(INLINE_TOKENS).filter((p) => p)) {
    const bold = /^\*\*([\s\S]+)\*\*$/.exec(part);
    if (bold) {
      runs.push(...inlineRuns(bold[1], { ...inherit, bold: true }));
      continue;
    }
    const code = /^`([^`]+)`$/.exec(part);
    if (code) {
      runs.push({ ...inherit, text: code[1], code: true });
      continue;
    }
    const link = /^\[([^\]]+)\]\(((?:https?:\/\/|mailto:)[^\s)]+)\)$/.exec(part);
    if (link) {
      runs.push(...inlineRuns(link[1], { ...inherit, link: link[2] }));
      continue;
    }
    if (/^https?:\/\//.test(part)) {
      const url = part.replace(/[.,;:!?]+$/, '');
      runs.push({ ...inherit, text: url, link: url });
      if (part.length > url.length) runs.push({ ...inherit, text: part.slice(url.length) });
      continue;
    }
    const italic = /^\*([^*]+)\*$/.exec(part) ?? /^_([^_]+)_$/.exec(part);
    if (italic) {
      runs.push({ ...inherit, text: italic[1], italic: true });
      continue;
    }
    runs.push({ ...inherit, text: part });
  }
  return runs;
}

/** De kale tekst van een regel, zonder sterretjes en linkhaken (voor Excel). */
export function plainInline(text: string): string {
  return inlineRuns(text)
    .map((r) => r.text)
    .join('');
}
