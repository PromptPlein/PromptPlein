import { Fragment, type ReactNode } from 'react';
import clsx from 'clsx';

/**
 * Lichtgewicht renderer voor de eenvoudige markdown die de AI in materiaal- en
 * resultaatteksten teruggeeft: **vet**, *cursief*, `code`, koppen (#) en bullets
 * (-, *, •). Bewust géén markdown-library en géén `dangerouslySetInnerHTML` —
 * we bouwen React-elementen, dus XSS-veilig. Zo tonen we "**Persona 1**" als een
 * echte vette kop i.p.v. de ruwe sterretjes.
 */
export default function RichText({ text, className }: { text: string; className?: string }) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');

  const blocks: ReactNode[] = [];
  let bullets: string[] = [];

  const flushBullets = (key: string) => {
    if (bullets.length === 0) return;
    const items = bullets;
    bullets = [];
    blocks.push(
      <ul key={key} className="my-1 list-disc space-y-0.5 pl-5">
        {items.map((b, i) => (
          <li key={i}>{renderInline(b)}</li>
        ))}
      </ul>,
    );
  };

  lines.forEach((raw, idx) => {
    const line = raw.trimEnd();
    const key = `l${idx}`;

    // Lege regel → witruimte tussen blokken.
    if (!line.trim()) {
      flushBullets(`${key}-b`);
      blocks.push(<div key={key} className="h-2" aria-hidden="true" />);
      return;
    }

    // Kop: één of meer #.
    const heading = line.match(/^\s*(#{1,6})\s+(.*)$/);
    if (heading) {
      flushBullets(`${key}-b`);
      blocks.push(
        <p key={key} className="mt-1 font-semibold text-slate-800 dark:text-slate-100">
          {renderInline(heading[2])}
        </p>,
      );
      return;
    }

    // Bullet: -, *, • of een genummerde regel (1. …) wordt een lijst-item.
    const bullet = line.match(/^\s*(?:[-*•]|\d+\.)\s+(.*)$/);
    if (bullet) {
      bullets.push(bullet[1]);
      return;
    }

    // Een regel die volledig **vet** is → als kopje tonen (bijv. "**Persona 1**").
    const wholeBold = line.match(/^\s*\*\*(.+?)\*\*\s*$/);
    if (wholeBold) {
      flushBullets(`${key}-b`);
      blocks.push(
        <p key={key} className="mt-1 font-semibold text-slate-800 dark:text-slate-100">
          {renderInline(wholeBold[1])}
        </p>,
      );
      return;
    }

    // Gewone alinea.
    flushBullets(`${key}-b`);
    blocks.push(
      <p key={key} className="leading-relaxed">
        {renderInline(line)}
      </p>,
    );
  });
  flushBullets('end');

  return <div className={clsx('space-y-0.5 text-sm text-slate-700 dark:text-slate-200', className)}>{blocks}</div>;
}

/**
 * Rendert inline-opmaak binnen één regel: vet, cursief en inline-code.
 * Verwerkt tokens los zodat geneste sterretjes niet blijven staan.
 */
function renderInline(text: string): ReactNode {
  // Splits op de opmaak-tokens en houd de scheidingstekens vast om te kunnen stylen.
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_|`[^`]+`)/g).filter((p) => p !== '');
  return parts.map((part, i) => {
    const bold = part.match(/^\*\*([\s\S]+)\*\*$/);
    if (bold) return <strong key={i}>{bold[1]}</strong>;
    const italic = part.match(/^\*([^*]+)\*$/) || part.match(/^_([^_]+)_$/);
    if (italic) return <em key={i}>{italic[1]}</em>;
    const code = part.match(/^`([^`]+)`$/);
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
    return <Fragment key={i}>{part}</Fragment>;
  });
}
