import { useEffect, useMemo, useState } from 'react';
import { X } from '@/components/common/icons';
import { BarChartCard } from '@/components/analytics/Charts';
import PromptCard from '@/components/prompts/PromptCard';
import { listPrompts, listTechniquePromptLinks } from '@/services/repository';
import { usePromptCommunity } from '@/hooks/usePromptCommunity';
import { useReferenceData } from '@/context/ReferenceDataContext';
import type { CountByLabel } from '@/services/analyticsService';
import type { Prompt } from '@/types';

type Dimension = 'category' | 'technique';

interface Selection {
  dimension: Dimension;
  label: string;
}

/**
 * Klikbare overzichtsgrafieken op het dashboard: prompts per categorie en per
 * gebruikte techniek. Klik je op een staaf, dan licht die op en verschijnen de
 * prompts van die groep er direct onder. De techniek-grafiek gebruikt de
 * optimizations-tabel (welke prompts welke techniek gebruiken), zodat de
 * balkhoogte exact overeenkomt met wat je bij klikken te zien krijgt.
 */
export default function PromptBreakdown() {
  const { categories, techniqueById } = useReferenceData();
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [links, setLinks] = useState<{ technique_id: string; prompt_id: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [selection, setSelection] = useState<Selection | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([listPrompts(), listTechniquePromptLinks()])
      .then(([p, l]) => {
        if (!active) return;
        setPrompts(p);
        setLinks(l);
      })
      .catch(() => {
        if (!active) return;
        setPrompts([]);
        setLinks([]);
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

  // Prompt-ids per techniek-naam (één prompt telt per techniek maar één keer),
  // beperkt tot prompts die de gebruiker daadwerkelijk mag zien.
  const promptIdsByTechnique = useMemo(() => {
    const visible = new Set(prompts.map((p) => p.id));
    const map = new Map<string, Set<string>>();
    for (const l of links) {
      if (!visible.has(l.prompt_id)) continue;
      const name = techniqueById(l.technique_id)?.name ?? 'Onbekend';
      const set = map.get(name) ?? new Set<string>();
      set.add(l.prompt_id);
      map.set(name, set);
    }
    return map;
  }, [links, prompts, techniqueById]);

  const byTechnique: CountByLabel[] = useMemo(
    () =>
      [...promptIdsByTechnique.entries()]
        .map(([label, ids]) => ({ label, value: ids.size }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 8),
    [promptIdsByTechnique],
  );

  // De prompts die bij de huidige selectie horen.
  const selected = useMemo(() => {
    if (!selection) return [];
    if (selection.dimension === 'category') {
      return prompts.filter((p) => categoryName(p.category_id) === selection.label);
    }
    const ids = promptIdsByTechnique.get(selection.label);
    return ids ? prompts.filter((p) => ids.has(p.id)) : [];
  }, [selection, prompts, categoryName, promptIdsByTechnique]);

  function pick(dimension: Dimension, label: string) {
    setSelection((prev) =>
      prev && prev.dimension === dimension && prev.label === label ? null : { dimension, label },
    );
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
          onBarClick={(label) => pick('category', label)}
          activeLabel={selection?.dimension === 'category' ? selection.label : null}
        />
        <BarChartCard
          title="Meest gebruikte technieken"
          data={byTechnique}
          emptyHint="Nog geen technieken toegepast op een prompt."
          onBarClick={(label) => pick('technique', label)}
          activeLabel={selection?.dimension === 'technique' ? selection.label : null}
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
