import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Pencil } from 'lucide-react';
import clsx from 'clsx';
import type { Technique } from '@/types';

interface FollowUpQuestionsProps {
  technique: Technique;
  answers: Record<string, string>;
  onChange: (answers: Record<string, string>) => void;
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

  function update(value: string) {
    onChange({ ...answers, [current.id]: value });
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
          Dit zijn de bouwstenen van je template. Klopt alles? Bouw dan de herbruikbare template.
        </p>
        <ul className="divide-y divide-slate-100 dark:divide-slate-700">
          {questions.map((q, i) => {
            const value = (answers[q.id] ?? '').trim();
            return (
              <li key={q.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{q.label}</p>
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
        <label className="opl-label" htmlFor={`fu-${current.id}`}>
          {current.label}
        </label>
        <textarea
          id={`fu-${current.id}`}
          autoFocus
          className="opl-input min-h-[96px] resize-y"
          value={answers[current.id] ?? ''}
          placeholder={current.placeholder}
          onChange={(e) => update(e.target.value)}
        />
        <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
          Optioneel. Wat je leeg laat, wordt een invulbare plaatshouder in de template.
        </p>
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
