import { Check } from 'lucide-react';
import clsx from 'clsx';
import { useReferenceData } from '@/context/ReferenceDataContext';

interface TechniqueSelectorProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export default function TechniqueSelector({ selectedId, onSelect }: TechniqueSelectorProps) {
  const { techniques } = useReferenceData();

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {techniques.map((t) => {
        const active = t.id === selectedId;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelect(t.id)}
            aria-pressed={active}
            className={clsx(
              'flex flex-col rounded-xl border p-4 text-left transition-all',
              active
                ? 'border-rijksblauw-500 bg-rijksblauw-50 ring-2 ring-rijksblauw-500/20 dark:bg-rijksblauw-500/15'
                : 'border-slate-200 bg-white hover:border-rijksblauw-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-800',
            )}
          >
            <div className="mb-1 flex items-center justify-between">
              <span className="font-semibold text-rijksblauw-700 dark:text-rijksblauw-200">{t.name}</span>
              {active && (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-rijksblauw-500 text-white">
                  <Check size={14} />
                </span>
              )}
            </div>
            <span className="text-sm text-slate-600 dark:text-slate-300">{t.description}</span>
            <span className="mt-2 text-xs text-slate-400 dark:text-slate-500">
              {t.follow_up_questions.length} vervolgvraag
              {t.follow_up_questions.length === 1 ? '' : 'en'}
            </span>
          </button>
        );
      })}
    </div>
  );
}
