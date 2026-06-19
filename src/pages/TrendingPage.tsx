import { useEffect, useMemo, useState } from 'react';
import { TrendingUp, Flame } from 'lucide-react';
import PromptCard from '@/components/prompts/PromptCard';
import { BarChartCard } from '@/components/analytics/Charts';
import { SkeletonGrid } from '@/components/common/Skeleton';
import { listPrompts } from '@/services/repository';
import { listEvents, topTechniques } from '@/services/analyticsService';
import { useReferenceData } from '@/context/ReferenceDataContext';
import type { AnalyticsEvent, Prompt } from '@/types';

export default function TrendingPage() {
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

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-center gap-2">
        <Flame className="text-rijksoranje" />
        <h1 className="text-2xl font-bold text-rijksblauw-700 dark:text-rijksblauw-200">Trending</h1>
      </div>

      {loading ? (
        <SkeletonGrid count={6} />
      ) : (
        <div className="space-y-8">
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-slate-700 dark:text-slate-200">
              <TrendingUp size={18} /> Populairste prompts
            </h2>
            {trending.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">Nog te weinig activiteit om trends te tonen.</p>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {trending.map((p) => (
                  <PromptCard
                    key={p.id}
                    prompt={p}
                    onChanged={(u) => setPrompts((prev) => prev.map((x) => (x.id === u.id ? u : x)))}
                  />
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-slate-700 dark:text-slate-200">Meest gebruikte technieken</h2>
            <BarChartCard
              title="Optimalisaties per techniek"
              data={techniqueData}
              emptyHint="Voer optimalisaties uit om trends te zien."
            />
          </section>
        </div>
      )}
    </div>
  );
}
