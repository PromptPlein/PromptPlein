import { useEffect, useRef } from 'react';
import { Check, Loader2, RotateCcw } from '@/components/common/icons';
import clsx from 'clsx';
import type { ProjectInterviewStep } from '@/services/projectPromptService';
import { submitOnEnter } from './usePromptInterview';

/** De balk met stappen boven in "Prompt maken" en het contextvenster. */
export function WizardSteps({ labels, current }: { labels: string[]; current: number }) {
  return (
    <ol
      className="mb-5 grid gap-2"
      style={{ gridTemplateColumns: `repeat(${labels.length}, minmax(0, 1fr))` }}
      aria-label="Stappen"
    >
      {labels.map((label, i) => (
        <li
          key={label}
          aria-current={i === current ? 'step' : undefined}
          className={clsx(
            'border-t-4 pt-1 text-sm font-semibold transition-colors',
            i <= current
              ? 'border-rijksblauw-700 text-rijksblauw-700 dark:border-rijksblauw-400 dark:text-rijksblauw-200'
              : 'border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400',
          )}
        >
          {label}
        </li>
      ))}
    </ol>
  );
}

export function WizardError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200"
    >
      {message}
      <button type="button" className="opl-btn-secondary !px-3 !py-1.5" onClick={onRetry}>
        <RotateCcw size={14} /> Opnieuw
      </button>
    </div>
  );
}

export function WizardWaiting({ label }: { label: string }) {
  return (
    <p
      role="status"
      className="flex items-center justify-center gap-2 py-14 text-base font-semibold text-rijksblauw-700 dark:text-rijksblauw-200"
    >
      <Loader2 size={20} className="animate-spin" /> {label}
    </p>
  );
}

/** Eén vraag van de vragenronde: wat de AI begrijpt, de vraag, opties en typen. */
export function InterviewQuestion({
  question,
  number,
  picked,
  answer,
  onTogglePick,
  onAnswer,
  onSubmit,
}: {
  question: ProjectInterviewStep;
  number: number;
  picked: string[];
  answer: string;
  onTogglePick: (optie: string) => void;
  onAnswer: (text: string) => void;
  onSubmit: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Een nieuwe vraag krijgt de focus, zodat een schermlezer hem meteen voorleest.
  useEffect(() => {
    headingRef.current?.focus();
  }, [question]);

  return (
    <div className="animate-fade-in space-y-4">
      {question.begrip && (
        <p className="rounded-lg bg-rijksblauw-50 px-3 py-2 text-sm text-slate-800 dark:bg-rijksblauw-500/15 dark:text-slate-100">
          {question.begrip}
        </p>
      )}
      <div>
        <p className="mb-1 text-sm font-semibold text-slate-600 dark:text-slate-400">
          Vraag {number}
          {question.max ? ` van ${question.max}` : ''}
        </p>
        <h3
          ref={headingRef}
          tabIndex={-1}
          className="text-lg font-bold text-rijksblauw-700 focus:outline-none dark:text-rijksblauw-200"
        >
          {question.vraag}
        </h3>
      </div>
      {(question.opties?.length ?? 0) > 0 && (
        <div className="space-y-2">
          {question.opties?.map((optie) => {
            const on = picked.includes(optie);
            return (
              <button
                key={optie}
                type="button"
                aria-pressed={on}
                onClick={() => onTogglePick(optie)}
                className={clsx(
                  'flex min-h-[2.75rem] w-full items-center gap-3 rounded-xl border px-3 py-2 text-left text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rijksblauw-500',
                  on
                    ? 'border-rijksblauw-700 bg-rijksblauw-50 text-slate-900 dark:border-rijksblauw-300 dark:bg-rijksblauw-500/20 dark:text-white'
                    : 'border-slate-200 text-slate-800 hover:border-rijksblauw-500 hover:bg-rijksblauw-50 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-rijksblauw-500/15',
                )}
              >
                <span
                  aria-hidden="true"
                  className={clsx(
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded border',
                    on
                      ? 'border-rijksblauw-700 bg-rijksblauw-700 text-white dark:border-rijksblauw-300 dark:bg-rijksblauw-500'
                      : 'border-slate-400 dark:border-slate-500',
                  )}
                >
                  {on && <Check size={14} />}
                </span>
                {optie}
              </button>
            );
          })}
        </div>
      )}
      <textarea
        rows={2}
        aria-label="Typ er iets bij"
        placeholder="Typ er iets bij"
        maxLength={2000}
        className="opl-input resize-y"
        value={answer}
        onChange={(e) => onAnswer(e.target.value)}
        onKeyDown={submitOnEnter(onSubmit)}
      />
    </div>
  );
}
