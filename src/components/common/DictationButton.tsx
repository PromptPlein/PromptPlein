import type { CSSProperties } from 'react';
import { Loader2, Mic } from '@/components/common/icons';
import clsx from 'clsx';
import VoiceLevelMeter from './VoiceLevelMeter';
import { formatDictationTime, type DictationState } from '@/lib/useDictation';

interface DictationButtonProps {
  state: DictationState;
  seconds: number;
  /** De open microfoon tijdens het opnemen, voor de geluidsmeter. */
  stream: MediaStream | null;
  onToggle: () => void;
  disabled?: boolean;
  /** 'sm' ligt in een tekstvak, 'md' staat in de werkbalk van de chat. */
  size?: 'sm' | 'md';
  className?: string;
  style?: CSSProperties;
}

/** De gedeelde vorm van de opname- en uitschrijfbalk. */
const PANEL =
  'flex items-center gap-2 rounded-full border border-slate-200 bg-white/95 py-1 pl-1 pr-3 shadow-sm backdrop-blur ' +
  'dark:border-slate-600 dark:bg-slate-800/95';

/**
 * Het microfoontje. In rust een bescheiden knop; tijdens het opnemen een
 * rustige balk met een stopknop, een live geluidsmeter die meebeweegt met je
 * stem en de verstreken tijd. Tijdens het uitschrijven dezelfde balk met een
 * draaiend wieltje. Rood alleen als klein signaal (het puntje en het
 * stopvierkantje), niet als vlak.
 *
 * onMouseDown voorkomt dat het tekstvak zijn focus (en cursorpositie) kwijtraakt
 * door de klik: de tekst moet straks precies daar terechtkomen.
 */
export default function DictationButton({
  state,
  seconds,
  stream,
  onToggle,
  disabled = false,
  size = 'sm',
  className,
  style,
}: DictationButtonProps) {
  const keepFocus = (e: React.MouseEvent) => e.preventDefault();
  const tabIndex = size === 'sm' ? -1 : undefined;

  if (state === 'recording') {
    return (
      <div className={clsx(PANEL, className)} style={style} role="status">
        <button
          type="button"
          tabIndex={tabIndex}
          onMouseDown={keepFocus}
          onClick={onToggle}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-red-500 transition-colors hover:bg-red-50 hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-rijksblauw-500/40 dark:bg-slate-700 dark:text-red-400 dark:hover:bg-red-500/15"
          title="Stop en zet de tekst in het veld (Esc breekt af)"
          aria-label="Stop met opnemen"
        >
          <span className="h-2.5 w-2.5 rounded-[3px] bg-current" />
        </button>
        <VoiceLevelMeter stream={stream} />
        <span className="flex items-center gap-1.5 text-[11px] font-medium tabular-nums text-slate-500 dark:text-slate-400">
          <span className="h-1.5 w-1.5 rounded-full bg-red-400 motion-safe:animate-pulse" />
          {formatDictationTime(seconds)}
        </span>
        <span className="sr-only">Opname loopt</span>
      </div>
    );
  }

  if (state === 'transcribing') {
    return (
      <div className={clsx(PANEL, 'pl-2', className)} style={style} role="status">
        <Loader2 size={14} className="animate-spin text-rijksblauw-500 dark:text-rijksblauw-300" />
        <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
          Uitschrijven…
        </span>
      </div>
    );
  }

  return (
    <div className={clsx('flex items-center', className)} style={style}>
      <button
        type="button"
        tabIndex={tabIndex}
        onMouseDown={keepFocus}
        onClick={onToggle}
        disabled={disabled}
        className={clsx(
          'flex shrink-0 items-center justify-center rounded-lg transition-colors',
          'focus:outline-none focus:ring-2 focus:ring-rijksblauw-500/40 disabled:cursor-not-allowed',
          size === 'sm'
            ? 'h-7 w-7 bg-white/90 text-slate-500 shadow-sm ring-1 ring-slate-200 hover:text-rijksblauw-600 dark:bg-slate-700/90 dark:text-slate-300 dark:ring-slate-600 dark:hover:text-rijksblauw-300'
            : 'h-8 w-8 text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200',
        )}
        title="Inspreken: klik, praat, klik nog eens. De opname wordt na het uitschrijven weggegooid."
        aria-label="Inspreken met de microfoon"
      >
        <Mic size={size === 'sm' ? 14 : 17} />
      </button>
    </div>
  );
}
