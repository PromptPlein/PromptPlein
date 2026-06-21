import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Loader2, Pencil, Sparkles } from 'lucide-react';
import clsx from 'clsx';
import PrefillBadge from './PrefillBadge';
import type { PrefillSource, Technique } from '@/types';

/** Herkomst + toelichting van een voor-ingevuld veld, per veld-id. */
export type FieldMeta = Record<string, { source: PrefillSource; note?: string }>;

interface FollowUpQuestionsProps {
  technique: Technique;
  answers: Record<string, string>;
  onChange: (answers: Record<string, string>) => void;
  /**
   * Voor-ingevulde herkomst per veld (origin-badges). Velden die de gebruiker
   * daarna zelf aanpast, verliezen hun badge via `onUserEdit`.
   */
  fieldMeta?: FieldMeta;
  /** Aangeroepen wanneer de gebruiker een veld handmatig wijzigt (badge laten vervallen). */
  onUserEdit?: (id: string) => void;
  /** True terwijl de velden worden voor-ingevuld; toont een laadstaat. */
  prefilling?: boolean;
}

/**
 * Begeleidt de gebruiker stap voor stap door de velden die nodig zijn om een
 * herbruikbare prompt-template te bouwen. Eén vraag per scherm met voortgang,
 * en aan het eind een overzicht. Het doel is een template die een collega
 * later opnieuw kan invullen — niet het optimaliseren van losse tekst.
 */
export default function FollowUpQuestions({
  technique,
  answers,
  onChange,
  fieldMeta,
  onUserEdit,
  prefilling = false,
}: FollowUpQuestionsProps) {
  const questions = technique.follow_up_questions;
  const total = questions.length;
  const [step, setStep] = useState(0);
  const [reviewing, setReviewing] = useState(false);

  // Reset de wizard wanneer er een andere techniek wordt gekozen.
  useEffect(() => {
    setStep(0);
    setReviewing(false);
  }, [technique.id]);

  // Laadstaat tijdens het voor-invullen: skeletten i.p.v. lege velden.
  if (prefilling) {
    return (
      <div className="space-y-4">
        <p className="inline-flex items-center gap-2 text-sm font-medium text-rijksblauw-700 dark:text-rijksblauw-200">
          <Loader2 size={15} className="animate-spin" />
          We vullen de velden alvast voor op basis van je prompt…
        </p>
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-2">
              <div className="skeleton h-3.5 w-1/3 rounded" />
              <div className="skeleton h-16 w-full rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (total === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-600 dark:bg-slate-900/40 dark:text-slate-400">
        Deze techniek heeft geen invulvelden. Je kunt de template direct bouwen.
      </div>
    );
  }

  const current = questions[step];
  const answeredCount = questions.filter((q) => (answers[q.id] ?? '').trim()).length;
  const isLast = step === total - 1;
  const hasPrefill = Boolean(fieldMeta && Object.keys(fieldMeta).length > 0);
  const currentMeta = fieldMeta?.[current?.id ?? ''];

  function update(value: string) {
    onChange({ ...answers, [current.id]: value });
    // Zodra de gebruiker zelf typt, is de herkomst-badge niet meer accuraat.
    onUserEdit?.(current.id);
  }

  function next() {
    if (isLast) setReviewing(true);
    else setStep((s) => Math.min(s + 1, total - 1));
  }

  function back() {
    if (reviewing) setReviewing(false);
    else setStep((s) => Math.max(s - 1, 0));
  }

  // --- Overzichtsweergave (na de laatste vraag) ---
  if (reviewing) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm font-medium text-rijksblauw-700 dark:text-rijksblauw-200">
          <Check size={16} /> Overzicht — controleer je antwoorden
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {hasPrefill
            ? 'We hebben deze velden alvast voor je ingevuld op basis van je prompt. Controleer en pas aan waar nodig — vooral de AI-suggesties met het oranje label "Controleren".'
            : 'Dit zijn de bouwstenen van je template. Klopt alles? Bouw dan de herbruikbare template.'}
        </p>
        <ul className="divide-y divide-slate-100 dark:divide-slate-700">
          {questions.map((q, i) => {
            const value = (answers[q.id] ?? '').trim();
            const meta = fieldMeta?.[q.id];
            return (
              <li key={q.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{q.label}</p>
                    {meta && value && <PrefillBadge source={meta.source} note={meta.note} />}
                  </div>
                  <p
                    className={clsx(
                      'mt-0.5 whitespace-pre-wrap text-sm',
                      value ? 'text-slate-600 dark:text-slate-300' : 'italic text-slate-400 dark:text-slate-500',
                    )}
                  >
                    {value || 'Nog niet ingevuld — blijft een plaatshouder in de template.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setReviewing(false);
                    setStep(i);
                  }}
                  className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-rijksblauw-600 dark:hover:bg-slate-800"
                  aria-label={`Bewerk: ${q.label}`}
                  title="Bewerken"
                >
                  <Pencil size={15} />
                </button>
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          onClick={back}
          className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
        >
          <ArrowLeft size={15} /> Terug naar de vragen
        </button>
      </div>
    );
  }

  // --- Stapsgewijze vraagweergave ---
  return (
    <div className="space-y-4">
      {/* Voortgang */}
      <div>
        <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
          <span>
            Vraag {step + 1} van {total}
          </span>
          <span>{answeredCount} ingevuld</span>
        </div>
        <div className="flex gap-1">
          {questions.map((q, i) => (
            <button
              key={q.id}
              type="button"
              onClick={() => setStep(i)}
              aria-label={`Ga naar vraag ${i + 1}`}
              className={clsx(
                'h-1.5 flex-1 rounded-full transition-colors',
                i === step
                  ? 'bg-rijksblauw-500'
                  : (answers[q.id] ?? '').trim()
                    ? 'bg-rijksblauw-300 dark:bg-rijksblauw-500/50'
                    : 'bg-slate-200 dark:bg-slate-700',
              )}
            />
          ))}
        </div>
      </div>

      {/* Huidige vraag */}
      <div key={current.id} className="animate-fade-in">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <label className="opl-label mb-0" htmlFor={`fu-${current.id}`}>
            {current.label}
          </label>
          {currentMeta && (answers[current.id] ?? '').trim() && (
            <PrefillBadge source={currentMeta.source} note={currentMeta.note} />
          )}
        </div>
        <textarea
          id={`fu-${current.id}`}
          autoFocus
          className="opl-input min-h-[96px] resize-y"
          value={answers[current.id] ?? ''}
          placeholder={current.placeholder}
          onChange={(e) => update(e.target.value)}
        />
        {currentMeta && currentMeta.note && (answers[current.id] ?? '').trim() ? (
          <p className="mt-1.5 flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500">
            <Sparkles size={12} /> {currentMeta.note}
          </p>
        ) : (
          <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
            Optioneel. Wat je leeg laat, wordt een invulbare plaatshouder in de template.
          </p>
        )}
      </div>

      {/* Navigatie */}
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={back}
          disabled={step === 0}
          className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <ArrowLeft size={16} /> Vorige
        </button>
        <button type="button" onClick={next} className="opl-btn-primary">
          {isLast ? (
            <>
              <Check size={16} /> Naar overzicht
            </>
          ) : (
            <>
              Volgende <ArrowRight size={16} />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
