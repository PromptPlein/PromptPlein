import clsx from 'clsx';
import { PROMPT_KINDS, type PromptKind } from '@/lib/techniques';
import { PROMPT_KIND_META } from '@/lib/promptKinds';

interface KindPickerProps {
  value: PromptKind;
  onChange: (kind: PromptKind) => void;
  /** Uitleg onder de keuze, bijv. waar de voorkeuze vandaan komt. */
  hint?: string;
  /** Unieke naam voor de radiogroep als er meer pickers op een pagina staan. */
  name?: string;
}

/**
 * Kies de soort van een prompt: wat hij oplevert. Zes tegels met icoon, op de
 * telefoon drie per rij. Echte radioknoppen, dus pijltjestoetsen werken.
 */
export default function KindPicker({ value, onChange, hint, name = 'prompt-soort' }: KindPickerProps) {
  return (
    <fieldset>
      <legend className="opl-label">Soort</legend>
      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
        {PROMPT_KINDS.map((k) => {
          const meta = PROMPT_KIND_META[k];
          const Icon = meta.icon;
          const on = value === k;
          return (
            <label
              key={k}
              className={clsx(
                'flex min-h-[3.5rem] cursor-pointer flex-col items-center justify-center gap-1 rounded-md border px-1 py-2 text-xs transition-colors focus-within:ring-2 focus-within:ring-rijksblauw-500',
                on
                  ? 'border-2 border-rijksblauw-700 bg-rijksblauw-50 font-bold text-rijksblauw-700 dark:border-rijksblauw-300 dark:bg-rijksblauw-500/15 dark:text-rijksblauw-200'
                  : 'border-slate-300 bg-white text-slate-700 hover:border-rijksblauw-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200',
              )}
            >
              <input
                type="radio"
                name={name}
                value={k}
                checked={on}
                onChange={() => onChange(k)}
                className="sr-only"
              />
              <Icon size={18} aria-hidden="true" />
              <span>{meta.label}</span>
            </label>
          );
        })}
      </div>
      {hint && <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{hint}</p>}
    </fieldset>
  );
}
