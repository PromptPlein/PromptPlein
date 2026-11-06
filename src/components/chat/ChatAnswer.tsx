import { useMemo } from 'react';
import { AlertTriangle, ShieldCheck } from '@/components/common/icons';
import RichText from '@/components/optimizer/RichText';
import { splitAnswer } from '@/lib/chatFiles';
import { checkCode } from '@/lib/fileCheck';
import ChatFileCard from './ChatFileCard';
import CopyMessageButton from './CopyMessageButton';

/**
 * Een antwoord van de chat: gewone tekst via RichText, een HTML-pagina als
 * bestand (ChatFileCard) en ander code als blok met vaste letterbreedte. Zonder
 * deze splitsing werd een codeblok honderden losse alinea's, en een regel CSS
 * die met een streepje begint een opsommingsteken.
 */
export default function ChatAnswer({
  text,
  isStreaming,
  onRepair,
}: {
  text: string;
  isStreaming: boolean;
  /** Zie ChatFileCard: de gevonden fouten als nieuw bericht naar de AI. */
  onRepair?: (text: string) => void;
}) {
  const segments = useMemo(() => splitAnswer(text), [text]);

  return (
    <>
      {segments.map((segment, i) => {
        if (segment.kind === 'text') {
          const live = isStreaming && i === segments.length - 1;
          return (
            <RichText
              key={i}
              text={segment.text}
              variant="chat"
              streaming={live}
              trailing={live ? <WritingCursor /> : null}
            />
          );
        }
        if (segment.isHtmlFile) {
          return (
            <ChatFileCard
              key={i}
              code={segment.code}
              closed={segment.closed}
              isStreaming={isStreaming}
              onRepair={onRepair}
            />
          );
        }
        return (
          <div
            key={i}
            className="my-2 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700"
          >
            <div className="flex items-center justify-between bg-slate-50 px-3 py-1 text-[11px] text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
              <span>{segment.lang || 'code'}</span>
              {segment.closed && <CopyMessageButton text={segment.code} label="Kopieer" />}
            </div>
            <pre className="max-h-96 overflow-auto bg-slate-950 px-3 py-2.5 font-mono text-[13px] leading-relaxed text-slate-200">
              {segment.code}
            </pre>
            {segment.closed && <CodeCheck lang={segment.lang} code={segment.code} />}
          </div>
        );
      })}
    </>
  );
}

/** Staat direct achter de laatste letter, dus het oog hoeft niet te zoeken. */
function WritingCursor() {
  return (
    <span
      className="ml-0.5 inline-block h-[1em] w-1.5 animate-pulse rounded-sm bg-rijksblauw-500 align-text-bottom"
      aria-hidden="true"
    />
  );
}

/** De snelle controle onder een codeblok (JSON, JavaScript, SVG), als die er is. */
function CodeCheck({ lang, code }: { lang: string; code: string }) {
  const result = useMemo(() => checkCode(lang, code), [lang, code]);
  if (!result) return null;
  return (
    <p
      className={
        result.ok
          ? 'flex items-center gap-1.5 bg-slate-50 px-3 py-1 text-[11px] text-emerald-700 dark:bg-slate-800/60 dark:text-emerald-400'
          : 'flex items-center gap-1.5 bg-red-50 px-3 py-1 text-[11px] text-rijksrood dark:bg-red-500/10 dark:text-red-400'
      }
    >
      {result.ok ? <ShieldCheck size={12} /> : <AlertTriangle size={12} />}
      {result.ok
        ? 'Gecontroleerd: geen fouten gevonden.'
        : `Fout${result.problems[0].line ? ` op regel ${result.problems[0].line}` : ''}: ${result.problems[0].message}`}
    </p>
  );
}
