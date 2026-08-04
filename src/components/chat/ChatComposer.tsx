import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { GripHorizontal, Loader2, Paperclip, Scissors, Send, Square, X } from 'lucide-react';
import clsx from 'clsx';
import { ACCEPTED_DOC_ACCEPT } from '@/lib/extractDocument';
import { MAX_CHAT_ATTACHMENTS } from './useChatController';
import type { ChatAttachment } from '@/types';

/** Starthoogte van het tekstvak: ruimte voor drie regels. */
const DEFAULT_HEIGHT = 88;
/** Ondergrens bij het slepen. */
const MIN_HEIGHT = 56;
/** Bovengrens: daarboven blijft er te weinig van het gesprek zichtbaar. */
const MAX_HEIGHT = 320;
/** Stapgrootte bij bedienen met de pijltjestoetsen. */
const KEY_STEP = 24;
/** Zelfgekozen hoogte onthouden we per apparaat (los van de chatinhoud). */
const HEIGHT_KEY = 'opl.ui.chatComposerHeight';

function clampHeight(px: number): number {
  return Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, Math.round(px)));
}

function readStoredHeight(): number | null {
  try {
    const raw = localStorage.getItem(HEIGHT_KEY);
    if (!raw) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? clampHeight(value) : null;
  } catch {
    return null;
  }
}

/**
 * Invoerbalk van de chat: tekstveld (Enter = verzenden, Shift+Enter = nieuwe
 * regel), bijlagen (paperclip + chips) en de stop-knop tijdens het streamen.
 *
 * Het tekstvak begint op drie regels en groeit mee met wat je typt. Wie meer
 * ruimte wil, sleept het met de greep rechtsonder groter; die keuze blijft
 * bewaard tot je hem met een dubbelklik weer loslaat.
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Zelf ingestelde hoogte; null = automatisch meegroeien met de tekst.
  const [manualHeight, setManualHeight] = useState<number | null>(readStoredHeight);
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null);

  // Hoogte bijwerken: bij een eigen keuze precies die hoogte, anders meegroeien
  // met de inhoud tussen de start- en maximumhoogte.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    if (manualHeight !== null) {
      el.style.height = `${manualHeight}px`;
      return;
    }
    el.style.height = 'auto';
    el.style.height = `${Math.min(MAX_HEIGHT, Math.max(DEFAULT_HEIGHT, el.scrollHeight))}px`;
  }, [text, manualHeight]);

  function storeHeight(next: number | null) {
    setManualHeight(next);
    try {
      if (next === null) localStorage.removeItem(HEIGHT_KEY);
      else localStorage.setItem(HEIGHT_KEY, String(next));
    } catch {
      /* opslag niet beschikbaar — de hoogte geldt dan alleen deze sessie */
    }
  }

  function startDrag(e: React.PointerEvent<HTMLButtonElement>) {
    const el = textareaRef.current;
    if (!el) return;
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Zonder pointer-capture werkt slepen nog steeds, alleen niet meer buiten
      // de greep; geen reden om af te breken.
    }
    dragRef.current = { startY: e.clientY, startHeight: el.getBoundingClientRect().height };
  }

  function onDrag(e: React.PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    // Omlaag slepen maakt het vak groter.
    setManualHeight(clampHeight(drag.startHeight + (e.clientY - drag.startY)));
  }

  function endDrag(e: React.PointerEvent<HTMLButtonElement>) {
    if (!dragRef.current) return;
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* nooit vastgelegd — niets vrij te geven */
    }
    if (manualHeight !== null) storeHeight(manualHeight);
  }

  function resizeByKey(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const current = manualHeight ?? textareaRef.current?.getBoundingClientRect().height ?? DEFAULT_HEIGHT;
    storeHeight(clampHeight(current + (e.key === 'ArrowDown' ? KEY_STEP : -KEY_STEP)));
  }

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

        <div className="relative flex-1">
          <textarea
            ref={textareaRef}
            className="opl-input w-full resize-none py-2.5 pb-6"
            rows={3}
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
          {/* Greep om het tekstvak zelf groter te slepen. Dubbelklikken zet hem
              terug op automatisch meegroeien. */}
          <button
            type="button"
            className="absolute bottom-1 right-1 flex h-5 w-6 cursor-ns-resize touch-none items-center justify-center rounded text-slate-300 transition-colors hover:bg-slate-100 hover:text-slate-500 focus:outline-none focus:ring-2 focus:ring-rijksblauw-500/40 dark:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-300"
            onPointerDown={startDrag}
            onPointerMove={onDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onDoubleClick={() => storeHeight(null)}
            onKeyDown={resizeByKey}
            title={
              manualHeight === null
                ? 'Sleep omlaag om het invoerveld groter te maken'
                : 'Sleep om de hoogte aan te passen, dubbelklik om automatisch mee te groeien'
            }
            aria-label="Hoogte van het invoerveld aanpassen"
          >
            <GripHorizontal size={14} />
          </button>
        </div>

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
