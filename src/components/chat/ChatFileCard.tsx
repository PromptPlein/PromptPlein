import { useMemo, useRef, useState } from 'react';
import { Check, Code2, Download, Eye, EyeOff, FileCode2, Loader2, Maximize2 } from 'lucide-react';
import { downloadText } from '@/lib/download';
import { htmlFileName, htmlLooksComplete } from '@/lib/chatFiles';
import CopyMessageButton from './CopyMessageButton';

/** Zoveel regels van het eind van het bestand staan in beeld terwijl het groeit. */
const TAIL_LINES = 12;

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toLocaleString('nl-NL', { maximumFractionDigits: 1 })} kB`;
}

/**
 * Een HTML-pagina uit een chatantwoord, getoond als bestand. Terwijl het model
 * schrijft, zie je de grootte oplopen en de laatste regels voorbijkomen; zodra
 * het af is, kun je het bestand bekijken en downloaden.
 *
 * Het voorbeeld draait in een iframe met `sandbox="allow-scripts"` en zonder
 * allow-same-origin: de pagina is door een model geschreven en mag dus wel
 * zijn eigen script draaien, maar niet bij de opslag van PromptPlein (de chats,
 * de inlogsessie). Om dezelfde reden geen "open in nieuw tabblad" via een
 * blob-URL: die zou wél de herkomst van de app krijgen.
 */
export default function ChatFileCard({
  code,
  closed,
  isStreaming,
}: {
  code: string;
  /** Het codeblok is afgesloten door het model. */
  closed: boolean;
  /** Het bericht waar dit bestand in staat, wordt nog geschreven. */
  isStreaming: boolean;
}) {
  const [preview, setPreview] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);

  const writing = isStreaming && !closed;
  const complete = closed || htmlLooksComplete(code);
  const name = useMemo(() => htmlFileName(code), [code]);
  const bytes = useMemo(() => new TextEncoder().encode(code).length, [code]);
  const lineCount = useMemo(() => code.split('\n').length, [code]);
  const tail = writing ? code.split('\n').slice(-TAIL_LINES).join('\n') : '';

  const status = writing ? 'Wordt geschreven' : complete ? 'Klaar' : 'Niet af';

  return (
    <div className="my-2 w-full overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3.5 py-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rijksblauw-50 text-rijksblauw-600 dark:bg-rijksblauw-500/15 dark:text-rijksblauw-300">
          <FileCode2 size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100" title={name}>
            {name}
          </p>
          <p className="flex items-center gap-1.5 text-xs tabular-nums text-slate-500 dark:text-slate-400">
            {writing ? (
              <Loader2 size={12} className="animate-spin text-rijksblauw-500" aria-hidden="true" />
            ) : complete ? (
              <Check size={12} className="text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            ) : null}
            <span>{status}</span>
            <span aria-hidden="true">·</span>
            <span>{formatSize(bytes)}</span>
            <span aria-hidden="true">·</span>
            <span>
              {lineCount.toLocaleString('nl-NL')} {lineCount === 1 ? 'regel' : 'regels'}
            </span>
          </p>
        </div>

        {!writing && (
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              className="opl-btn-secondary !px-2.5 !py-1.5 text-xs"
              onClick={() => setPreview((v) => !v)}
              aria-expanded={preview}
            >
              {preview ? <EyeOff size={14} /> : <Eye size={14} />}
              {preview ? 'Verberg voorbeeld' : 'Bekijk'}
            </button>
            <button
              type="button"
              className="opl-btn-primary !px-2.5 !py-1.5 text-xs"
              onClick={() => downloadText(name, code, 'text/html')}
              title={complete ? undefined : 'Het bestand is nog niet af; je downloadt wat er nu staat'}
            >
              <Download size={14} /> Download
            </button>
          </div>
        )}
      </div>

      {/* Terwijl het model schrijft: de laatste regels, zodat je ziet dat het
          bestand groeit. De hoogte staat vast, dus de chat springt niet mee. */}
      {writing && (
        <pre
          className="h-56 overflow-hidden whitespace-pre-wrap break-all border-t border-slate-200 bg-slate-950 px-3.5 py-2.5 font-mono text-[11px] leading-relaxed text-slate-300 dark:border-slate-700"
          aria-hidden="true"
        >
          {tail}
        </pre>
      )}

      {!writing && preview && (
        <div className="border-t border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between gap-2 bg-slate-50 px-3.5 py-1.5 text-[11px] text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
            <span>Voorbeeld. Scripts draaien afgeschermd van PromptPlein.</span>
            <button
              type="button"
              className="inline-flex items-center gap-1 font-medium text-rijksblauw-600 hover:underline dark:text-rijksblauw-300"
              onClick={() => void frameRef.current?.requestFullscreen?.()}
            >
              <Maximize2 size={12} /> Volledig scherm
            </button>
          </div>
          <iframe
            ref={frameRef}
            title={`Voorbeeld van ${name}`}
            srcDoc={code}
            sandbox="allow-scripts"
            allow="fullscreen"
            allowFullScreen
            className="block h-[70vh] w-full bg-white"
          />
        </div>
      )}

      {!writing && (
        <div className="flex items-center gap-3 border-t border-slate-200 px-3.5 py-1.5 dark:border-slate-700">
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-slate-400 hover:bg-slate-100 hover:text-rijksblauw-600 dark:text-slate-500 dark:hover:bg-slate-700 dark:hover:text-rijksblauw-300"
            onClick={() => setShowCode((v) => !v)}
            aria-expanded={showCode}
          >
            <Code2 size={12} /> {showCode ? 'Verberg code' : 'Toon code'}
          </button>
          <CopyMessageButton text={code} label="Kopieer code" />
        </div>
      )}
      {!writing && showCode && (
        <pre className="max-h-96 overflow-auto border-t border-slate-200 bg-slate-950 px-3.5 py-2.5 font-mono text-[11px] leading-relaxed text-slate-300 dark:border-slate-700">
          {code}
        </pre>
      )}
    </div>
  );
}
