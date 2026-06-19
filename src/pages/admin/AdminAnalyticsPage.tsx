import { useEffect, useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { BarChartCard, LineChartCard, PieChartCard } from '@/components/analytics/Charts';
import { useReferenceData } from '@/context/ReferenceDataContext';
import {
  countByEventType,
  eventsPerDay,
  eventsToCsv,
  listEvents,
  topTechniques,
  type CountByLabel,
} from '@/services/analyticsService';
import { downloadText } from '@/lib/download';
import type { AnalyticsEvent } from '@/types';

const EVENT_LABELS: Record<string, string> = {
  prompt_created: 'Prompt aangemaakt',
  search: 'Zoekopdracht',
  optimization_run: 'Optimalisatie',
  share_created: 'Deel-link',
  share_viewed: 'Deel-weergave',
  favorite_toggled: 'Favoriet',
};

export default function AdminAnalyticsPage() {
  const { techniqueById } = useReferenceData();
  const [events, setEvents] = useState<AnalyticsEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listEvents()
      .then(setEvents)
      .finally(() => setLoading(false));
  }, []);

  const byType = useMemo<CountByLabel[]>(() => {
    const counts = countByEventType(events);
    return Object.entries(counts)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => ({ label: EVENT_LABELS[k] ?? k, value: v }));
  }, [events]);

  const techniqueData = useMemo(
    () => topTechniques(events, (id) => techniqueById(id)?.name ?? 'Onbekend'),
    [events, techniqueById],
  );
  const trend = useMemo(() => eventsPerDay(events, 30), [events]);

  function exportCsv() {
    downloadText('analytics-events.csv', eventsToCsv(events), 'text/csv');
  }

  if (loading) return <div className="skeleton h-64 w-full rounded-xl" />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-rijksblauw-700 dark:text-rijksblauw-200">Analytics</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{events.length} geregistreerde events.</p>
        </div>
        <button className="opl-btn-secondary" onClick={exportCsv} disabled={events.length === 0}>
          <Download size={16} /> Exporteer CSV
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <PieChartCard title="Events per type" data={byType} />
        <BarChartCard title="Meest gebruikte technieken" data={techniqueData} />
      </div>
      <LineChartCard title="Activiteit (laatste 30 dagen)" data={trend} />
    </div>
  );
}
