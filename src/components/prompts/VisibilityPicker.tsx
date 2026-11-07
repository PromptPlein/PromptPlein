import { Check, Lock, Info } from '@/components/common/icons';
import clsx from 'clsx';
import { VISIBILITY_LEVELS } from '@/lib/utils';
import type { VisibilityLevel } from '@/types';

/**
 * Gedeelde multi-select voor de deelniveaus van een prompt. Wordt op ELKE plek
 * gebruikt waar je een prompt deelt (dashboard, zoeken, generator), zodat de
 * labels én de uitleg overal identiek zijn.
 *
 * Privé staat bovenaan en is ALTIJD aangevinkt: een prompt blijft altijd
 * zichtbaar voor de eigenaar. Je kunt Privé niet uitvinken — dat zou betekenen
 * dat je je eigen prompt niet meer kunt zien. De deelniveaus (afdeling en hoger)
 * stapel je er bovenop; je kunt er meerdere tegelijk kiezen. Per niveau is
 * duidelijk wat er na opslaan gebeurt (de afdeling is direct beschikbaar, hogere
 * niveaus wachten op goedkeuring). "Geen enkel deelniveau aangevinkt" betekent
 * dus: alleen privé.
 */
export default function VisibilityPicker({
  value,
  onChange,
  idPrefix = 'vis',
}: {
  value: VisibilityLevel[];
  onChange: (next: VisibilityLevel[]) => void;
  idPrefix?: string;
}) {
  function toggle(level: VisibilityLevel) {
    onChange(
      value.includes(level) ? value.filter((l) => l !== level) : [...value, level],
    );
  }

  const isPrivate = value.length === 0;

  return (
    <fieldset className="space-y-2">
      <legend className="opl-label">Wie mag deze prompt zien?</legend>
      <p className="-mt-1 mb-2 text-xs text-slate-400 dark:text-slate-500">
        Kies één of meerdere niveaus. Standaard blijft de prompt privé, alleen voor jezelf.
      </p>

      <div className="space-y-2">
        {/* Privé staat bovenaan en is ALTIJD aangevinkt en niet uit te vinken:
            de prompt blijft altijd zichtbaar voor de eigenaar. Deelniveaus
            stapel je hier bovenop. */}
        <div
          className={clsx(
            'flex items-start gap-3 rounded-xl border p-3',
            'border-rijksblauw-400 bg-rijksblauw-50/60 dark:border-rijksblauw-500/50 dark:bg-rijksblauw-500/10',
          )}
        >
          <span
            className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border border-rijksblauw-500 bg-rijksblauw-600 text-white opacity-80"
            aria-hidden
          >
            <Check size={14} />
          </span>
          <input
            id={`${idPrefix}-private`}
            type="checkbox"
            className="sr-only"
            checked
            disabled
            readOnly
            aria-label="Privé, altijd aangevinkt, kan niet worden uitgezet"
          />
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-slate-800 dark:text-slate-100">Privé</span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[0.6875rem] font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                Altijd voor jou
              </span>
            </span>
            <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
              {isPrivate
                ? 'Alleen zichtbaar voor jezelf; je deelt deze prompt met niemand.'
                : 'Je blijft de prompt altijd zelf zien. Hieronder deel je hem daarnaast met anderen.'}
            </span>
            <span className="mt-1 flex items-start gap-1 text-xs text-slate-400 dark:text-slate-500">
              <Lock size={12} className="mt-0.5 shrink-0" aria-hidden />
              Deze staat altijd aan; anders zou je je eigen prompt niet meer kunnen zien.
            </span>
          </span>
        </div>

        {VISIBILITY_LEVELS.map((lvl) => {
          const active = value.includes(lvl.value);
          return (
            <label
              key={lvl.value}
              htmlFor={`${idPrefix}-${lvl.value}`}
              className={clsx(
                'flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors',
                active
                  ? 'border-rijksblauw-400 bg-rijksblauw-50/60 dark:border-rijksblauw-500/50 dark:bg-rijksblauw-500/10'
                  : 'border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600',
              )}
            >
              <span
                className={clsx(
                  'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border',
                  active
                    ? 'border-rijksblauw-500 bg-rijksblauw-600 text-white'
                    : 'border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-800',
                )}
                aria-hidden
              >
                {active && <Check size={14} />}
              </span>
              <input
                id={`${idPrefix}-${lvl.value}`}
                type="checkbox"
                className="sr-only"
                checked={active}
                onChange={() => toggle(lvl.value)}
              />
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-slate-800 dark:text-slate-100">{lvl.label}</span>
                  <span
                    className={clsx(
                      'rounded-full px-2 py-0.5 text-[0.6875rem] font-medium',
                      lvl.autoApproved
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                        : 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
                    )}
                  >
                    {lvl.approvalShort}
                  </span>
                </span>
                <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
                  {lvl.description}
                </span>
                <span className="mt-1 flex items-start gap-1 text-xs text-slate-400 dark:text-slate-500">
                  <Info size={12} className="mt-0.5 shrink-0" aria-hidden />
                  {lvl.approval}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
