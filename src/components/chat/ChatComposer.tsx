import { useRef, useState, type ReactNode } from 'react';
import { Loader2, Paperclip, Scissors, Send, Square, X } from 'lucide-react';
import clsx from 'clsx';
import { ACCEPTED_DOC_ACCEPT } from '@/lib/extractDocument';
import { MAX_CHAT_ATTACHMENTS } from './useChatController';
import type { ChatAttachment } from '@/types';

/**
 * Invoerbalk van de chat: tekstveld (Enter = verzenden, Shift+Enter = nieuwe
 * regel), bijlagen (paperclip + chips) en de stop-knop tijdens het streamen.
 */
export default function ChatComposer({
  disabled,
  streaming,
  extracting,
  attachments,
  onSend,
  onStop,
  onAddFile,
  onRemoveAttachment,
  badge,
}: {
  /** Volledig uitgeschakeld (bijv. chat uitgezet of geen AI-service). */
  disabled: boolean;
  streaming: boolean;
  extracting: boolean;
  attachments: ChatAttachment[];
  onSend: (text: string) => void;
  onStop: () => void;
  onAddFile: (file: File) => void;
  onRemoveAttachment: (id: string) => void;
  /** De modelbadge, rechtsonder in de chat weergegeven. */
  badge?: ReactNode;
}) {
  const [text, setText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canSend = !disabled && !streaming && text.trim().length > 0;

  function submit() {
    if (!canSend) return;
    const value = text.trim();
    setText('');
    onSend(value);
  }

  return (
    <div className="border-t border-slate-200 px-4 pb-3 pt-3 dark:border-slate-700 sm:px-6">
      {attachments.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {attachments.map((a, i) => (
            <span
              key={a.id}
              className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-300"
              title={`Bijlage ${i + 1}: ${a.name} — ${a.chars.toLocaleString('nl-NL')} tekens`}
            >
              <Paperclip size={12} className="shrink-0" />
              <span className="truncate">{a.name}</span>
              <span className="shrink-0 text-slate-400">
                {a.chars.toLocaleString('nl-NL')} tekens
              </span>
              {a.truncated && (
                <span
                  className="inline-flex shrink-0 items-center gap-0.5 text-amber-600 dark:text-amber-400"
                  title="De tekst is ingekort tot de bijlagelimiet"
                >
                  <Scissors size={11} /> ingekort
                </span>
              )}
              <button
                type="button"
                className="shrink-0 rounded-full p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-300"
                onClick={() => onRemoveAttachment(a.id)}
                aria-label={`Verwijder bijlage ${a.name}`}
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        <button
          type="button"
          className="opl-btn-ghost shrink-0 !px-2.5"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || streaming || extracting || attachments.length >= MAX_CHAT_ATTACHMENTS}
          title={
            attachments.length >= MAX_CHAT_ATTACHMENTS
              ? `Maximaal ${MAX_CHAT_ATTACHMENTS} bijlagen per gesprek`
              : 'Document toevoegen (PDF, Word, tekst — max. 10 MB)'
          }
          aria-label="Document toevoegen"
        >
          {extracting ? <Loader2 size={18} className="animate-spin" /> : <Paperclip size={18} />}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_DOC_ACCEPT}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onAddFile(file);
            e.target.value = '';
          }}
        />

        <textarea
          className="opl-input max-h-40 min-h-[2.75rem] flex-1 resize-none py-2.5"
          rows={1}
          placeholder={disabled ? 'Chat wordt geladen…' : 'Stel je vraag…'}
          value={text}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // Enter verzendt; Shift+Enter maakt een nieuwe regel.
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />

        {streaming ? (
          <button
            type="button"
            className="opl-btn-secondary shrink-0"
            onClick={onStop}
            aria-label="Stop het antwoord"
          >
            <Square size={16} /> Stop
          </button>
        ) : (
          <button
            type="button"
            className={clsx('opl-btn-primary shrink-0', !canSend && 'opacity-50')}
            onClick={submit}
            disabled={!canSend}
            aria-label="Verstuur"
          >
            <Send size={16} /> Verstuur
          </button>
        )}
      </div>

      <div className="mt-1.5 flex items-center justify-between gap-2">
        <p className="min-w-0 text-[11px] text-slate-400 dark:text-slate-500">
          <span className="hidden sm:inline">Enter = verzenden · Shift+Enter = nieuwe regel · </span>
          max. {MAX_CHAT_ATTACHMENTS} bijlagen, 10&nbsp;MB per stuk
        </p>
        <span className="shrink-0">{badge}</span>
      </div>
    </div>
  );
}
