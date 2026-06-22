import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { BarChartCard } from '@/components/analytics/Charts';
import PromptCard from '@/components/prompts/PromptCard';
import { listPrompts } from '@/services/repository';
import { listEvents, topTechniques } from '@/services/analyticsService';
import { usePromptCommunity } from '@/hooks/usePromptCommunity';
import { useReferenceData } from '@/context/ReferenceDataContext';
import type { CountByLabel } from '@/services/analyticsService';
import type { AnalyticsEvent, Prompt } from '@/types';

interface Selection {
  label: string;
}

/**
 * Overzichtsgrafieken op het dashboard: prompts per categorie (klikbaar — klik
 * op een staaf en de prompts van die categorie verschijnen eronder) en de meest
 * gebruikte technieken (zelfde bron als de Trending-tab: het aantal
 * optimalisatie-runs per techniek uit de analytics-events).
 */
export default function PromptBreakdown() {
  const { categories, techniqueById } = useReferenceData();
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [events, setEvents] = useState<AnalyticsEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selection, setSelection] = useState<Selection | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([listPrompts(), listEvents()])
      .then(([p, e]) => {
        if (!active) return;
        setPrompts(p);
        setEvents(e);
      })
      .catch(() => {
        if (!active) return;
        setPrompts([]);
        setEvents([]);
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  // Naam van een categorie (label op de grafiek). Onbekend → "Overig".
  const categoryName = useMemo(() => {
    const byId = new Map(categories.map((c) => [c.id, c.name]));
    return (id: string | null | undefined) => (id ? byId.get(id) ?? 'Overig' : 'Overig');
  }, [categories]);

  const byCategory: CountByLabel[] = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of prompts) {
      const name = categoryName(p.category_id);
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  }, [prompts, categoryName]);

  // Zelfde bron en berekening als de Trending-tab: optimalisatie-runs per
  // techniek uit de analytics-events.
  const byTechnique: CountByLabel[] = useMemo(
    () => topTechniques(events, (id) => techniqueById(id)?.name ?? 'Onbekend'),
    [events, techniqueById],
  );

  // De prompts die bij de huidige (categorie-)selectie horen.
  const selected = useMemo(() => {
    if (!selection) return [];
    return prompts.filter((p) => categoryName(p.category_id) === selection.label);
  }, [selection, prompts, categoryName]);

  function pick(label: string) {
    setSelection((prev) => (prev && prev.label === label ? null : { label }));
  }

  if (loading) {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="skeleton h-72 rounded-xl" />
        <div className="skeleton h-72 rounded-xl" />
      </div>
    );
  }

  return (
    <div>
      <div className="grid gap-4 lg:grid-cols-2">
        <BarChartCard
          title="Prompts per categorie"
          data={byCategory}
          emptyHint="Nog geen prompts om te tonen."
          onBarClick={pick}
          activeLabel={selection?.label ?? null}
        />
        <BarChartCard
          title="Meest gebruikte technieken"
          data={byTechnique}
          emptyHint="Nog geen technieken gebruikt."
        />
      </div>

      {selection && <SelectedPrompts label={selection.label} prompts={selected} onClose={() => setSelection(null)} />}
    </div>
  );
}

function SelectedPrompts({
  label,
  prompts,
  onClose,
}: {
  label: string;
  prompts: Prompt[];
  onClose: () => void;
}) {
  const { enriched, authors } = usePromptCommunity(prompts);
  return (
    <div className="mt-6">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-base font-semibold text-slate-700 dark:text-slate-200">
          {label}{' '}
          <span className="text-sm font-normal text-slate-400 dark:text-slate-500">
            ({prompts.length} {prompts.length === 1 ? 'prompt' : 'prompts'})
          </span>
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        >
          <X size={15} /> Sluiten
        </button>
      </div>

      {prompts.length === 0 ? (
        <div className="opl-card p-8 text-center text-sm text-slate-500 dark:text-slate-400">
          Geen prompts in deze groep.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {enriched.map((p) => (
            <PromptCard
              key={p.id}
              prompt={p}
              author={p.created_by_user ? authors[p.created_by_user] : null}
            />
          ))}
        </div>
      )}
    </div>
  );
}
