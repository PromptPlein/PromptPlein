import { type ReactNode } from 'react';
import clsx from 'clsx';

/**
 * Eén instapkaart: een grote, toegankelijke keuzeknop met de oranje
 * secundaire huisstijlrand. Geen animaties — rustig en duidelijk.
 */
interface EntryOptionCardProps {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  title: string;
  description: string;
}

export default function EntryOptionCard({
  active,
  onClick,
  icon,
  title,
  description,
}: EntryOptionCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={clsx(
        'group flex h-full flex-col rounded-2xl border-2 p-4 text-left shadow-sm transition-[border-color,box-shadow,background] duration-200 hover:shadow-md sm:p-5',
        active
          ? 'border-rijksoranje bg-gradient-to-br from-rijksoranje/10 to-white ring-2 ring-rijksoranje/25 dark:from-rijksoranje/15 dark:to-slate-800'
          : 'border-rijksoranje/60 bg-gradient-to-br from-white to-rijksoranje/5 hover:border-rijksoranje dark:border-rijksoranje/50 dark:from-slate-800 dark:to-rijksoranje/10',
      )}
    >
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-rijksoranje to-rijksoranje-dark text-white shadow-sm">
          {icon}
        </span>
        <h2 className="text-base font-bold leading-tight text-slate-800 dark:text-slate-100 sm:text-lg">
          {title}
        </h2>
      </div>
      <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{description}</p>
    </button>
  );
}
