import { List, Rows3 } from 'lucide-react';
import clsx from 'clsx';
import type { FieldLayout } from '@/lib/useFieldLayout';

interface FieldLayoutToggleProps {
  layout: FieldLayout;
  onChange: (layout: FieldLayout) => void;
}

/**
 * Kleine icoon-schakelaar waarmee de gebruiker kiest hoe de invulvelden
 * verschijnen: stap voor stap (wizard) of alle velden tegelijk onder elkaar
 * (stacked). De keuze wordt persoonlijk bewaard via useFieldLayout.
 */
export default function FieldLayoutToggle({ layout, onChange }: FieldLayoutToggleProps) {
  return (
    <div
      role="group"
      aria-label="Indeling van de velden"
      className="inline-flex items-center gap-0.5 rounded-lg border border-slate-200 bg-slate-50 p-0.5 dark:border-slate-700 dark:bg-slate-800"
    >
      <button
        type="button"
        onClick={() => onChange('wizard')}
        aria-pressed={layout === 'wizard'}
        title="Stap voor stap: één vraag tegelijk"
        className={clsx(
          'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors',
          layout === 'wizard'
            ? 'bg-white text-rijksblauw-700 shadow-sm dark:bg-slate-700 dark:text-rijksblauw-200'
            : 'text-slate-500 hover:text-rijksblauw-600 dark:text-slate-400 dark:hover:text-rijksblauw-300',
        )}
      >
        <List size={15} />
        <span className="hidden sm:inline">Stap voor stap</span>
      </button>
      <button
        type="button"
        onClick={() => onChange('stacked')}
        aria-pressed={layout === 'stacked'}
        title="Alles onder elkaar: alle velden tegelijk"
        className={clsx(
          'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors',
          layout === 'stacked'
            ? 'bg-white text-rijksblauw-700 shadow-sm dark:bg-slate-700 dark:text-rijksblauw-200'
            : 'text-slate-500 hover:text-rijksblauw-600 dark:text-slate-400 dark:hover:text-rijksblauw-300',
        )}
      >
        <Rows3 size={15} />
        <span className="hidden sm:inline">Alles tegelijk</span>
      </button>
    </div>
  );
}
