import { useEffect, useMemo, useState } from 'react';
import { FileText, Users, Sparkles, Share2 } from 'lucide-react';
import { BarChartCard, LineChartCard } from '@/components/analytics/Charts';
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

const EVENT_LABELS: Record<string, string> = {
  prompt_created: 'Prompt aangemaakt',
  search: 'Zoekopdracht',
  optimization_run: 'Optimalisatie',
  share_created: 'Deel-link gemaakt',
  share_viewed: 'Deel-link bekeken',
  favorite_toggled: 'Favoriet gewijzigd',
};

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
}) {
  return (
    <div className="opl-card flex items-center gap-4 p-5">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-rijksblauw-50 text-rijksblauw-500 dark:bg-rijksblauw-500/15">
        {icon}
      </span>
      <div>
        <p className="text-2xl font-bold text-rijksblauw-700 dark:text-rijksblauw-200">{value}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      </div>
    </div>
  );
}

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
    return <div className="skeleton h-64 w-full rounded-xl" />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-rijksblauw-700 dark:text-rijksblauw-200">Admin-dashboard</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">Overzicht van gebruik en activiteit.</p>
      </div>

      <SystemStatus />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={<FileText size={20} />} label="Totaal prompts" value={prompts.length} />
        <StatCard icon={<Users size={20} />} label="Unieke gebruikers" value={uniqueUsers(events)} />
        <StatCard
          icon={<Sparkles size={20} />}
          label="Optimalisaties"
          value={eventCounts.optimization_run}
        />
        <StatCard icon={<Share2 size={20} />} label="Deel-links" value={eventCounts.share_created} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BarChartCard
          title="Meest gebruikte technieken"
          data={techniqueData}
          emptyHint="Voer optimalisaties uit om data te zien."
        />
        <BarChartCard title="Prompts per categorie" data={categoryData} />
      </div>

      <LineChartCard title="Activiteit (laatste 14 dagen)" data={trend} />

      <div className="opl-card p-5">
        <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Recente activiteit</h3>
        {recent.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-500">Nog geen activiteit geregistreerd.</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-700">
            {recent.map((e) => (
              <li key={e.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-slate-700 dark:text-slate-200">
                  <span className="font-medium">{e.user_identifier || 'Anoniem'}</span>{' '}
                  · {EVENT_LABELS[e.event_type] ?? e.event_type}
                </span>
                <span className="text-xs text-slate-400 dark:text-slate-500">{formatDate(e.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
