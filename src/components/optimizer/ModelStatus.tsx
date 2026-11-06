import { Check, Loader2 } from '@/components/common/icons';
import clsx from 'clsx';
import { providerShortLabel } from '@/config/aiModels';

interface ModelStatusProps {
  /**
   * De providers die zijn geprobeerd, in volgorde. De laatste is degene die nu
   * werkt; alles daarvóór is een poging die niet lukte en waarna is teruggevallen.
   */
  models: string[];
  /** De provider die het antwoord daadwerkelijk levert. */
  winner?: string | null;
  /** Wat het model aan het doen is, bijv. "vult je velden in". */
  verb?: string;
  className?: string;
}

/**
 * Laat zien welk model op dit moment aan je antwoord werkt.
 *
 * Alleen het ACTIEVE model, niet de keten erachter. Er werkt altijd één model
 * tegelijk — dat van de beheerder — en valt dat uit, dan neemt de volgende het
 * over. Die overstap melden we in één regel, maar de mislukte poging krijgt geen
 * eigen vak meer: een lijst met modellen die niet meedoen leidt af en roept
 * vragen op over namen die de gebruiker niet kent.
 */
export default function ModelStatus({ models, winner, verb, className }: ModelStatusProps) {
  // Levert een provider het antwoord die niet in de lijst staat (oudere server
  // die alleen 'meta' stuurt), dan hoort die er alsnog bij.
  const lanes = winner && !models.includes(winner) ? [...models, winner] : models;
  if (lanes.length === 0) return null;

  // Wie er nu werkt: de leverende provider, anders de laatst geprobeerde.
  const current = winner ?? lanes[lanes.length - 1];
  const switched = lanes.length > 1;
  // Alleen het model dat nu werkt krijgt een vak; de eerdere pogingen zitten in
  // de regel "overgestapt na een storing".
  const shown = [current];

  return (
    <div className={clsx('space-y-2', className)}>
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
        {providerShortLabel(current)} {winner ? (verb ?? 'levert het antwoord') : 'is aan het werk'}
        {switched && ', overgestapt na een storing'}
      </p>

      <div className="grid gap-2">
        {shown.map((model) => {
          const active = model === current;
          const failed = !active;
          const delivering = active && Boolean(winner);
          return (
            <div
              key={model}
              className={clsx(
                'rounded-lg border px-2.5 py-2 transition-colors duration-300',
                failed
                  ? 'border-slate-200 bg-slate-50/60 opacity-60 dark:border-slate-700 dark:bg-slate-900/30'
                  : delivering
                    ? 'border-emerald-300 bg-emerald-50/60 dark:border-emerald-500/40 dark:bg-emerald-500/10'
                    : 'border-rijksblauw-200 bg-rijksblauw-50/50 dark:border-rijksblauw-500/30 dark:bg-rijksblauw-500/10',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={clsx(
                    'truncate text-xs font-semibold',
                    failed
                      ? 'text-slate-500 dark:text-slate-400'
                      : delivering
                        ? 'text-emerald-700 dark:text-emerald-300'
                        : 'text-rijksblauw-700 dark:text-rijksblauw-200',
                  )}
                >
                  {providerShortLabel(model)}
                </span>
                <span
                  className={clsx(
                    'flex shrink-0 items-center gap-1 text-[11px]',
                    delivering
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-slate-400 dark:text-slate-500',
                  )}
                >
                  {failed ? (
                    'niet gelukt'
                  ) : delivering ? (
                    <>
                      <Check size={12} /> schrijft
                    </>
                  ) : (
                    <>
                      <Loader2 size={11} className="animate-spin" /> bezig
                    </>
                  )}
                </span>
              </div>

              {/* Baan: een lopende balk zolang het model werkt, een volle balk
                  zodra het levert, en een stilstaande baan voor een poging die
                  niet lukte. */}
              <div
                className={clsx(
                  'mt-1.5 h-1 w-full overflow-hidden rounded-full',
                  delivering
                    ? 'bg-emerald-200 dark:bg-emerald-500/30'
                    : 'bg-slate-200 dark:bg-slate-700',
                )}
              >
                {failed ? (
                  <div className="h-full w-1/3 rounded-full bg-slate-300 dark:bg-slate-600" />
                ) : delivering ? (
                  <div className="h-full w-full rounded-full bg-emerald-500" />
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
