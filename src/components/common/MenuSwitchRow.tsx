import type { LucideIcon } from '@/components/common/icons';
import clsx from 'clsx';

/** De iconentegel van een regel in het plusmenu; ook gebruikt door gewone regels. */
export const MENU_ROW =
  'flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-slate-100 focus:outline-none focus-visible:bg-slate-100 focus-visible:ring-2 focus-visible:ring-rijksblauw-500 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-slate-700 dark:focus-visible:bg-slate-700';
export const MENU_ICON =
  'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rijksblauw-50 text-rijksblauw-700 dark:bg-rijksblauw-500/20 dark:text-rijksblauw-200';

/** Een regel in een menu die iets aan of uit zet, met de stand als schakelaar. */
export default function MenuSwitchRow({
  icon: Icon,
  label,
  hint,
  on,
  disabled,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  hint?: string;
  on: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={on}
      className={MENU_ROW}
      disabled={disabled}
      title={hint}
      onClick={onClick}
    >
      <span className={MENU_ICON}>
        <Icon size={16} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">
          {label}
        </span>
        {hint && (
          <span className="block truncate text-xs text-slate-600 dark:text-slate-300">{hint}</span>
        )}
      </span>
      <span
        aria-hidden="true"
        className={clsx(
          'relative h-5 w-9 shrink-0 rounded-full transition-colors',
          on ? 'bg-rijksblauw-700 dark:bg-rijksblauw-400' : 'bg-slate-300 dark:bg-slate-600',
        )}
      >
        <span
          className={clsx(
            'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all',
            on ? 'left-[1.125rem]' : 'left-0.5',
          )}
        />
      </span>
    </button>
  );
}
