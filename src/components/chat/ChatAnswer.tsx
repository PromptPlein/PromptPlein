import { useMemo } from 'react';
import RichText from '@/components/optimizer/RichText';
import { splitAnswer } from '@/lib/chatFiles';
import ChatFileCard from './ChatFileCard';
import CopyMessageButton from './CopyMessageButton';

/**
 * Een antwoord van de chat: gewone tekst via RichText, een HTML-pagina als
 * bestand (ChatFileCard) en ander code als blok met vaste letterbreedte. Zonder
 * deze splitsing werd een codeblok honderden losse alinea's, en een regel CSS
 * die met een streepje begint een opsommingsteken.
 */
export default function ChatAnswer({ text, isStreaming }: { text: string; isStreaming: boolean }) {
  const segments = useMemo(() => splitAnswer(text), [text]);

  return (
    <>
      {segments.map((segment, i) => {
        if (segment.kind === 'text') return <RichText key={i} text={segment.text} />;
        if (segment.isHtmlFile) {
          return (
            <ChatFileCard
              key={i}
              code={segment.code}
              closed={segment.closed}
              isStreaming={isStreaming}
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
            <pre className="max-h-96 overflow-auto bg-slate-950 px-3 py-2.5 font-mono text-[12px] leading-relaxed text-slate-200">
              {segment.code}
            </pre>
          </div>
        );
      })}
    </>
  );
}
