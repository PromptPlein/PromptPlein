import { useEffect, useMemo, useState } from 'react';
import { BarChartCard, KeyFigure, LineChartCard, PieChartCard } from '@/components/analytics/Charts';
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

  const title = 'Analytics';
  const intro = `${events.length} events · ${logs.length} gedragslog-regels · ${sessions} sessies`;

  if (loading) {
    return (
      <nldd-container layout="stack" gap="24">
        <nldd-title heading-level={1} size={2} text={title}></nldd-title>
        <nldd-container min-height="16rem">
          <nldd-activity-indicator></nldd-activity-indicator>
        </nldd-container>
      </nldd-container>
    );
  }

  return (
    <nldd-container layout="stack" gap="24">
      <nldd-container gap="16">
        <nldd-title heading-level={1} size={2} text={title} supporting-text={intro}></nldd-title>
        <nldd-button-group>
          <nldd-button
            appearance="secondary"
            start-icon="download"
            text="Events (CSV)"
            disabled={events.length === 0 || undefined}
            onClick={exportEventsCsv}
          ></nldd-button>
        </nldd-button-group>
      </nldd-container>

      <LineChartCard
        title="Activiteit (laatste 30 dagen)"
        data={trend}
        emptyHint="Activiteit verschijnt hier zodra de app gebruikt wordt."
      />
      <nldd-container layout="grid" gap="16" column-count={1} md-column-count={2}>
        <PieChartCard title="Events per type" data={byType} />
        <BarChartCard title="Meest gebruikte technieken" data={techniqueData} />
      </nldd-container>

      {/* Detailed behavior log of the prompt builder. */}
      <nldd-container gap="16">
        <nldd-title
          heading-level={2}
          size={4}
          text="Gedragslog prompt-bouwer"
          supporting-text="Fijnmazige log van het verloop per sessie, bedoeld om te exporteren en door een AI te laten analyseren voor verbeteringen."
        ></nldd-title>
        <nldd-button-group>
          <nldd-button
            appearance="secondary"
            start-icon="download"
            text="Gedragslog (CSV)"
            disabled={logs.length === 0 || undefined}
            onClick={exportBehaviorCsv}
          ></nldd-button>
          <nldd-button
            appearance="secondary"
            start-icon="file-text"
            text="Gedragslog (JSON)"
            disabled={logs.length === 0 || undefined}
            onClick={exportBehaviorJson}
          ></nldd-button>
        </nldd-button-group>

        {logs.length === 0 ? (
          <nldd-card>
            <nldd-container padding="24" sm-padding="16">
              <nldd-inline-dialog
                icon="file-text"
                icon-color="secondary"
                text="Nog geen gedragslog"
                supporting-text="Deze vult zich zodra iemand de prompt-bouwer gebruikt."
              ></nldd-inline-dialog>
            </nldd-container>
          </nldd-card>
        ) : (
          <>
            <nldd-container layout="grid" gap="16" column-count={2} md-column-count={4}>
              <KeyFigure label="Sessies" value={sessions} />
              <KeyFigure label="Voltooid" value={completion.completed} />
              <KeyFigure
                label="Voltooiingsgraad"
                value={`${Math.round(completion.rate * 100)}%`}
                hint={`${completion.completed} van ${completion.started}`}
              />
              <KeyFigure label="Logregels" value={logs.length} />
            </nldd-container>

            <BarChartCard title="Acties in de bouwer" data={actions} headingLevel={3} />

            <nldd-container gap="8">
              <nldd-title heading-level={3} size={5} text="Recente gedragsregels"></nldd-title>
              <nldd-table
                accessible-label="Recente gedragsregels"
                columns="minmax(7rem, auto) minmax(6rem, 1fr) minmax(8rem, 1fr) 3rem minmax(10rem, 2fr)"
                sm-columns="minmax(6rem, auto) 1fr"
              >
                <nldd-table-row slot="header">
                  <nldd-text-cell size="sm" text="Tijd"></nldd-text-cell>
                  <nldd-text-cell size="sm" text="Gebruiker" hide-below="md"></nldd-text-cell>
                  <nldd-text-cell size="sm" text="Actie"></nldd-text-cell>
                  <nldd-text-cell size="sm" text="Stap" hide-below="md"></nldd-text-cell>
                  <nldd-text-cell size="sm" text="Details" hide-below="md"></nldd-text-cell>
                </nldd-table-row>
                {logs.slice(0, 200).map((l) => (
                  <nldd-table-row key={l.id}>
                    <nldd-text-cell size="sm" color="secondary" text={formatDate(l.created_at)}></nldd-text-cell>
                    <nldd-text-cell size="sm" hide-below="md" text={l.user_identifier || '—'}></nldd-text-cell>
                    <nldd-text-cell
                      size="sm"
                      hide-above="sm"
                      text={actionLabel(l.action)}
                      supporting-text={l.user_identifier || '—'}
                    ></nldd-text-cell>
                    <nldd-text-cell size="sm" hide-below="md" text={actionLabel(l.action)}></nldd-text-cell>
                    <nldd-text-cell
                      size="sm"
                      color="secondary"
                      hide-below="md"
                      text={l.step_index == null ? '—' : String(l.step_index + 1)}
                    ></nldd-text-cell>
                    <nldd-text-cell size="sm" color="secondary" hide-below="md">
                      {l.metadata && Object.keys(l.metadata).length > 0 ? (
                        <code>{JSON.stringify(l.metadata)}</code>
                      ) : (
                        '—'
                      )}
                    </nldd-text-cell>
                  </nldd-table-row>
                ))}
              </nldd-table>
              {logs.length > 200 && (
                <nldd-text size="xs" color="secondary">
                  Eerste 200 van {logs.length} regels getoond. Exporteer voor de volledige log.
                </nldd-text>
              )}
            </nldd-container>
          </>
        )}
      </nldd-container>
    </nldd-container>
  );
}
