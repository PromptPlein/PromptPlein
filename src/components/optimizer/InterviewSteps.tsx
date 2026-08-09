import { Check, Loader2 } from 'lucide-react';
import clsx from 'clsx';

/**
 * De vaste vraaglijn van de brainstormsessie, in dezelfde volgorde als de AI hem
 * afloopt. De namen komen letterlijk uit het protocol van de clarify-modus: het
 * model zet bij elke vraag op welke stap hij zit, en die naam matcht hierop.
 *
 * "Navraag" hoort er bewust niet bij als eigen bolletje: die stap komt alleen
 * soms voor, en een balk die halverwege een stap erbij krijgt leest als een
 * fout. Hij valt onder de laatste stap.
 */
export const INTERVIEW_STEPS = [
  { id: 'Het probleem', short: 'Probleem' },
  { id: 'Het doel', short: 'Doel' },
  { id: 'Voor wie', short: 'Voor wie' },
  { id: 'Wat er al ligt', short: 'Materiaal' },
  { id: 'De grenzen', short: 'Grenzen' },
  { id: 'Waar het landt', short: 'Gebruik' },
] as const;

/** Positie van een stapnaam in de lijn; -1 als de naam niet herkend wordt. */
function indexOfStep(step?: string | null): number {
  if (!step) return -1;
  const needle = step.trim().toLowerCase();
  const exact = INTERVIEW_STEPS.findIndex((s) => s.id.toLowerCase() === needle);
  if (exact !== -1) return exact;
  // "Navraag" en varianten horen bij de laatste stap: het gesprek is dan rond en
  // er wordt alleen nog één ding nagevraagd.
  if (needle.startsWith('navraag')) return INTERVIEW_STEPS.length - 1;
  return -1;
}

/**
 * Voortgangsbalk over de vraaglijn van het gesprek.
 *
 * Zonder deze balk is een interview een rij losse vragen: je weet niet hoeveel
 * er nog komen, en niet waaróm iets gevraagd wordt. Met de stappen erbij zie je
 * dat het gesprek een lijn heeft — eerst het probleem, dan het doel, dan voor
 * wie — en dat elke vraag daar een plek in heeft.
 *
 * `current` is de stap waar de openstaande vraag bij hoort. Is die (nog)
 * onbekend, dan valt de balk terug op het aantal beantwoorde vragen, zodat er
 * altijd iets beweegt.
 */
export default function InterviewSteps({
  current,
  answered,
  busy,
}: {
  /** Stapnaam van de huidige vraag, zoals de AI hem meestuurt. */
  current?: string | null;
  /** Aantal beantwoorde vragen; vangnet als de stapnaam ontbreekt. */
  answered: number;
  /** De AI denkt na over de volgende vraag. */
  busy: boolean;
}) {
  const named = indexOfStep(current);
  const activeIndex = named !== -1 ? named : Math.min(answered, INTERVIEW_STEPS.length - 1);
  // De balk loopt tot en met de stap die nu bezig is; bij de laatste stap vol.
  const progress = ((activeIndex + (busy ? 0.5 : 1)) / INTERVIEW_STEPS.length) * 100;

  return (
    <div className="rounded-xl border border-slate-200 bg-white/70 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800/60">
      {/* De lijn zelf: één doorlopende balk die met een soepele overgang
          meegroeit, zodat de sprong naar een volgende stap zichtbaar is. */}
      <div className="relative h-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
        <div
          className="h-full rounded-full bg-rijksblauw-500 transition-[width] duration-700 ease-out"
          style={{ width: `${Math.min(100, Math.max(6, progress))}%` }}
        />
      </div>

      <ol className="mt-2 flex flex-wrap items-center gap-x-1 gap-y-1.5">
        {INTERVIEW_STEPS.map((step, i) => {
          const done = i < activeIndex;
          const active = i === activeIndex;
          return (
            <li key={step.id} className="flex items-center gap-1">
              <span
                className={clsx(
                  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] transition-colors duration-500',
                  done && 'text-slate-500 dark:text-slate-400',
                  active &&
                    'bg-rijksblauw-50 font-semibold text-rijksblauw-700 dark:bg-rijksblauw-500/15 dark:text-rijksblauw-200',
                  !done && !active && 'text-slate-400 dark:text-slate-500',
                )}
              >
                {done ? (
                  <Check size={11} className="shrink-0 text-emerald-500" />
                ) : active && busy ? (
                  <Loader2 size={11} className="shrink-0 animate-spin" />
                ) : (
                  <span
                    className={clsx(
                      'h-1.5 w-1.5 shrink-0 rounded-full transition-colors duration-500',
                      active ? 'bg-rijksblauw-500' : 'bg-slate-300 dark:bg-slate-600',
                    )}
                  />
                )}
                {step.short}
              </span>
              {i < INTERVIEW_STEPS.length - 1 && (
                <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
                  ·
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
