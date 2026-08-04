import { memo, useEffect, useRef } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import clsx from 'clsx';
import RichText from '@/components/optimizer/RichText';
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
}: {
  messages: ChatMessage[];
  streaming: boolean;
  /** De provider die volgens de instellingen zou moeten antwoorden. */
  expectedProvider: AiProvider;
  onRetry: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Automatisch naar beneden scrollen zodra er tekst bij komt (ook tijdens het
  // streamen): de nieuwste regel blijft in beeld.
  const last = messages[messages.length - 1];
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, last?.content]);

  return (
    <div
      ref={scrollRef}
      className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6"
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
}: {
  message: ChatMessage;
  isStreaming: boolean;
  expectedProvider: AiProvider;
  onRetry: () => void;
  canRetry: boolean;
}) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-rijksblauw-50 px-4 py-2.5 text-sm text-slate-900 dark:bg-rijksblauw-500/15 dark:text-slate-100">
          {message.content}
        </div>
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
