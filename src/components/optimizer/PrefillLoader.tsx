import { Check, Loader2, Search } from 'lucide-react';
import ModelStatus from './ModelStatus';
import PhaseSteps from './PhaseSteps';
import type { PrefillPhase } from '@/services/optimizeService';
import type { PrefilledField } from '@/types';

interface PrefillLoaderProps {
  /** Naam van het raamwerk waarvan de velden worden ingevuld. */
  techniqueName?: string;
  /** Waar de inhoud vandaan komt, bijv. "je prompt" of "het gesprek". */
  source?: string;
  /** De velden van het raamwerk, in volgorde; leeg = generieke skeletten. */
  fields?: { id: string; label: string }[];
  /** Velden die al binnen zijn (komen één voor één uit de stream). */
  filled?: PrefilledField[];
  /** Providers die zijn geprobeerd, in volgorde; de laatste is aan het werk. */
  models?: string[];
  /** De provider die de velden daadwerkelijk levert. */
  winner?: string | null;
  /** Waar het invullen op dit moment mee bezig is. */
  phase?: PrefillPhase;
}

/** De drie stappen die de gebruiker in het laadscherm ziet aflopen. */
const STEPS: { phase: PrefillPhase; label: string }[] = [
  { phase: 'reading', label: 'Tekst lezen' },
  { phase: 'matching', label: 'Inhoud koppelen' },
  { phase: 'filling', label: 'Velden schrijven' },
];

/**
 * Laadscherm terwijl de AI de velden van een raamwerk voor-invult. Gedeeld door
 * de eigen-prompt-flow, de doel-dialoog en de plan-bouwer.
 *
 * Het toont niet alleen dát er iets gebeurt, maar wát: welk model eraan werkt,
 * welke stap loopt, en — het duidelijkst — de velden die één
 * voor één vollopen. De server stuurt elk veld door zodra het af is, dus het
 * skelet van een veld wordt vervangen door de echte tekst terwijl de rest nog
 * loopt. Een voortgangsbalk op het aantal ingevulde velden maakt het af: die
 * loopt echt, in tegenstelling tot een onbepaalde spinner.
 */
export default function PrefillLoader({
  techniqueName,
  source = 'je prompt',
  fields = [],
  filled = [],
  models = [],
  winner,
  phase = 'reading',
}: PrefillLoaderProps) {
  const byId = new Map(filled.map((f) => [f.id, f]));
  // Zonder veldenlijst (oudere aanroeper) tonen we drie neutrale plaatshouders.
  const rows = fields.length > 0 ? fields : [0, 1, 2].map((i) => ({ id: `_${i}`, label: '' }));
  const doneCount = fields.length > 0 ? fields.filter((f) => byId.has(f.id)).length : 0;
  const pct = fields.length > 0 ? Math.round((doneCount / fields.length) * 100) : 0;
  const stepIndex = STEPS.findIndex((s) => s.phase === phase);

  return (
    <div className="animate-fade-in overflow-hidden rounded-2xl border border-rijksblauw-200 bg-white shadow-sm dark:border-rijksblauw-500/30 dark:bg-slate-800">
      {/* Bovenrand: onbepaald zolang er nog geen veld binnen is, daarna de echte
          voortgang over het aantal ingevulde velden. */}
      <div className="h-1 w-full overflow-hidden bg-rijksblauw-100 dark:bg-rijksblauw-500/20">
        {doneCount > 0 ? (
          <div
            className="h-full bg-gradient-to-r from-rijksblauw-400 via-rijksoranje to-rijksblauw-600 transition-all duration-500 ease-out"
            style={{ width: `${Math.max(pct, 8)}%` }}
          />
        ) : (
          <div className="h-full w-1/3 animate-loading-bar bg-gradient-to-r from-rijksblauw-400 via-rijksoranje to-rijksblauw-600" />
        )}
      </div>

      <div className="p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rijksblauw-50 text-rijksblauw-600 dark:bg-rijksblauw-500/15 dark:text-rijksblauw-200">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rijksblauw-400/30" />
            <Search size={18} className="relative" />
          </span>
          <div className="min-w-0">
            <p className="flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-100">
              We vullen de velden alvast voor
              <Loader2 size={15} className="animate-spin text-rijksblauw-500" />
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              We ontleden {source} en verdelen de inhoud over de velden van{' '}
              <span className="font-medium text-rijksblauw-700 dark:text-rijksblauw-200">
                {techniqueName}
              </span>
              …
            </p>
          </div>
        </div>

        {/* Stappenspoor: welke fase loopt er nu. */}
        <PhaseSteps steps={STEPS.map((s) => s.label)} activeIndex={stepIndex} className="mt-4" />

        {models.length > 0 && (
          <ModelStatus
            models={models}
            winner={winner}
            verb="vult je velden in"
            className="mt-4"
          />
        )}

        {/* Teller over de velden: de meest concrete voortgang die we hebben. */}
        {fields.length > 0 && (
          <p className="mt-4 text-xs font-medium text-slate-500 dark:text-slate-400" aria-live="polite">
            {doneCount} van {fields.length} velden ingevuld
          </p>
        )}

        {/* De velden zelf: skelet zolang ze nog komen, echte tekst zodra ze
            binnen zijn. Zo ziet de gebruiker het werk ontstaan. */}
        <div className="mt-2 space-y-4">
          {rows.map((row) => {
            const value = byId.get(row.id);
            return (
              <div key={row.id} className="space-y-1.5">
                {row.label ? (
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
                    {value && <Check size={12} className="text-emerald-500" />}
                    {row.label}
                  </p>
                ) : (
                  <div className="skeleton h-3.5 w-1/3 rounded" />
                )}
                {value ? (
                  <p className="animate-fade-in line-clamp-4 rounded-lg border border-emerald-200 bg-emerald-50/40 p-2.5 text-sm leading-relaxed text-slate-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-slate-200">
                    {value.value}
                  </p>
                ) : (
                  <div className="skeleton h-16 w-full rounded-lg" />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
