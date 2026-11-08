import { useEffect, useMemo, useState } from 'react';
import PromptCard from '@/components/prompts/PromptCard';
import { BarChartCard } from '@/components/analytics/Charts';
import { SkeletonGrid } from '@/components/common/Skeleton';
import { listPrompts } from '@/services/repository';
import { listEvents, topTechniques } from '@/services/analyticsService';
import { useReferenceData } from '@/context/ReferenceDataContext';
import { usePromptCommunity } from '@/hooks/usePromptCommunity';
import type { AnalyticsEvent, Prompt } from '@/types';
import '@nldd/design-system/button';
import '@nldd/design-system/button-group';
import '@nldd/design-system/collection';
import '@nldd/design-system/inline-dialog';
import '@nldd/design-system/simple-section';
import '@nldd/design-system/spacer';
import '@nldd/design-system/tab-bar';
import '@nldd/design-system/title';

/** `embedded` leaves out the page header, for use inside another page. */
export default function TrendingPage({ embedded = false }: { embedded?: boolean } = {}) {
  const { techniqueById } = useReferenceData();
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [events, setEvents] = useState<AnalyticsEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([listPrompts(), listEvents()])
      .then(([p, e]) => {
        setPrompts(p);
        setEvents(e);
      })
      .finally(() => setLoading(false));
  }, []);

  // Scoor prompts op interactie (optimalisaties + deelweergaven + favorieten).
  const trending = useMemo(() => {
    const score = new Map<string, number>();
    for (const e of events) {
      if (!e.prompt_id) continue;
      const weight =
        e.event_type === 'share_viewed'
          ? 3
          : e.event_type === 'optimization_run'
            ? 2
            : e.event_type === 'share_created'
              ? 2
              : e.event_type === 'favorite_toggled'
                ? 1
                : 0;
      if (weight) score.set(e.prompt_id, (score.get(e.prompt_id) ?? 0) + weight);
    }
    return [...prompts]
      .map((p) => ({ p, s: score.get(p.id) ?? (p.is_favorite ? 1 : 0) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, 6)
      .map((x) => x.p);
  }, [prompts, events]);

  const techniqueData = useMemo(
    () => topTechniques(events, (id) => techniqueById(id)?.name ?? 'Onbekend'),
    [events, techniqueById],
  );

  const { enriched, authors } = usePromptCommunity(trending);

  const header = embedded ? null : (
    <>
      <nldd-title
        slot="header"
        heading-level={1}
        size={2}
        text="Trending"
        supporting-text="De prompts en technieken waar collega’s nu het meest mee werken."
      ></nldd-title>
      <nldd-tab-bar slot="header" navigation accessible-label="Onderdelen van Community">
        <nldd-tab-bar-item href="/community" text="Community"></nldd-tab-bar-item>
        <nldd-tab-bar-item href="/trending" text="Trending" current></nldd-tab-bar-item>
      </nldd-tab-bar>
    </>
  );

  if (loading) {
    return (
      <nldd-simple-section background="tinted">
        {header}
        <SkeletonGrid count={6} />
      </nldd-simple-section>
    );
  }

  if (trending.length === 0) {
    return (
      <nldd-simple-section background="tinted">
        {header}
        <nldd-inline-dialog
          icon="line-chart"
          horizontal-alignment="left"
          text="Nog te weinig activiteit om trends te tonen"
          supporting-text="Maak en gebruik prompts, dan verschijnen hier de populairste."
        >
          <nldd-button-group slot="actions">
            <nldd-button appearance="primary" href="/genereren" text="Maak een prompt"></nldd-button>
          </nldd-button-group>
        </nldd-inline-dialog>
      </nldd-simple-section>
    );
  }

  return (
    <>
      <nldd-simple-section background="tinted">
        {header}
        <nldd-title heading-level={2} size={4} text="Populairste prompts"></nldd-title>
        <nldd-spacer size="12"></nldd-spacer>
        <nldd-collection item-min-width="18rem">
          {enriched.map((p) => (
            <PromptCard
              key={p.id}
              prompt={p}
              author={p.created_by_user ? authors[p.created_by_user] : null}
              onChanged={(u) => setPrompts((prev) => prev.map((x) => (x.id === u.id ? u : x)))}
            />
          ))}
        </nldd-collection>
      </nldd-simple-section>

      <nldd-simple-section background="tinted" padding-top="0">
        <nldd-title slot="header" heading-level={2} size={4} text="Meest gebruikte technieken"></nldd-title>
        <BarChartCard
          title="Optimalisaties per techniek"
          headingLevel={3}
          data={techniqueData}
          emptyHint="Voer optimalisaties uit om trends te zien."
        />
      </nldd-simple-section>
    </>
  );
}
