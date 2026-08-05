import { memo, useEffect, useRef } from 'react';
import { AlertTriangle, Lightbulb, RotateCcw, Save, Wand2, X } from 'lucide-react';
import clsx from 'clsx';
import RichText from '@/components/optimizer/RichText';
import CopyMessageButton from './CopyMessageButton';
import { PROVIDER_LABELS } from '@/config/aiModels';
import type { AiProvider } from '@/config/aiModels';
import type { ChatMessage } from '@/types';

/**
 * De berichtenlijst van de chat. Elke rij is gememoïseerd: tijdens het streamen
 * verandert alleen het laatste bericht, dus alleen die rij rendert opnieuw.
 */
export default function ChatMessageList({
  messages,
  streaming,
  expectedProvider,
  onRetry,
  onImprove,
  onSaveAsPrompt,
  nudgeMessageId,
  onNudgeDismiss,
}: {
  messages: ChatMessage[];
  streaming: boolean;
  /** De provider die volgens de instellingen zou moeten antwoorden. */
  expectedProvider: AiProvider;
  onRetry: () => void;
  /**
   * "Verbeter in generator" op eigen berichten (omgekeerde handoff). Niet
   * meegegeven (bijv. in de Testkamer — je bent daar al in de generator) =
   * geen actie zichtbaar.
   */
  onImprove?: (text: string) => void;
  /** "Bewaar als prompt": sla een eigen bericht op in de bibliotheek. */
  onSaveAsPrompt?: (text: string) => void;
  /** Onder dit eigen bericht staat de bouw-een-prompt-tip (zie ChatPage). */
  nudgeMessageId?: string | null;
  onNudgeDismiss?: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Automatisch naar beneden scrollen zodra er tekst bij komt (ook tijdens het
  // streamen): de nieuwste regel blijft in beeld.
  const last = messages[messages.length - 1];
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, last?.content]);

  // flex-auto (niet flex-1): de lijst houdt zijn inhoudshoogte zolang de kaart
  // nog groeit, en krimpt pas — met interne scroll — zodra het hoogteplafond
  // van de kaart is bereikt.
  return (
    <div
      ref={scrollRef}
      className="min-h-0 flex-auto space-y-4 overflow-y-auto px-4 py-4 sm:px-6"
      aria-live="polite"
      aria-busy={streaming}
    >
      {messages.map((message, i) => (
        <ChatMessageRow
          key={message.id}
          message={message}
          isStreaming={streaming && i === messages.length - 1 && message.role === 'assistant'}
          expectedProvider={expectedProvider}
          onRetry={onRetry}
          canRetry={!streaming && i === messages.length - 1}
          onImprove={onImprove}
          onSaveAsPrompt={onSaveAsPrompt}
          showNudge={message.id === nudgeMessageId}
          onNudgeDismiss={onNudgeDismiss}
        />
      ))}
    </div>
  );
}

