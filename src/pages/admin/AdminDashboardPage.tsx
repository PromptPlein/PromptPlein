import { useEffect, useMemo, useState } from 'react';
import { BarChartCard, KeyFigure, LineChartCard } from '@/components/analytics/Charts';
import SystemStatus from '@/components/admin/SystemStatus';
import { useReferenceData } from '@/context/ReferenceDataContext';
import { listPrompts } from '@/services/repository';
import {
  countByEventType,
  eventsPerDay,
  listEvents,
  topTechniques,
  uniqueUsers,
  type CountByLabel,
} from '@/services/analyticsService';
import type { AnalyticsEvent, Prompt } from '@/types';
import { formatDate } from '@/lib/utils';
import '@nldd/design-system/activity-indicator';
import '@nldd/design-system/card';
import '@nldd/design-system/container';
import '@nldd/design-system/inline-dialog';
import '@nldd/design-system/list';
import '@nldd/design-system/list-item';
import '@nldd/design-system/text-cell';
import '@nldd/design-system/title';

const EVENT_LABELS: Record<string, string> = {
  prompt_created: 'Prompt aangemaakt',
  search: 'Zoekopdracht',
  optimization_run: 'Optimalisatie',
  share_created: 'Deel-link gemaakt',
  share_viewed: 'Deel-link bekeken',
  favorite_toggled: 'Favoriet gewijzigd',
};

const PAGE_TITLE = 'Admin-dashboard';
const PAGE_INTRO = 'Overzicht van gebruik en activiteit.';

export default function AdminDashboardPage() {
  const { categoryById, techniqueById } = useReferenceData();
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

  const eventCounts = useMemo(() => countByEventType(events), [events]);

  const techniqueData = useMemo(
    () => topTechniques(events, (id) => techniqueById(id)?.name ?? 'Onbekend'),
    [events, techniqueById],
  );

  const categoryData = useMemo<CountByLabel[]>(() => {
    const counts = new Map<string, number>();
    for (const p of prompts) {
      if (p.category_id) counts.set(p.category_id, (counts.get(p.category_id) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([id, value]) => ({ label: categoryById(id)?.name ?? 'Onbekend', value }))
      .sort((a, b) => b.value - a.value);
  }, [prompts, categoryById]);

  const trend = useMemo(() => eventsPerDay(events), [events]);
  const recent = events.slice(0, 12);

  if (loading) {
    return (
      <nldd-container layout="stack" gap="24">
        <nldd-title heading-level={1} size={3} text={PAGE_TITLE} supporting-text={PAGE_INTRO}></nldd-title>
        <nldd-container min-height="16rem">
          <nldd-activity-indicator></nldd-activity-indicator>
        </nldd-container>
      </nldd-container>
    );
  }

  return (
    <nldd-container layout="stack" gap="24">
      <nldd-title heading-level={1} size={3} text={PAGE_TITLE} supporting-text={PAGE_INTRO}></nldd-title>

      <nldd-container layout="grid" gap="16" column-count={2} md-column-count={4}>
        <KeyFigure label="Prompts" value={prompts.length} />
        <KeyFigure label="Unieke gebruikers" value={uniqueUsers(events)} />
        <KeyFigure label="Optimalisaties" value={eventCounts.optimization_run} />
        <KeyFigure label="Deel-links" value={eventCounts.share_created} />
      </nldd-container>

      <LineChartCard title="Activiteit (laatste 14 dagen)" data={trend} emptyHint="Activiteit verschijnt hier zodra de app gebruikt wordt." />

      <nldd-container layout="grid" gap="16" column-count={1} md-column-count={2}>
        <BarChartCard
          title="Meest gebruikte technieken"
          data={techniqueData}
          emptyHint="Voer optimalisaties uit om data te zien."
        />
        <BarChartCard title="Prompts per categorie" data={categoryData} />
      </nldd-container>

      <nldd-card>
        <nldd-container padding="24" sm-padding="16" gap="16">
          <nldd-title heading-level={2} size={5} text="Recente activiteit"></nldd-title>
          {recent.length === 0 ? (
            <nldd-container padding-block="16">
              <nldd-inline-dialog icon="clock" icon-color="secondary" text="Nog geen activiteit geregistreerd"></nldd-inline-dialog>
            </nldd-container>
          ) : (
            <nldd-list accessible-label="Recente activiteit">
              {recent.map((e) => (
                <nldd-list-item key={e.id} size="sm">
                  <nldd-text-cell
                    text={`**${e.user_identifier || 'Anoniem'}** · ${EVENT_LABELS[e.event_type] ?? e.event_type}`}
                  ></nldd-text-cell>
                  <nldd-text-cell
                    width="fit-content"
                    horizontal-alignment="right"
                    color="secondary"
                    text={formatDate(e.created_at)}
                  ></nldd-text-cell>
                </nldd-list-item>
              ))}
            </nldd-list>
          )}
        </nldd-container>
      </nldd-card>

      <SystemStatus />
    </nldd-container>
  );
}
