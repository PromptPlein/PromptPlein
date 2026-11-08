import { memo, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Lightweight renderer for the markdown the AI returns: headings, bold, italic,
 * `code`, links, numbered and nested lists, tables, quotes and rules. No
 * markdown library: the parser builds plain semantic HTML, with every piece of
 * text escaped and only http(s) and mailto links, and nldd-rich-text styles it.
 *
 * `variant="chat"` is the reading mode of the chat (the default spacing of the
 * rich text); the compact mode for small panels in the builder spaces tighter.
 *
 * While streaming (`streaming`) the last line is often unfinished. It is shown
 * as if it were finished, so no loose asterisks appear and the text does not
 * jump once the closing marker arrives.
 */

interface ListNode {
  ordered: boolean;
  start: number;
  items: { text: string; children: ListNode[] }[];
}

type Align = 'left' | 'center' | 'right' | undefined;

type Block =
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

function parseBlocks(text: string, streaming: boolean): Block[] {
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

const INLINE_TOKENS =
  /(\*\*.+?\*\*|`[^`]+`|\[[^\]]+\]\((?:https?:\/\/|mailto:)[^\s)]+\)|https?:\/\/[^\s<>)\]]+|\*(?=[^*\s])[^*]*[^*\s]\*|(?<![\p{L}\p{N}_])_(?=[^_\s])[^_]*[^_\s]_(?![\p{L}\p{N}_]))/gu;

/** Marks where `trailing` goes: right after the last letter. */
const TRAILING_ATTR = 'data-rich-text-trailing';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** One element as markup. Attribute values are escaped; `inner` is markup already. */
function el(name: string, inner: string, attrs: Record<string, string | number | undefined> = {}): string {
  const attrText = Object.entries(attrs)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => ` ${k}="${escapeHtml(String(v))}"`)
    .join('');
  return `<${name}${attrText}>${inner}</${name}>`;
}

/** An element without content or end tag, such as hr. */
function voidEl(name: string): string {
  return `<${name}>`;
}

function link(href: string, inner: string): string {
  return el('a', inner, { href, target: '_blank', rel: 'noreferrer noopener' });
}

/** Bold, italic, inline code and links within one line. Bold may hold italic. */
function renderInline(text: string): string {
  const parts = text.split(INLINE_TOKENS).filter((part) => part);
  return parts
    .map((part) => {
      const bold = /^\*\*([\s\S]+)\*\*$/.exec(part);
      if (bold) return el('strong', renderInline(bold[1]));

      const code = /^`([^`]+)`$/.exec(part);
      if (code) return el('code', escapeHtml(code[1]));

      const anchor = /^\[([^\]]+)\]\(((?:https?:\/\/|mailto:)[^\s)]+)\)$/.exec(part);
      if (anchor) return link(anchor[2], renderInline(anchor[1]));

      if (/^https?:\/\//.test(part)) {
        // A punctuation mark after a bare link belongs to the sentence, not the address.
        const url = part.replace(/[.,;:!?]+$/, '');
        return link(url, escapeHtml(url)) + escapeHtml(part.slice(url.length));
      }

      const italic = /^\*([^*]+)\*$/.exec(part) ?? /^_([^_]+)_$/.exec(part);
      if (italic) return el('em', escapeHtml(italic[1]));

      return escapeHtml(part);
    })
    .join('');
}

function renderList(list: ListNode, trailing: string): string {
  const items = list.items
    .map((item, i) => {
      const last = i === list.items.length - 1;
      const children = item.children
        .map((child, c) => renderList(child, last && c === item.children.length - 1 ? trailing : ''))
        .join('');
      return el('li', renderInline(item.text) + (last && item.children.length === 0 ? trailing : '') + children);
    })
    .join('');
  return list.ordered
    ? el('ol', items, { start: list.start !== 1 ? list.start : undefined })
    : el('ul', items);
}

function renderBlock(block: Block, trailing: string): string {
  switch (block.kind) {
    case 'spacer':
      // The rich text sets the rhythm between blocks itself.
      return '';
    case 'rule':
      return voidEl('hr');
    case 'heading':
      // The page has its own h1 and an h2 per message, so headings from the
      // answer start at h3. The structure holds for whoever navigates by heading.
      return el(`h${Math.min(block.level + 2, 6)}`, renderInline(block.text) + trailing);
    case 'label':
      return el('p', el('strong', renderInline(block.text)) + trailing);
    case 'paragraph':
      return el('p', renderInline(block.text) + trailing);
    case 'quote':
      return el('blockquote', block.lines.map((line) => el('p', renderInline(line))).join('') + trailing);
    case 'list':
      return renderList(block.list, trailing);
    case 'table': {
      const head = el('thead', el('tr', block.header.map((cell) => el('th', renderInline(cell), { scope: 'col' })).join('')));
      const rows = block.rows
        .map((row) => el('tr', block.header.map((_, c) => el('td', renderInline(row[c] ?? ''))).join('')))
        .join('');
      return el('table', head + el('tbody', rows));
    }
  }
}

/** Keeps `trailing` out of a block that renders nothing. */
function lastVisibleIndex(blocks: Block[]): number {
  for (let i = blocks.length - 1; i >= 0; i--) {
    if (blocks[i].kind !== 'spacer') return i;
  }
  return -1;
}

const RichText = memo(function RichText({
  text,
  variant = 'compact',
  streaming = false,
  trailing = null,
}: {
  text: string;
  /** Kept for callers; the rich text sets its own typography. */
  className?: string;
  variant?: 'compact' | 'chat';
  /** De tekst komt nog binnen: de laatste regel kan half zijn. */
  streaming?: boolean;
  /** Komt direct achter de laatste letter te staan (de schrijfcursor). */
  trailing?: ReactNode;
}) {
  const chat = variant === 'chat';
  const hasTrailing = trailing !== null && trailing !== undefined && trailing !== false;
  const html = useMemo(() => {
    const blocks = parseBlocks(text, streaming);
    const lastIndex = lastVisibleIndex(blocks);
    const marker = el('span', '', { [TRAILING_ATTR]: '' });
    return blocks.map((block, i) => renderBlock(block, hasTrailing && i === lastIndex ? marker : '')).join('');
  }, [text, streaming, hasTrailing]);

  // `trailing` is a React node; it is portaled into the marker the markup leaves
  // for it, which is a new element each time the markup changes.
  const ref = useRef<HTMLElement>(null);
  const [slot, setSlot] = useState<Element | null>(null);
  useLayoutEffect(() => {
    setSlot(hasTrailing ? (ref.current?.querySelector(`[${TRAILING_ATTR}]`) ?? null) : null);
  }, [html, hasTrailing]);

  return (
    <>
      <nldd-rich-text ref={ref} spacing={chat ? 'snug' : 'tight'} dangerouslySetInnerHTML={{ __html: html }}></nldd-rich-text>
      {slot && hasTrailing ? createPortal(trailing, slot) : null}
    </>
  );
});

export default RichText;
