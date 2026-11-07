import { type ReactNode } from 'react';
import clsx from 'clsx';

/**
 * Eén tabblad bovenaan Prompt maken, in dezelfde vorm als de doelen op Technieken:
 * het gekozen tabblad loopt zonder lijn over in het vlak eronder, met een oranje
 * streep bovenaan. Dat kan alleen naast elkaar, dus pas vanaf sm.
 */
export default function EntryTab({
  active,
  onClick,
  icon,
  title,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      role="tab"
      aria-selected={active}
      className={clsx(
        'relative mb-3 flex min-h-[5.25rem] w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-rijksblauw-500/50',
        active
          ? // z-10 en -mb-px: het tabblad legt zich over de bovenrand van het vlak
            // heen, zodat er geen lijn tussen beide loopt.
            'z-10 border-slate-200 bg-white shadow-[inset_0_4px_0_0_theme(colors.rijksoranje.vast)] sm:-mb-px sm:rounded-b-none sm:border-b-white dark:border-slate-700 dark:bg-slate-800 sm:dark:border-b-slate-800'
          : 'border-slate-200 bg-[#e6edf3] hover:border-rijksblauw-700 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-rijksblauw-200',
      )}
    >
      <span
        aria-hidden="true"
        className={clsx(
          'flex h-11 w-11 shrink-0 items-center justify-center rounded-full',
          active
            ? 'bg-rijksblauw-50 text-rijksblauw-700 dark:bg-rijksblauw-500/20 dark:text-rijksblauw-200'
            : 'bg-white text-rijksblauw-700 dark:bg-slate-800 dark:text-rijksblauw-200',
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 text-lg font-bold leading-tight text-rijksblauw-700 dark:text-rijksblauw-200">
        {title}
      </span>
    </button>
  );
}
