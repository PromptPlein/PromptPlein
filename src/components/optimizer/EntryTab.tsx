import { type ReactNode } from 'react';
import { Check } from 'lucide-react';
import clsx from 'clsx';

/**
 * Eén instap-tab in een segmented control: twee klikbare segmenten waarvan er
 * precies één actief is. De actieve tab licht zacht op in de oranje huisstijl
 * en toont een gevuld vinkje als keuze-indicator; de inactieve tab is
 * teruggetrokken (grijs) met een leeg ringetje en een hover-lift, zodat
 * zichtbaar is dat het een knop is.
 */
interface EntryTabProps {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  title: string;
  description: string;
}

export default function EntryTab({ active, onClick, icon, title, description }: EntryTabProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      role="tab"
      aria-selected={active}
      className={clsx(
        'group relative flex h-full w-full flex-col gap-3 p-5 text-left transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-rijksblauw-500',
        active
          ? 'bg-gradient-to-br from-rijksoranje/10 to-white dark:from-rijksoranje/15 dark:to-slate-800'
          : 'bg-slate-50/60 hover:bg-rijksoranje/5 dark:bg-slate-900/30 dark:hover:bg-rijksoranje/10',
      )}
    >
      {/* Kopregel: icoon + titel + keuze-indicator */}
      <div className="flex items-center gap-3">
        <span
          className={clsx(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-sm transition-opacity',
            'bg-gradient-to-br from-rijksoranje to-rijksoranje-dark',
            active ? 'opacity-100' : 'opacity-60 group-hover:opacity-90',
          )}
        >
          {icon}
        </span>
        <h2
          className={clsx(
            'flex-1 text-base font-bold leading-tight sm:text-[17px]',
            active ? 'text-slate-800 dark:text-slate-100' : 'text-slate-500 dark:text-slate-400',
          )}
        >
          {title}
        </h2>

        {/* Keuze-indicator: gevuld oranje vinkje wanneer actief, anders een leeg ringetje. */}
        <span
          aria-hidden
          className={clsx(
            'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
            active
              ? 'border-rijksoranje bg-rijksoranje text-white'
              : 'border-slate-300 bg-transparent group-hover:border-rijksoranje dark:border-slate-600',
          )}
        >
          <Check size={14} strokeWidth={3} className={active ? 'opacity-100' : 'opacity-0'} />
        </span>
      </div>

      <p
        className={clsx(
          'text-sm leading-snug',
          active ? 'text-slate-600 dark:text-slate-300' : 'text-slate-400 dark:text-slate-500',
        )}
      >
        {description}
      </p>
    </button>
  );
}
