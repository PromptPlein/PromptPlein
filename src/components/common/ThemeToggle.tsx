import { useCallback, useRef, useState } from 'react';
import { Sun, Moon, Monitor, Check } from '@/components/common/icons';
import clsx from 'clsx';
import { useTheme, type ThemeChoice } from '@/context/ThemeContext';
import useDismiss from '@/lib/useDismiss';

const OPTIONS: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Licht', icon: Sun },
  { value: 'dark', label: 'Donker', icon: Moon },
  { value: 'system', label: 'Systeem', icon: Monitor },
];

/** Icoonknop met uitklapmenu om tussen licht/donker/systeem te wisselen. */
export default function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useDismiss(open, ref, useCallback(() => setOpen(false), []));

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
        title="Thema wisselen"
        aria-label="Thema wisselen"
        aria-expanded={open}
      >
        {resolvedTheme === 'dark' ? <Moon size={18} /> : <Sun size={18} />}
      </button>

      {open && (
        <div className="z-50 mt-2 rounded-xl max-sm:fixed max-sm:inset-x-2 max-sm:top-[64px] sm:absolute sm:right-0 sm:w-44 border border-slate-100 bg-white p-1.5 shadow-lg dark:border-slate-700 dark:bg-slate-800">
          {OPTIONS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => {
                setTheme(value);
                setOpen(false);
              }}
              className={clsx(
                'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm',
                theme === value
                  ? 'bg-rijksblauw-50 text-rijksblauw-700 dark:bg-rijksblauw-500/15 dark:text-rijksblauw-200'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700',
              )}
            >
              <Icon size={16} /> {label}
              {theme === value && <Check size={14} className="ml-auto" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
