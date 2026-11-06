import { Fragment, memo, type ReactNode } from 'react';
import clsx from 'clsx';

/**
 * Lichtgewicht renderer voor de markdown die de AI teruggeeft: koppen, vet,
 * cursief, `code`, links, genummerde en geneste lijsten, tabellen, citaten en
 * scheidslijnen. Bewust géén markdown-library en géén `dangerouslySetInnerHTML`:
 * we bouwen React-elementen, dus XSS-veilig.
 *
 * `variant="chat"` is de leesstand van de chat (ruimere tekst en witruimte,
 * koppen in oplopende grootte). De standaard is de compacte stand voor kleine
 * panelen in de bouwer.
 *
 * Tijdens het streamen (`streaming`) is de laatste regel vaak nog niet af. Die
 * tonen we alsof hij al af is, anders staan er even losse sterretjes en springt
 * de tekst zodra de afsluiter binnenkomt.
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

const LINK_CLASS =
  'text-rijksblauw-700 underline underline-offset-2 hover:no-underline dark:text-rijksblauw-200';

/** Vet, cursief, inline-code en links binnen één regel. Vet mag cursief bevatten. */
function renderInline(text: string): ReactNode {
  const parts = text.split(INLINE_TOKENS).filter((part) => part);
  return parts.map((part, i) => {
    const bold = /^\*\*([\s\S]+)\*\*$/.exec(part);
    if (bold) return <strong key={i}>{renderInline(bold[1])}</strong>;

    const code = /^`([^`]+)`$/.exec(part);
    if (code) {
      return (
        <code
          key={i}
          className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.85em] text-slate-700 dark:bg-slate-800 dark:text-slate-200"
        >
          {code[1]}
        </code>
      );
    }

    const link = /^\[([^\]]+)\]\(((?:https?:\/\/|mailto:)[^\s)]+)\)$/.exec(part);
    if (link) {
      return (
        <a key={i} href={link[2]} target="_blank" rel="noreferrer noopener" className={LINK_CLASS}>
          {renderInline(link[1])}
        </a>
      );
    }

    if (/^https?:\/\//.test(part)) {
      // Een leesteken achter een kale link hoort bij de zin, niet bij het adres.
      const url = part.replace(/[.,;:!?]+$/, '');
      return (
        <Fragment key={i}>
          <a href={url} target="_blank" rel="noreferrer noopener" className={LINK_CLASS}>
            {url}
          </a>
          {part.slice(url.length)}
        </Fragment>
      );
    }

    const italic = /^\*([^*]+)\*$/.exec(part) ?? /^_([^_]+)_$/.exec(part);
    if (italic) return <em key={i}>{italic[1]}</em>;

    return <Fragment key={i}>{part}</Fragment>;
  });
}

function renderList(list: ListNode, chat: boolean, trailing: ReactNode): ReactNode {
  const Tag = list.ordered ? 'ol' : 'ul';
  return (
    <Tag
      start={list.ordered && list.start !== 1 ? list.start : undefined}
      className={clsx(
        list.ordered ? 'list-decimal' : 'list-disc',
        chat ? 'space-y-1.5 pl-6' : 'my-1 space-y-0.5 pl-5',
      )}
    >
      {list.items.map((item, i) => {
        const last = i === list.items.length - 1;
        return (
          <li key={i} className={clsx(chat && 'pl-1')}>
            {renderInline(item.text)}
            {last && item.children.length === 0 ? trailing : null}
            {item.children.map((child, c) => (
              <Fragment key={c}>
                {renderList(child, chat, last && c === item.children.length - 1 ? trailing : null)}
              </Fragment>
            ))}
          </li>
        );
      })}
    </Tag>
  );
}

const HEADING_SIZE: Record<number, string> = {
  1: 'mt-6 text-[1.3em] leading-snug',
  2: 'mt-5 text-[1.15em] leading-snug',
  3: 'mt-4 text-[1.05em] leading-snug',
};

function renderBlock(block: Block, key: number, chat: boolean, trailing: ReactNode): ReactNode {
  const strong = 'font-semibold text-slate-900 dark:text-slate-100';

  switch (block.kind) {
    case 'spacer':
      return chat ? null : <div key={key} className="h-2" aria-hidden="true" />;
    case 'rule':
      return <hr key={key} className="my-4 border-slate-200 dark:border-slate-700" />;
    case 'heading': {
      // De pagina heeft zelf h1 en per bericht h2, dus de koppen uit het antwoord
      // beginnen bij h3. Zo klopt de structuur voor wie via koppen navigeert.
      const Tag = `h${Math.min(block.level + 2, 6)}` as 'h3' | 'h4' | 'h5' | 'h6';
      return (
        <Tag
          key={key}
          className={clsx(strong, chat ? (HEADING_SIZE[block.level] ?? 'mt-3') : 'mt-1')}
        >
          {renderInline(block.text)}
          {trailing}
        </Tag>
      );
    }
    case 'label':
      return (
        <p key={key} className={clsx(strong, chat ? 'mt-4' : 'mt-1')}>
          {renderInline(block.text)}
          {trailing}
        </p>
      );
    case 'paragraph':
      return (
        <p key={key} className={chat ? undefined : 'leading-relaxed'}>
          {renderInline(block.text)}
          {trailing}
        </p>
      );
    case 'quote':
      return (
        <blockquote
          key={key}
          className="border-l-4 border-slate-300 pl-3 text-slate-600 dark:border-slate-600 dark:text-slate-300"
        >
          {block.lines.map((line, i) => (
            <p key={i}>{renderInline(line)}</p>
          ))}
          {trailing}
        </blockquote>
      );
    case 'list':
      return <Fragment key={key}>{renderList(block.list, chat, trailing)}</Fragment>;
    case 'table':
      return (
        <div
          key={key}
          className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700"
        >
          <table className="w-full border-collapse text-left text-[0.95em]">
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr>
                {block.header.map((cell, i) => (
                  <th
                    key={i}
                    scope="col"
                    style={{ textAlign: block.align[i] }}
                    className="border-b border-slate-200 px-3 py-2 font-semibold text-slate-900 dark:border-slate-700 dark:text-slate-100"
                  >
                    {renderInline(cell)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r} className="border-b border-slate-100 last:border-0 dark:border-slate-700/60">
                  {block.header.map((_, c) => (
                    <td key={c} style={{ textAlign: block.align[c] }} className="px-3 py-2 align-top">
                      {renderInline(row[c] ?? '')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

/** Voorkomt dat `trailing` in een blok belandt dat niets rendert. */
function lastVisibleIndex(blocks: Block[]): number {
  for (let i = blocks.length - 1; i >= 0; i--) {
    if (blocks[i].kind !== 'spacer') return i;
  }
  return -1;
}

const RichText = memo(function RichText({
  text,
  className,
  variant = 'compact',
  streaming = false,
  trailing = null,
}: {
  text: string;
  className?: string;
  variant?: 'compact' | 'chat';
  /** De tekst komt nog binnen: de laatste regel kan half zijn. */
  streaming?: boolean;
  /** Komt direct achter de laatste letter te staan (de schrijfcursor). */
  trailing?: ReactNode;
}) {
  const chat = variant === 'chat';
  const blocks = parseBlocks(text, streaming);
  const lastIndex = lastVisibleIndex(blocks);

  return (
    <div
      className={clsx(
        chat
          ? 'space-y-3 text-base leading-7 text-slate-800 dark:text-slate-100'
          : 'space-y-0.5 text-sm text-slate-700 dark:text-slate-200',
        className,
      )}
    >
      {blocks.map((block, i) => renderBlock(block, i, chat, i === lastIndex ? trailing : null))}
    </div>
  );
});

export default RichText;
