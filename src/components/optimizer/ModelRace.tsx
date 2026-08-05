import { Check, Loader2 } from 'lucide-react';
import clsx from 'clsx';
import { providerShortLabel } from '@/config/aiModels';

interface ModelRaceProps {
  /** Provider-ids die tegelijk aan hetzelfde antwoord begonnen zijn. */
  models: string[];
  /** De provider die de race won en het antwoord levert (null = nog onbeslist). */
  winner?: string | null;
  /** Wat de modellen aan het doen zijn, bijv. "vult de velden in". */
  verb?: string;
  className?: string;
}

/**
 * Laat zien dat er meer dan één model tegelijk aan het werk is, en wie er wint.
 *
 * De server laat twee providers gelijktijdig aan hetzelfde antwoord beginnen en
 * gebruikt de snelste. Dat is precies het soort werk dat anders onzichtbaar
 * blijft: de gebruiker ziet één spinner en weet niet of er iets gebeurt. Twee
 * banen met een lopende balk maken de race zichtbaar — en zodra er een winnaar
 * is, valt de ander netjes terug in plaats van te verdwijnen.
 */
export default function ModelRace({ models, winner, verb, className }: ModelRaceProps) {
  // Won een provider die niet meedeed aan de race (de seriële keten sprong bij
  // nadat beide racers faalden), dan hoort die er alsnog bij te staan — anders
  // zie je twee ingehaalde modellen en nergens wie het werk doet.
  const lanes = winner && !models.includes(winner) ? [...models, winner] : models;
  if (lanes.length === 0) return null;
  const decided = Boolean(winner);

  return (
    <div className={clsx('space-y-2', className)}>
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
        {lanes.length > 1
          ? decided
            ? `${providerShortLabel(winner as string)} was als eerste klaar en ${verb ?? 'levert het antwoord'}`
            : `${lanes.length} modellen werken tegelijk — de snelste wint`
          : `${providerShortLabel(lanes[0])} ${verb ?? 'is aan het werk'}`}
      </p>

      <div className={clsx('grid gap-2', lanes.length > 1 && 'sm:grid-cols-2')}>
        {lanes.map((model) => {
          const won = decided && model === winner;
          const lost = decided && model !== winner;
          return (
            <div
              key={model}
              className={clsx(
                'rounded-lg border px-2.5 py-2 transition-colors duration-300',
                won
                  ? 'border-emerald-300 bg-emerald-50/60 dark:border-emerald-500/40 dark:bg-emerald-500/10'
                  : lost
                    ? 'border-slate-200 bg-slate-50/60 opacity-60 dark:border-slate-700 dark:bg-slate-900/30'
                    : 'border-rijksblauw-200 bg-rijksblauw-50/50 dark:border-rijksblauw-500/30 dark:bg-rijksblauw-500/10',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={clsx(
                    'truncate text-xs font-semibold',
                    won
                      ? 'text-emerald-700 dark:text-emerald-300'
                      : lost
                        ? 'text-slate-500 dark:text-slate-400'
                        : 'text-rijksblauw-700 dark:text-rijksblauw-200',
                  )}
                >
                  {providerShortLabel(model)}
                </span>
                <span
                  className={clsx(
                    'flex shrink-0 items-center gap-1 text-[11px]',
                    won
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-slate-400 dark:text-slate-500',
                  )}
                >
                  {won ? (
                    <>
                      <Check size={12} /> schrijft
                    </>
                  ) : lost ? (
                    'ingehaald'
                  ) : (
                    <>
                      <Loader2 size={11} className="animate-spin" /> bezig
                    </>
                  )}
                </span>
              </div>

              {/* Baan: onbepaalde loopbalk zolang het model meedoet, een volle
                  balk voor de winnaar, en een stilstaande baan voor wie verloor. */}
              <div
                className={clsx(
                  'mt-1.5 h-1 w-full overflow-hidden rounded-full',
                  won
                    ? 'bg-emerald-200 dark:bg-emerald-500/30'
                    : 'bg-slate-200 dark:bg-slate-700',
                )}
              >
                {won ? (
                  <div className="h-full w-full rounded-full bg-emerald-500" />
                ) : lost ? (
                  <div className="h-full w-1/3 rounded-full bg-slate-300 dark:bg-slate-600" />
                ) : (
                  <div className="h-full w-1/3 animate-loading-bar rounded-full bg-gradient-to-r from-rijksblauw-400 to-rijksoranje" />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
