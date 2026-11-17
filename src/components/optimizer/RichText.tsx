import { Fragment, memo, type ReactNode } from 'react';
import clsx from 'clsx';
import { INLINE_TOKENS, parseBlocks, type Block, type ListNode } from '@/lib/markdownBlocks';

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
          // Past hij niet, dan schuift de tabel. Dat moet ook met het toetsenbord kunnen.
          tabIndex={0}
          role="region"
          aria-label="Tabel"
          className="overflow-x-auto rounded-lg border border-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-rijksblauw-500 dark:border-slate-700"
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
