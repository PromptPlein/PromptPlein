import { useEffect, useMemo, useState } from 'react';
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
      <nldd-container min-height="18rem">
        <nldd-activity-indicator></nldd-activity-indicator>
      </nldd-container>
    );
  }

  return (
    <nldd-container gap="24">
      <nldd-container layout="grid" gap="16" column-count={1} lg-column-count={2}>
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
      </nldd-container>

      {selection && <SelectedPrompts label={selection.label} prompts={selected} onClose={() => setSelection(null)} />}
    </nldd-container>
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
    <nldd-container gap="12">
      <nldd-title
        heading-level={2}
        size={5}
        text={label}
        supporting-text={`${prompts.length} ${prompts.length === 1 ? 'prompt' : 'prompts'}`}
      >
        <nldd-button
          slot="end"
          size="sm"
          appearance="neutral-transparent"
          start-icon="dismiss"
          text="Sluiten"
          onClick={onClose}
        ></nldd-button>
      </nldd-title>

      {prompts.length === 0 ? (
        <nldd-card>
          <nldd-container padding="32">
            <nldd-inline-dialog text="Geen prompts in deze groep."></nldd-inline-dialog>
          </nldd-container>
        </nldd-card>
      ) : (
        <nldd-container layout="grid" gap="16" column-count={1} md-column-count={2} lg-column-count={3}>
          {enriched.map((p) => (
            <PromptCard
              key={p.id}
              prompt={p}
              author={p.created_by_user ? authors[p.created_by_user] : null}
            />
          ))}
        </nldd-container>
      )}
    </nldd-container>
  );
}
