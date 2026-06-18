import { useEffect, useMemo, useState } from 'react';
import { Activity, FileText, Sparkles, Share2, Star } from 'lucide-react';
import { LineChartCard } from '@/components/analytics/Charts';
import { listEvents, eventsPerDay } from '@/services/analyticsService';
import { useReferenceData } from '@/context/ReferenceDataContext';
import { getCurrentUser, formatDate } from '@/lib/utils';
import type { AnalyticsEvent } from '@/types';

const EVENT_LABELS: Record<string, string> = {
  prompt_created: 'Prompt aangemaakt',
  search: 'Zoekopdracht uitgevoerd',
  optimization_run: 'Prompt geoptimaliseerd',
  share_created: 'Deel-link gemaakt',
  share_viewed: 'Gedeelde prompt bekeken',
  favorite_toggled: 'Favoriet gewijzigd',
};

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="opl-card flex items-center gap-3 p-4">
      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-rijksblauw-50 text-rijksblauw-500">
        {icon}
      </span>
      <div>
        <p className="text-xl font-bold text-rijksblauw-700">{value}</p>
        <p className="text-xs text-slate-500">{label}</p>
      </div>
    </div>
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

  if (!user) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <Activity size={40} className="mx-auto mb-3 text-slate-300" />
        <h1 className="text-xl font-bold text-rijksblauw-700">Stel eerst je naam in</h1>
        <p className="mt-2 text-sm text-slate-600">
          Klik rechtsboven op het profiel-icoon om je naam in te stellen. Daarna verschijnt hier je
          persoonlijke activiteit.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-center gap-2">
        <Activity className="text-rijksblauw-500" />
        <h1 className="text-2xl font-bold text-rijksblauw-700">Mijn activiteit</h1>
      </div>

      {loading ? (
        <div className="skeleton h-64 w-full rounded-xl" />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat icon={<FileText size={18} />} label="Prompts aangemaakt" value={stats.created} />
            <Stat icon={<Sparkles size={18} />} label="Optimalisaties" value={stats.optimized} />
            <Stat icon={<Share2 size={18} />} label="Gedeeld" value={stats.shared} />
            <Stat icon={<Star size={18} />} label="Favoriet-wijzigingen" value={stats.favorites} />
          </div>

          {topTechnique && (
            <div className="opl-card p-4 text-sm text-slate-600">
              Je meest gebruikte techniek is{' '}
              <span className="font-semibold text-rijksblauw-700">{topTechnique}</span>.
            </div>
          )}

          <LineChartCard
            title="Jouw activiteit (laatste 14 dagen)"
            data={trend}
            emptyHint="Nog geen activiteit geregistreerd."
          />

          <div className="opl-card p-5">
            <h3 className="mb-3 text-sm font-semibold text-slate-700">Recente activiteit</h3>
            {mine.length === 0 ? (
              <p className="text-sm text-slate-400">Nog geen activiteit.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {mine.slice(0, 20).map((e) => (
                  <li key={e.id} className="flex items-center justify-between py-2 text-sm">
                    <span className="text-slate-700">{EVENT_LABELS[e.event_type] ?? e.event_type}</span>
                    <span className="text-xs text-slate-400">{formatDate(e.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
