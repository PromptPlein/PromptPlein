import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import {
  GripHorizontal,
  Loader2,
  Paperclip,
  Scissors,
  Send,
  Sparkles,
  Square,
  Undo2,
  X,
} from 'lucide-react';
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

/** Uitkomst van een verbeterslag op de getypte tekst. */
export interface OptimizeResult {
  text: string;
  changed: boolean;
  error?: string;
}

/**
 * Invoerbalk van de chat: tekstveld (Enter = verzenden, Shift+Enter = nieuwe
 * regel), bijlagen (paperclip + chips) en de stop-knop tijdens het streamen.
 *
 * Het tekstvak begint op drie regels en groeit mee met wat je typt. Wie meer
 * ruimte wil, sleept het met de greep rechtsonder groter; die keuze blijft
 * bewaard tot je hem met een dubbelklik weer loslaat.
 *
 * Staat er tekst in het veld en is `onOptimize` meegegeven, dan verschijnt
 * rechtsboven het oranje sterretje: één klik en de AI herschrijft wat er staat
 * tot een scherpere vraag. De oorspronkelijke tekst blijft daarna één klik weg.
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
  onOptimize,
  badge,
  allowAttachments = true,
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
  /**
   * Verbetert de getypte tekst. Afwezig = geen sterretje (bijv. wanneer de
   * beheerder de functie uit heeft staan). Mag nooit gooien: bij een fout hoort
   * de oorspronkelijke tekst terug te komen met een melding.
   */
  onOptimize?: (text: string) => Promise<OptimizeResult>;
  /** De modelbadge, rechtsonder in de chat weergegeven. */
  badge?: ReactNode;
  /** Bijlagen toestaan? De Testkamer zet dit uit: daar test je de prompt zelf. */
  allowAttachments?: boolean;
}) {
  const [text, setText] = useState('');
  const [optimizing, setOptimizing] = useState(false);
  // De tekst van vóór de laatste verbetering, met wat eruit kwam. Zolang het
  // veld nog exact het resultaat bevat, kan de gebruiker terug.
  const [beforeOptimize, setBeforeOptimize] = useState<{ before: string; after: string } | null>(
    null,
  );
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
    // Het vak rekent met border-box, dus de randen tellen mee in de hoogte.
    // Alleen scrollHeight aanhouden laat de tekst er twee pixels overheen lopen
    // en dat is precies genoeg voor een schuifbalk bij tekst die eigenlijk past.
    const borders = el.offsetHeight - el.clientHeight;
    el.style.height = `${Math.min(MAX_HEIGHT, Math.max(DEFAULT_HEIGHT, el.scrollHeight + borders))}px`;
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

  const canSend = !disabled && !streaming && !optimizing && text.trim().length > 0;
  const canOptimize = Boolean(onOptimize) && !disabled && !streaming && text.trim().length > 0;
  // Alleen terugdraaien zolang het veld nog precies het verbeterde resultaat
  // bevat; typt de gebruiker verder, dan slaat "herstellen" nergens meer op.
  const canUndo = beforeOptimize !== null && text === beforeOptimize.after && !optimizing;

  function submit() {
    if (!canSend) return;
    const value = text.trim();
    setText('');
    setBeforeOptimize(null);
    onSend(value);
  }

  async function optimize() {
    if (!onOptimize || !canOptimize || optimizing) return;
    const before = text;
    setOptimizing(true);
    try {
      const result = await onOptimize(before);
      // Niets veranderd (fout of al goed genoeg): laat de tekst met rust.
      if (result.error || !result.changed || !result.text.trim()) return;
      setText(result.text);
      setBeforeOptimize({ before, after: result.text });
    } finally {
      setOptimizing(false);
      textareaRef.current?.focus();
    }
  }

  function undoOptimize() {
    if (!canUndo || !beforeOptimize) return;
    setText(beforeOptimize.before);
    setBeforeOptimize(null);
    textareaRef.current?.focus();
  }

  return (
    <div className="border-t border-slate-200 px-4 pb-3 pt-3 dark:border-slate-700 sm:px-6">
      {allowAttachments && attachments.length > 0 && (
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

      {/* Tot lg staat het tekstvlak op de volle breedte met de knoppen eronder:
          op telefoon en tablet is de ruimte om te typen belangrijker dan een
          rij naast elkaar. Vanaf lg staat alles weer op één regel. */}
      <div className="flex flex-wrap items-end gap-2">
        {allowAttachments && (
          <>
            <button
              type="button"
              className="opl-btn-ghost order-2 shrink-0 !px-2.5 lg:order-none"
              onClick={() => fileInputRef.current?.click()}
              disabled={
                disabled || streaming || extracting || attachments.length >= MAX_CHAT_ATTACHMENTS
              }
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
          </>
        )}

        <div className="relative order-1 w-full lg:order-none lg:w-auto lg:flex-1">
          <textarea
            ref={textareaRef}
            className={clsx(
              // opl-scroll-slim: een slanke schuifbalk met vaste goot, zodat een
              // langere tekst geen brede systeembalk oplevert die tegen de
              // knoppen in de hoeken aan botst — en de tekst niet verspringt op
              // het moment dat de balk verschijnt.
              'opl-input opl-scroll-slim w-full resize-none py-2.5 pb-6',
              // Ruimte rechtsboven voor het sterretje, zodat de tekst er niet
              // onder doorloopt. Vast (niet afhankelijk van of de knop er staat),
              // anders zou de tekst verspringen zodra je begint te typen.
              onOptimize && 'pr-12',
            )}
            rows={3}
            placeholder={disabled ? 'Chat wordt geladen…' : 'Stel je vraag…'}
            value={text}
            disabled={disabled || optimizing}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              // Enter verzendt; Shift+Enter maakt een nieuwe regel.
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
          />
          {/* Sterretje rechtsboven: verbetert in één klik wat er staat. Verschijnt
              pas zodra er tekst is, zodat een leeg veld rustig blijft. Zelfde
              oranje verloop als het gereedschap "Genereren" in de menubalk. */}
          {onOptimize && (text.trim().length > 0 || optimizing) && (
            <button
              type="button"
              className={clsx(
                // right-3 laat de schuifbalk vrij; zonder balk oogt het als een
                // bewuste marge in plaats van een knop tegen de rand.
                'absolute right-3 top-2 flex h-7 w-7 items-center justify-center rounded-lg',
                'bg-gradient-to-br from-rijksoranje to-rijksoranje-dark text-white shadow-sm',
                'transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-rijksoranje/40',
                canOptimize && !optimizing
                  ? 'hover:shadow-md motion-safe:hover:-translate-y-px'
                  : 'cursor-default opacity-60',
              )}
              onClick={() => void optimize()}
              disabled={!canOptimize || optimizing}
              title={
                optimizing
                  ? 'Bezig met verbeteren…'
                  : 'Verbeter mijn tekst met AI — je oorspronkelijke tekst kun je daarna terughalen'
              }
              aria-label="Verbeter mijn tekst met AI"
            >
              {optimizing ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Sparkles size={14} strokeWidth={2.25} />
              )}
            </button>
          )}

          {/* Greep om het tekstvak zelf groter te slepen. Dubbelklikken zet hem
              terug op automatisch meegroeien. */}
          <button
            type="button"
            className="absolute bottom-1.5 right-2.5 flex h-5 w-6 cursor-ns-resize touch-none items-center justify-center rounded text-slate-300 transition-colors hover:bg-slate-100 hover:text-slate-500 focus:outline-none focus:ring-2 focus:ring-rijksblauw-500/40 dark:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-300"
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
            className="opl-btn-secondary order-3 ml-auto shrink-0 lg:order-none lg:ml-0"
            onClick={onStop}
            aria-label="Stop het antwoord"
          >
            <Square size={16} /> Stop
          </button>
        ) : (
          <button
            type="button"
            className={clsx(
              'opl-btn-primary order-3 ml-auto shrink-0 lg:order-none lg:ml-0',
              !canSend && 'opacity-50',
            )}
            onClick={submit}
            disabled={!canSend}
            aria-label="Verstuur"
          >
            <Send size={16} /> Verstuur
          </button>
        )}
      </div>

      {/* Na een verbetering: één klik terug naar de eigen tekst. Verdwijnt zodra
          de gebruiker zelf verder typt of het bericht verstuurt. */}
      {canUndo && (
        <div className="mt-1.5 flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
          <Sparkles size={12} className="shrink-0 text-rijksoranje" />
          <span className="min-w-0">Je tekst is verbeterd. Lees hem na en pas gerust aan.</span>
          <button
            type="button"
            className="shrink-0 inline-flex items-center gap-1 font-medium text-rijksblauw-600 hover:underline dark:text-rijksblauw-300"
            onClick={undoOptimize}
          >
            <Undo2 size={12} /> Herstel mijn tekst
          </button>
        </div>
      )}

      <div className="mt-1.5 flex items-center justify-between gap-2">
        <p className="min-w-0 text-[11px] text-slate-400 dark:text-slate-500">
          <span className="hidden sm:inline">Enter = verzenden · Shift+Enter = nieuwe regel</span>
          {allowAttachments && (
            <>
              <span className="hidden sm:inline"> · </span>
              max. {MAX_CHAT_ATTACHMENTS} bijlagen, 10&nbsp;MB
              <span className="hidden sm:inline"> per stuk</span>
            </>
          )}
        </p>
        <span className="shrink-0">{badge}</span>
      </div>
    </div>
  );
}
