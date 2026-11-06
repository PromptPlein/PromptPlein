import { type ReactNode } from 'react';
import { Check } from '@/components/common/icons';
import clsx from 'clsx';

/**
 * Eén instaptegel: twee klikbare tegels naast elkaar waarvan er precies één
 * actief is. De actieve tegel heeft een rand en een tint in de accentkleur en
 * een gevuld vinkje; de andere is wit met een leeg ringetje. De accentkleur
 * (oranje of blauw) verschilt per tegel. Een omschrijving is er alleen nog als
 * de aanroeper hem meegeeft: de uitleg staat achter het infobolletje bij de stap.
 */
type Accent = 'oranje' | 'blauw';

const ACCENT: Record<
  Accent,
  { activeBg: string; hoverBg: string; iconBg: string; ringActive: string; ringHover: string }
> = {
  oranje: {
    activeBg: 'border-rijksoranje bg-rijksoranje/10 dark:bg-rijksoranje/15',
    hoverBg:
      'border-slate-300 bg-white hover:border-rijksoranje hover:bg-rijksoranje/5 dark:border-slate-600 dark:bg-slate-800 dark:hover:bg-rijksoranje/10',
    iconBg: 'bg-rijksoranje',
    ringActive: 'border-rijksoranje bg-rijksoranje text-white',
    ringHover: 'border-slate-300 bg-transparent group-hover:border-rijksoranje dark:border-slate-600',
  },
  blauw: {
    activeBg: 'border-rijksblauw-500 bg-rijksblauw-500/10 dark:bg-rijksblauw-500/15',
    hoverBg:
      'border-slate-300 bg-white hover:border-rijksblauw-500 hover:bg-rijksblauw-500/5 dark:border-slate-600 dark:bg-slate-800 dark:hover:bg-rijksblauw-500/10',
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
  description?: string;
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
        'group relative flex h-full w-full flex-col justify-center gap-3 rounded-xl border-2 p-4 text-left transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-rijksblauw-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-800',
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
            active ? 'text-slate-900 dark:text-slate-100' : 'text-slate-700 dark:text-slate-300',
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

      {description && (
        <p
          className={clsx(
            'text-sm leading-snug',
            active ? 'text-slate-600 dark:text-slate-300' : 'text-slate-500 dark:text-slate-400',
          )}
        >
          {description}
        </p>
      )}
    </button>
  );
}
