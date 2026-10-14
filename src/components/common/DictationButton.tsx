import type { CSSProperties } from 'react';
import { Loader2, Mic, Square } from 'lucide-react';
import clsx from 'clsx';
import { formatDictationTime, type DictationState } from '@/lib/useDictation';

interface DictationButtonProps {
  state: DictationState;
  seconds: number;
  onToggle: () => void;
  disabled?: boolean;
  /** 'sm' ligt in een tekstvak, 'md' staat in de werkbalk van de chat. */
  size?: 'sm' | 'md';
  className?: string;
  style?: CSSProperties;
}

/**
 * Het microfoontje. In rust grijs en bescheiden; tijdens het opnemen rood met
 * een kloppende ring en de verstreken tijd ernaast, zodat niemand vergeet dat de
 * microfoon aan staat; tijdens het uitschrijven een draaiend wieltje.
 *
 * onMouseDown voorkomt dat het tekstvak zijn focus (en cursorpositie) kwijtraakt
 * door de klik: de tekst moet straks precies daar terechtkomen.
 */
export default function DictationButton({
  state,
  seconds,
  onToggle,
  disabled = false,
  size = 'sm',
  className,
  style,
}: DictationButtonProps) {
  const recording = state === 'recording';
  const transcribing = state === 'transcribing';
  const box = size === 'sm' ? 'h-7 w-7' : 'h-8 w-8';
  const icon = size === 'sm' ? 14 : 17;

  return (
    <div className={clsx('flex items-center gap-1.5', className)} style={style}>
      {recording && (
        <span
          className="pointer-events-none inline-flex items-center gap-1.5 rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-white shadow-sm"
          aria-live="polite"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-white motion-safe:animate-pulse" />
          Opnemen {formatDictationTime(seconds)}
        </span>
      )}
      {transcribing && (
        <span className="pointer-events-none rounded-full bg-slate-800/85 px-2 py-0.5 text-[11px] font-medium text-white shadow-sm dark:bg-slate-600/90">
          Uitschrijven…
        </span>
      )}
      <button
        type="button"
        tabIndex={size === 'sm' ? -1 : undefined}
        onMouseDown={(e) => e.preventDefault()}
        onClick={onToggle}
        disabled={disabled || transcribing}
        className={clsx(
          'relative flex shrink-0 items-center justify-center rounded-lg transition-colors',
          'focus:outline-none focus:ring-2 focus:ring-rijksblauw-500/40 disabled:cursor-not-allowed',
          box,
          recording
            ? 'bg-red-600 text-white shadow-sm hover:bg-red-700'
            : size === 'sm'
              ? 'bg-white/90 text-slate-500 shadow-sm ring-1 ring-slate-200 hover:text-rijksblauw-600 dark:bg-slate-700/90 dark:text-slate-300 dark:ring-slate-600 dark:hover:text-rijksblauw-300'
              : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200',
        )}
        title={
          recording
            ? 'Stop en zet de tekst in het veld (Esc breekt af)'
            : transcribing
              ? 'Bezig met uitschrijven…'
              : 'Inspreken: klik, praat, klik nog eens. De opname wordt na het uitschrijven weggegooid.'
        }
        aria-label={recording ? 'Stop met opnemen' : 'Inspreken met de microfoon'}
        aria-pressed={recording}
      >
        {recording && (
          <span className="absolute inset-0 rounded-lg bg-red-500 motion-safe:animate-ping opacity-40" />
        )}
        {transcribing ? (
          <Loader2 size={icon} className="animate-spin" />
        ) : recording ? (
          <Square size={icon - 3} fill="currentColor" className="relative" />
        ) : (
          <Mic size={icon} />
        )}
      </button>
    </div>
  );
}
