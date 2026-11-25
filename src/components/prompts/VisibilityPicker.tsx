import { Info, Lock, Globe } from '@/components/common/icons';
import clsx from 'clsx';
import { VISIBILITY_LEVELS } from '@/lib/utils';
import type { VisibilityLevel } from '@/types';

/**
 * Keuze wie een prompt mag zien: Privé of Publiek. Wordt op elke plek gebruikt
 * waar je een prompt deelt, zodat de uitleg overal gelijk is.
 *
 * Privé is een prompt zonder deelniveau. Publiek is het niveau 'public' en wacht
 * op een beheerder voordat anderen hem zien.
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
  const publiek = VISIBILITY_LEVELS[0];
  const isPublic = value.length > 0;

  const options = [
    {
      key: 'private',
      label: 'Privé',
      description: 'Alleen zichtbaar voor jezelf.',
      note: null as string | null,
      icon: Lock,
      checked: !isPublic,
      select: () => onChange([]),
    },
    {
      key: 'public',
      label: publiek.label,
      description: publiek.description,
      note: publiek.approval,
      icon: Globe,
      checked: isPublic,
      select: () => onChange([publiek.value]),
    },
  ];

  return (
    <fieldset className="space-y-2">
      <legend className="opl-label">Wie mag deze prompt zien?</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((opt) => {
          const Icon = opt.icon;
          const id = `${idPrefix}-${opt.key}`;
          return (
            <label
              key={opt.key}
              htmlFor={id}
              className={clsx(
                'flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors',
                opt.checked
                  ? 'border-rijksblauw-400 bg-rijksblauw-50/60 dark:border-rijksblauw-500/50 dark:bg-rijksblauw-500/10'
                  : 'border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600',
              )}
            >
              <input
                id={id}
                type="radio"
                name={`${idPrefix}-zichtbaarheid`}
                className="mt-1 h-4 w-4 shrink-0 accent-rijksblauw-600"
                checked={opt.checked}
                onChange={opt.select}
              />
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 font-medium text-slate-800 dark:text-slate-100">
                  <Icon size={14} aria-hidden />
                  {opt.label}
                </span>
                <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
                  {opt.description}
                </span>
                {opt.note && (
                  <span className="mt-1 flex items-start gap-1 text-xs text-slate-400 dark:text-slate-500">
                    <Info size={12} className="mt-0.5 shrink-0" aria-hidden />
                    {opt.note}
                  </span>
                )}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
