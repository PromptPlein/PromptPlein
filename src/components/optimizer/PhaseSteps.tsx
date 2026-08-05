import { Check, Loader2 } from 'lucide-react';
import clsx from 'clsx';

interface PhaseStepsProps {
  /** De stappen in volgorde, van eerste naar laatste. */
  steps: string[];
  /** Welke stap nu loopt; alles ervóór is af, alles erna wacht nog. */
  activeIndex: number;
  className?: string;
}

/**
 * Compact stappenspoor voor een lopende AI-actie: wat is af, wat loopt er nu, en
 * wat komt er nog. Gedeeld door de laadschermen van het voor-invullen en het
 * bouwen van de prompt.
 *
 * Waarom: het zware werk van een model gebeurt vóór het eerste teken tekst. Zonder
 * dit spoor lijkt die periode stil te staan, terwijl er juist wordt nagedacht. Een
 * afgevinkte stap plus een lopende stap maakt het verschil zichtbaar tussen
 * "bezig met lezen" en "bezig met schrijven".
 */
export default function PhaseSteps({ steps, activeIndex, className }: PhaseStepsProps) {
  return (
    <ol className={clsx('flex flex-wrap items-center gap-x-2 gap-y-1 text-xs', className)}>
      {steps.map((label, i) => {
        const passed = i < activeIndex;
        const active = i === activeIndex;
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              className={clsx(
                'flex items-center gap-1.5 rounded-full px-2 py-0.5 font-medium transition-colors',
                passed
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                  : active
                    ? 'bg-rijksblauw-50 text-rijksblauw-700 dark:bg-rijksblauw-500/15 dark:text-rijksblauw-200'
                    : 'text-slate-400 dark:text-slate-500',
              )}
            >
              {passed ? (
                <Check size={11} />
              ) : active ? (
                <Loader2 size={11} className="animate-spin" />
              ) : null}
              {label}
            </span>
            {i < steps.length - 1 && (
              <span className="h-px w-3 bg-slate-200 dark:bg-slate-700" aria-hidden />
            )}
          </li>
        );
      })}
    </ol>
  );
}
