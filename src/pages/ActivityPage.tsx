import { useEffect, useMemo, useState } from 'react';
import { LineChartCard } from '@/components/analytics/Charts';
import { listEvents, eventsPerDay } from '@/services/analyticsService';
import { useReferenceData } from '@/context/ReferenceDataContext';
import { getCurrentUser, formatDate } from '@/lib/utils';
import type { AnalyticsEvent } from '@/types';
import '@nldd/design-system/button';
import '@nldd/design-system/button-group';
import '@nldd/design-system/container';
import '@nldd/design-system/inline-dialog';
import '@nldd/design-system/list';
import '@nldd/design-system/list-item';
import '@nldd/design-system/simple-section';
import '@nldd/design-system/spacer';
import '@nldd/design-system/spacer-cell';
import '@nldd/design-system/text';
import '@nldd/design-system/text-cell';
import '@nldd/design-system/title';

const EVENT_LABELS: Record<string, string> = {
  prompt_created: 'Prompt aangemaakt',
  search: 'Zoekopdracht uitgevoerd',
  optimization_run: 'Prompt geoptimaliseerd',
  share_created: 'Deel-link gemaakt',
  share_viewed: 'Gedeelde prompt bekeken',
  favorite_toggled: 'Favoriet gewijzigd',
};

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <nldd-container gap="4">
      <nldd-text size="display-2">{value}</nldd-text>
      <nldd-text size="sm" color="secondary">{label}</nldd-text>
    </nldd-container>
  );
}

export default function ActivityPage() {
  const { techniqueById } = useReferenceData();
  const [events, setEvents] = useState<AnalyticsEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const user = getCurrentUser();

  useEffect(() => {
    listEvents()
      .then(setEvents)
      .finally(() => setLoading(false));
  }, []);

  const mine = useMemo(
    () => events.filter((e) => e.user_identifier && e.user_identifier === user),
    [events, user],
  );

  const stats = useMemo(() => {
    const count = (type: string) => mine.filter((e) => e.event_type === type).length;
    return {
      created: count('prompt_created'),
      optimized: count('optimization_run'),
      shared: count('share_created'),
      favorites: count('favorite_toggled'),
    };
  }, [mine]);

  const topTechnique = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of mine) {
      if (e.event_type === 'optimization_run' && e.technique_id) {
        counts.set(e.technique_id, (counts.get(e.technique_id) ?? 0) + 1);
      }
    }
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    return top ? techniqueById(top[0])?.name ?? 'Onbekend' : null;
  }, [mine, techniqueById]);

  const trend = useMemo(() => eventsPerDay(mine, 14), [mine]);

  const title = (
    <nldd-title
      slot="header"
      heading-level={1}
      size={3}
      text="Mijn activiteit"
      supporting-text={topTechnique ? `Je meest gebruikte techniek is ${topTechnique}.` : undefined}
    ></nldd-title>
  );

  if (!user) {
    return (
      <nldd-simple-section background="tinted">
        {title}
        <nldd-inline-dialog
          icon="line-chart"
          horizontal-alignment="left"
          heading-level={2}
          text="Stel eerst je naam in"
          supporting-text="Kies Stel je naam in in het accountmenu. Daarna verschijnt hier je persoonlijke activiteit."
        ></nldd-inline-dialog>
      </nldd-simple-section>
    );
  }

  if (loading) {
    return (
      <nldd-simple-section background="tinted">
        {title}
        <nldd-inline-dialog variant="loading" text="Activiteit laden"></nldd-inline-dialog>
      </nldd-simple-section>
    );
  }

  return (
    <>
      <nldd-simple-section background="tinted">
        {title}
        <nldd-container layout="grid" gap="12" sm-gap="8" column-count={4} sm-column-count={2}>
          <Stat label="Prompts aangemaakt" value={stats.created} />
          <Stat label="Optimalisaties" value={stats.optimized} />
          <Stat label="Gedeeld" value={stats.shared} />
          <Stat label="Favoriet-wijzigingen" value={stats.favorites} />
        </nldd-container>
        <nldd-spacer size="24"></nldd-spacer>
        <LineChartCard
          title="Jouw activiteit (laatste 14 dagen)"
          data={trend}
          emptyHint="Nog geen activiteit geregistreerd."
        />
      </nldd-simple-section>

      <nldd-simple-section background="tinted" padding-top="0">
        <nldd-title slot="header" heading-level={2} size={4} text="Recente activiteit"></nldd-title>
        {mine.length === 0 ? (
          <nldd-inline-dialog icon="clock" horizontal-alignment="left" text="Nog geen activiteit">
            <nldd-button-group slot="actions">
              <nldd-button appearance="primary" href="/genereren" text="Maak een prompt"></nldd-button>
            </nldd-button-group>
          </nldd-inline-dialog>
        ) : (
          <nldd-list appearance="box-base" accessible-label="Recente activiteit">
            {mine.slice(0, 20).map((e) => (
              <nldd-list-item key={e.id} size="sm">
                <nldd-text-cell text={EVENT_LABELS[e.event_type] ?? e.event_type}></nldd-text-cell>
                <nldd-spacer-cell size="12"></nldd-spacer-cell>
                <nldd-text-cell width="fit-content" size="sm" color="secondary" text={formatDate(e.created_at)}></nldd-text-cell>
              </nldd-list-item>
            ))}
          </nldd-list>
        )}
      </nldd-simple-section>
    </>
  );
}
