import { type ReactNode } from 'react';
import { Check } from '@/components/common/icons';
import clsx from 'clsx';

/**
 * Eén instap-tab in een segmented control: twee klikbare segmenten waarvan er
 * precies één actief is. De actieve tab licht zacht op in de accentkleur en
 * toont een gevuld vinkje als keuze-indicator; de inactieve tab is teruggetrokken
 * (grijs) met een leeg ringetje en een hover-lift, zodat zichtbaar is dat het een
 * knop is. De accentkleur (oranje of blauw) verschilt per tab.
 */
type Accent = 'oranje' | 'blauw';

const ACCENT: Record<
  Accent,
  { activeBg: string; hoverBg: string; iconBg: string; ringActive: string; ringHover: string }
> = {
  oranje: {
    activeBg: 'bg-rijksoranje/10 dark:bg-rijksoranje/15',
    hoverBg: 'bg-slate-50/60 hover:bg-rijksoranje/5 dark:bg-slate-900/30 dark:hover:bg-rijksoranje/10',
    iconBg: 'bg-rijksoranje',
    ringActive: 'border-rijksoranje bg-rijksoranje text-white',
    ringHover: 'border-slate-300 bg-transparent group-hover:border-rijksoranje dark:border-slate-600',
  },
  blauw: {
    activeBg: 'bg-rijksblauw-500/10 dark:bg-rijksblauw-500/15',
    hoverBg: 'bg-slate-50/60 hover:bg-rijksblauw-500/5 dark:bg-slate-900/30 dark:hover:bg-rijksblauw-500/10',
    iconBg: 'bg-rijksblauw-700',
    ringActive: 'border-rijksblauw-500 bg-rijksblauw-500 text-white',
    ringHover: 'border-slate-300 bg-transparent group-hover:border-rijksblauw-400 dark:border-slate-600',
  },
};

interface EntryTabProps {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  title: string;
  description: string;
  /** Accentkleur van de tab; standaard oranje. */
  accent?: Accent;
}

export default function EntryTab({
  active,
  onClick,
  icon,
  title,
  description,
  accent = 'oranje',
}: EntryTabProps) {
  const c = ACCENT[accent];
  return (
    <button
      type="button"
      onClick={onClick}
      role="tab"
      aria-selected={active}
      className={clsx(
        'group relative flex h-full w-full flex-col gap-3 p-5 text-left transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-rijksblauw-500',
        active ? c.activeBg : c.hoverBg,
      )}
    >
      {/* Kopregel: icoon + titel + keuze-indicator */}
      <div className="flex items-center gap-3">
        <span
          className={clsx(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-sm transition-opacity',
            c.iconBg,
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

        {/* Keuze-indicator: gevuld vinkje (in de accentkleur) wanneer actief, anders een leeg ringetje. */}
        <span
          aria-hidden
          className={clsx(
            'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
            active ? c.ringActive : c.ringHover,
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
