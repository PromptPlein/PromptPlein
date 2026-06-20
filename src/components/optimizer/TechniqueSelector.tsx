import { Check, Layers, Wrench } from 'lucide-react';
import clsx from 'clsx';
import { useReferenceData } from '@/context/ReferenceDataContext';
import { isContextPrompt } from '@/lib/techniques';
import type { Technique } from '@/types';

interface TechniqueSelectorProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
  /**
   * Toon ook de prompt frameworks-groep (raamwerken zoals CARE/CRISP). Standaard true.
   * In de techniek-aanbevelingsflow staat dit op false: daar zijn alleen de losse
   * prompttechnieken bedoeld; de prompt frameworks horen bij de eigen-prompt-flow.
   */
  showContextPrompts?: boolean;
}

export default function TechniqueSelector({
  selectedId,
  onSelect,
  showContextPrompts = true,
}: TechniqueSelectorProps) {
  const { techniques } = useReferenceData();

  // Prompt frameworks (complete raamwerken, bijv. CRISP/CARE) los van de
  // losse prompttechnieken tonen, elk in een eigen, duidelijk afgebakende groep.
  const contextPrompts = techniques.filter(isContextPrompt);
  const promptTechniques = techniques.filter((t) => !isContextPrompt(t));

  return (
    <div className="space-y-8">
      {showContextPrompts && contextPrompts.length > 0 && (
        <Group
          icon={<Layers size={16} />}
          title="Prompt frameworks"
          subtitle="Complete raamwerken die je hele prompt structureren."
          accent="oranje"
          techniques={contextPrompts}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      )}

      <Group
        icon={<Wrench size={16} />}
        title="Prompttechnieken"
        subtitle="Gerichte technieken voor een specifiek effect."
        accent="blauw"
        techniques={promptTechniques}
        selectedId={selectedId}
        onSelect={onSelect}
      />
    </div>
  );
}

/** Accentkleur per groep: oranje voor prompt frameworks, blauw voor prompttechnieken. */
type Accent = 'oranje' | 'blauw';

const ACCENT_STYLES: Record<
  Accent,
  { badge: string; icon: string; rule: string }
> = {
  oranje: {
    // Titel-badge: getinte achtergrond + accentrand links, zodat de kop opvalt.
    badge:
      'border-rijksoranje/30 bg-rijksoranje/10 text-rijksoranje dark:border-rijksoranje/40 dark:bg-rijksoranje/15',
    icon: 'text-rijksoranje',
    // Volledige scheidingslijn onder de kop, in de accentkleur, vervagend.
    rule: 'from-rijksoranje/50 via-rijksoranje/20',
  },
  blauw: {
    badge:
      'border-rijksblauw-500/30 bg-rijksblauw-50 text-rijksblauw-700 dark:border-rijksblauw-500/40 dark:bg-rijksblauw-500/15 dark:text-rijksblauw-200',
    icon: 'text-rijksblauw-500',
    rule: 'from-rijksblauw-500/50 via-rijksblauw-500/20',
  },
};

function Group({
  icon,
  title,
  subtitle,
  accent,
  techniques,
  selectedId,
  onSelect,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  accent: Accent;
  techniques: Technique[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (techniques.length === 0) return null;
  const styles = ACCENT_STYLES[accent];
  return (
    <div>
      {/* Sectiekop: een opvallende, omkaderde titel-badge met icoon + subtitel. */}
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span
          className={clsx(
            'inline-flex items-center gap-2 rounded-lg border-l-4 border px-3 py-1.5 text-sm font-bold uppercase tracking-wide shadow-sm',
            styles.badge,
          )}
        >
          <span className={styles.icon}>{icon}</span>
          {title}
        </span>
        <p className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
      </div>

      {/* Volledige scheidingslijn onder de kop: markeert de grens van deze sectie. */}
      <div
        className={clsx('mb-4 h-px w-full bg-gradient-to-r to-transparent', styles.rule)}
        aria-hidden="true"
      />

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