const ChatMessageRow = memo(function ChatMessageRow({
  message,
  isStreaming,
  expectedProvider,
  onRetry,
  canRetry,
  onImprove,
  onSaveAsPrompt,
  showNudge,
  onNudgeDismiss,
}: {
  message: ChatMessage;
  isStreaming: boolean;
  expectedProvider: AiProvider;
  onRetry: () => void;
  canRetry: boolean;
  onImprove?: (text: string) => void;
  onSaveAsPrompt?: (text: string) => void;
  showNudge?: boolean;
  onNudgeDismiss?: () => void;
}) {
  if (message.role === 'user') {
    return (
      <div className="group flex flex-col items-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-rijksblauw-50 px-4 py-2.5 text-sm text-slate-900 dark:bg-rijksblauw-500/15 dark:text-slate-100">
          {message.content}
        </div>

        {/* Acties onder het eigen bericht. Kopiëren staat er altijd (ook op
            aanraakschermen, waar hover niet bestaat); de zwaardere acties
            verschijnen pas bij hover of toetsenbordfocus, zodat het gesprek
            rustig blijft. */}
        {message.content.trim() && (
          <div className="mt-1 flex items-center gap-3">
            <CopyMessageButton text={message.content} label="" />
            {(onImprove || onSaveAsPrompt) && (
              <span className="flex gap-3 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                {onImprove && (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 hover:text-rijksblauw-600 dark:text-slate-500 dark:hover:text-rijksblauw-300"
                    onClick={() => onImprove(message.content)}
                    title="Maak hier in de generator een sterkere, herbruikbare prompt van"
                  >
                    <Wand2 size={12} /> Verbeter in generator
                  </button>
                )}
                {onSaveAsPrompt && (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 hover:text-rijksblauw-600 dark:text-slate-500 dark:hover:text-rijksblauw-300"
                    onClick={() => onSaveAsPrompt(message.content)}
                    title="Sla dit bericht op als prompt in de bibliotheek"
                  >
                    <Save size={12} /> Bewaar als prompt
                  </button>
                )}
              </span>
            )}
          </div>
        )}

        {/* De bouw-een-prompt-tip: dit bericht leek een opdracht zonder
            structuur (zie looksLikeMessyPrompt). Subtiel, en definitief weg te
            klikken. */}
        {showNudge && onImprove && (
          <div className="mt-1.5 flex max-w-[85%] items-center gap-2 rounded-lg border border-rijksblauw-200 bg-rijksblauw-50/60 px-3 py-2 text-xs text-slate-600 dark:border-rijksblauw-500/30 dark:bg-rijksblauw-500/10 dark:text-slate-300">
            <Lightbulb size={14} className="shrink-0 text-rijksoranje" />
            <span>
              Tip: dit lijkt op een opdracht. In de generator bouw je er een sterkere, herbruikbare
              prompt van.
            </span>
            <button
              type="button"
              className="shrink-0 font-medium text-rijksblauw-600 hover:underline dark:text-rijksblauw-300"
              onClick={() => onImprove(message.content)}
            >
              Bouw in generator
            </button>
            {onNudgeDismiss && (
              <button
                type="button"
                className="shrink-0 rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-300"
                onClick={onNudgeDismiss}
                aria-label="Verberg deze tip voortaan"
                title="Verberg deze tip voortaan"
              >
                <X size={12} />
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  const fallbackProvider =
    message.provider && message.provider !== expectedProvider ? message.provider : null;

  return (
    <div className="flex flex-col items-start gap-1.5">
      <div
        className={clsx(
          'max-w-full text-sm text-slate-700 dark:text-slate-200',
          message.error && !message.content && 'text-rijksrood dark:text-red-400',
        )}
      >
        {message.content ? (
          <RichText text={message.content} />
        ) : isStreaming ? (
          <span className="text-slate-400 dark:text-slate-500">Aan het nadenken…</span>
        ) : null}
        {isStreaming && (
          <span
            className="ml-0.5 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-rijksblauw-500 align-text-bottom"
            aria-hidden="true"
          />
        )}
      </div>

      {/* Kopieerknop onder het antwoord: dit is de tekst waar de gebruiker voor
          kwam, dus die moet in één klik mee naar een document of e-mail. Pas
          zichtbaar zodra het antwoord af is — halverwege kopiëren levert een
          afgekapte tekst op. */}
      {!isStreaming && message.content.trim() && (
        <CopyMessageButton text={message.content} label="Kopieer antwoord" className="-ml-1.5" />
      )}

      {message.stopped && (
        <p className="text-[11px] text-slate-400 dark:text-slate-500">Gestopt door jou.</p>
      )}

      {fallbackProvider && !message.error && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400">
          Tijdelijk beantwoord via {PROVIDER_LABELS[fallbackProvider] ?? fallbackProvider} (fallback).
        </p>
      )}

      {message.error && (
        <div className="flex items-center gap-2 text-xs text-rijksrood dark:text-red-400">
          <AlertTriangle size={14} />
          <span>{message.error}</span>
          {canRetry && (
            <button
              type="button"
              className="inline-flex items-center gap-1 font-medium text-rijksblauw-700 hover:underline dark:text-rijksblauw-200"
              onClick={onRetry}
            >
              <RotateCcw size={12} /> Opnieuw proberen
            </button>
          )}
        </div>
      )}
    </div>
  );
});
