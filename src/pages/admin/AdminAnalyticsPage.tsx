import { useEffect, useMemo, useState } from 'react';
import { Download, FileJson, Activity } from '@/components/common/icons';
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
import {
  actionCounts,
  behaviorLogsToCsv,
  behaviorLogsToJson,
  completionRate,
  listBehaviorLogs,
  sessionCount,
} from '@/services/behaviorService';
import { downloadText } from '@/lib/download';
import { formatDate } from '@/lib/utils';
import type { AnalyticsEvent, BehaviorLog } from '@/types';
import StackTable from '@/components/common/StackTable';

const EVENT_LABELS: Record<string, string> = {
  prompt_created: 'Prompt aangemaakt',
  search: 'Zoekopdracht',
  optimization_run: 'Optimalisatie',
  share_created: 'Deel-link',
  share_viewed: 'Deel-weergave',
  favorite_toggled: 'Favoriet',
};

/** Leesbare NL-labels voor de gedragslog-acties. */
const ACTION_LABELS: Record<string, string> = {
  session_started: 'Sessie gestart',
  plan_generated: 'Plan opgesteld',
  plan_edited: 'Plan aangepast',
  build_started: 'Bouw gestart',
  step_started: 'Stap gestart',
  analyze_run: 'Stap geanalyseerd',
  gaps_shown: 'Hiaten getoond',
  clarification_added: 'Aanvulling gegeven',
  document_uploaded: 'Document geüpload',
  persona_ai_filled: 'Persona gebruikt',
  fewshot_example_generated: 'Voorbeeld gegenereerd',
  fewshot_extracted: 'Few-shot geanalyseerd',
  meta_built: 'Meta-prompt gebouwd',
  interview_question: 'Interview-vraag',
  interview_answer: 'Interview-antwoord',
  interview_finished: 'Interview afgerond',
  step_committed: 'Stap vastgelegd',
  step_regenerated: 'Stap opnieuw gedaan',
  compose_run: 'Prompt samengesteld',
  template_copied: 'Prompt gekopieerd',
  template_saved: 'Prompt opgeslagen',
  executed: 'Prompt uitgevoerd',
  unclear_rejected: 'Onduidelijke invoer',
  step_error: 'Stap-fout',
  cleared: 'Afgebroken/gewist',
};

const actionLabel = (a: string) => ACTION_LABELS[a] ?? a;

export default function AdminAnalyticsPage() {
  const { techniqueById } = useReferenceData();
  const [events, setEvents] = useState<AnalyticsEvent[]>([]);
  const [logs, setLogs] = useState<BehaviorLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([listEvents(), listBehaviorLogs().catch(() => [])])
      .then(([ev, lg]) => {
        setEvents(ev);
        setLogs(lg);
      })
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

  // Gedragslog-aggregaties.
  const actions = useMemo(() => actionCounts(logs, actionLabel), [logs]);
  const sessions = useMemo(() => sessionCount(logs), [logs]);
  const completion = useMemo(() => completionRate(logs), [logs]);

  function exportEventsCsv() {
    downloadText('analytics-events.csv', eventsToCsv(events), 'text/csv');
  }
  function exportBehaviorCsv() {
    downloadText('gedragslog.csv', behaviorLogsToCsv(logs), 'text/csv');
  }
  function exportBehaviorJson() {
    downloadText('gedragslog.json', behaviorLogsToJson(logs), 'application/json');
  }

  if (loading) return <div className="skeleton h-64 w-full rounded-xl" />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-rijksblauw-700 dark:text-rijksblauw-200">Analytics</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {events.length} events · {logs.length} gedragslog-regels · {sessions} sessies
          </p>
        </div>
        <button className="opl-btn-secondary" onClick={exportEventsCsv} disabled={events.length === 0}>
          <Download size={16} /> Events (CSV)
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <PieChartCard title="Events per type" data={byType} />
        <BarChartCard title="Meest gebruikte technieken" data={techniqueData} />
      </div>
      <LineChartCard title="Activiteit (laatste 30 dagen)" data={trend} />

      {/* --- Uitgebreide gedragslog van de prompt-bouwer --- */}
      <div className="space-y-4 rounded-2xl border border-slate-200 p-5 dark:border-slate-700">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold text-rijksblauw-700 dark:text-rijksblauw-200">
              <Activity size={18} /> Gedragslog prompt-bouwer
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Fijnmazige log van het verloop per sessie; bedoeld om te exporteren en door een AI te
              laten analyseren voor verbeteringen.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="opl-btn-secondary" onClick={exportBehaviorCsv} disabled={logs.length === 0}>
              <Download size={16} /> Gedragslog (CSV)
            </button>
            <button className="opl-btn-secondary" onClick={exportBehaviorJson} disabled={logs.length === 0}>
              <FileJson size={16} /> Gedragslog (JSON)
            </button>
          </div>
        </div>

        {logs.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-500">
            Nog geen gedragslog. Deze vult zich zodra iemand de prompt-bouwer gebruikt.
          </p>
        ) : (
          <>
            {/* Kerncijfers. */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile label="Sessies" value={String(sessions)} />
              <StatTile label="Voltooid" value={String(completion.completed)} />
              <StatTile
                label="Voltooiingsgraad"
                value={`${Math.round(completion.rate * 100)}%`}
                hint={`${completion.completed} van ${completion.started}`}
              />
              <StatTile label="Logregels" value={String(logs.length)} />
            </div>

            <BarChartCard title="Acties in de bouwer" data={actions} />

            {/* Recente logregels. */}
            <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                Recente gedragsregels
              </h3>
              <div className="max-h-96 overflow-auto rounded-lg border border-slate-200 dark:border-slate-700">
                <StackTable>
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                    <tr>
                      <th className="px-3 py-2 font-medium">Tijd</th>
                      <th className="px-3 py-2 font-medium">Gebruiker</th>
                      <th className="px-3 py-2 font-medium">Actie</th>
                      <th className="px-3 py-2 font-medium">Stap</th>
                      <th className="px-3 py-2 font-medium">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {logs.slice(0, 200).map((l) => (
                      <tr key={l.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="whitespace-nowrap px-3 py-1.5 text-slate-500 dark:text-slate-400">
                          {formatDate(l.created_at)}
                        </td>
                        <td className="px-3 py-1.5 text-slate-600 dark:text-slate-300">
                          {l.user_identifier || '—'}
                        </td>
                        <td className="px-3 py-1.5 font-medium text-slate-700 dark:text-slate-200">
                          {actionLabel(l.action)}
                        </td>
                        <td className="px-3 py-1.5 text-slate-500 dark:text-slate-400">
                          {l.step_index == null ? '—' : l.step_index + 1}
                        </td>
                        <td className="px-3 py-1.5 font-mono text-[0.6875rem] text-slate-400 dark:text-slate-500">
                          {l.metadata && Object.keys(l.metadata).length > 0
                            ? JSON.stringify(l.metadata)
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </StackTable>
              </div>
              {logs.length > 200 && (
                <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                  Eerste 200 van {logs.length} regels getoond. Exporteer voor de volledige log.
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Klein kerncijfer-blok. */
function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-0.5 text-xl font-bold text-rijksblauw-700 dark:text-rijksblauw-200">{value}</p>
      {hint && <p className="text-[0.6875rem] text-slate-400 dark:text-slate-500">{hint}</p>}
    </div>
  );
}
