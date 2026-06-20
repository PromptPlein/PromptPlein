import { Check, Layers, Wrench } from 'lucide-react';
import clsx from 'clsx';
import { useReferenceData } from '@/context/ReferenceDataContext';
import { isContextPrompt } from '@/lib/techniques';
import type { Technique } from '@/types';

interface TechniqueSelectorProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export default function TechniqueSelector({ selectedId, onSelect }: TechniqueSelectorProps) {
  const { techniques } = useReferenceData();

  // Contextprompts (complete raamwerken, bijv. CRISP/CARE) los van de
  // losse prompttechnieken tonen, elk in een eigen, duidelijk afgebakende groep.
  const contextPrompts = techniques.filter(isContextPrompt);
  const promptTechniques = techniques.filter((t) => !isContextPrompt(t));

  return (
    <div className="space-y-6">
      {contextPrompts.length > 0 && (
        <Group
          icon={<Layers size={16} className="text-rijksoranje" />}
          title="Contextprompts"
          subtitle="Complete raamwerken die je hele prompt structureren."
          techniques={contextPrompts}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      )}

      <Group
        icon={<Wrench size={16} className="text-rijksblauw-500" />}
        title="Prompttechnieken"
        subtitle="Gerichte technieken voor een specifiek effect."
        techniques={promptTechniques}
        selectedId={selectedId}
        onSelect={onSelect}
      />
    </div>
  );
}

function Group({
  icon,
  title,
  subtitle,
  techniques,
  selectedId,
  onSelect,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  techniques: Technique[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (techniques.length === 0) return null;
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
          {icon}
        </span>
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200">
            {title}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {techniques.map((t) => (
          <TechniqueCard
            key={t.id}
            technique={t}
            active={t.id === selectedId}
            onSelect={() => onSelect(t.id)}
          />
        ))}
      </div>
    </div>
  );
}

function TechniqueCard({
  technique: t,
  active,
  onSelect,
}: {
  technique: Technique;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
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
      {t.strength && (
        <span className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          <span className="font-medium text-slate-600 dark:text-slate-300">Doel: </span>
          {t.strength}
        </span>
      )}
      <span className="mt-2 text-xs text-slate-400 dark:text-slate-500">
        {t.follow_up_questions.length} vervolgvraag
        {t.follow_up_questions.length === 1 ? '' : 'en'}
      </span>
    </button>
  );
}
