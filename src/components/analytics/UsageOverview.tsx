import { useEffect, useMemo, useState } from 'react';
import { Download, Users } from '@/components/common/icons';
import { BarChartCard, MultiLineChartCard, type LineSeries } from '@/components/analytics/Charts';
import StackTable from '@/components/common/StackTable';
import { getUsageReport, type UsageDay, type UsageReport } from '@/services/analyticsService';
import { downloadText } from '@/lib/download';
import { nadruk, rijksblauw } from '@/config/brandColors';

const PERIODS = [7, 30, 90] as const;

const nf = new Intl.NumberFormat('nl-NL');
const n = (v: number) => nf.format(v);

function dayLabel(dag: string, long = false): string {
  const d = new Date(`${dag}T12:00:00`);
  return d.toLocaleDateString('nl-NL', long ? { weekday: 'short', day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short' });
}

const VISITOR_SERIES: LineSeries[] = [
  { key: 'bezoekers', label: 'Alle bezoekers', color: rijksblauw[700] },
  { key: 'ingelogd', label: 'Ingelogd', color: rijksblauw[400] },
  { key: 'anoniem', label: 'Zonder account', color: nadruk },
];

const ACTIVITY_SERIES: LineSeries[] = [
  { key: 'ai_aanroepen', label: 'AI-aanroepen', color: rijksblauw[700] },
  { key: 'chatberichten', label: 'Chatberichten', color: rijksblauw[400] },
  { key: 'prompts_gemaakt', label: 'Prompts gemaakt', color: nadruk },
];

function sum(days: UsageDay[], key: keyof UsageDay): number {
  return days.reduce((total, d) => total + (Number(d[key]) || 0), 0);
}

/** Gebruik per dag: wie er was, wat er gebeurde en hoe vaak er een taalmodel draaide. */
export default function UsageOverview() {
  const [days, setDays] = useState<(typeof PERIODS)[number]>(30);
  const [report, setReport] = useState<UsageReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getUsageReport(days)
      .then((r) => {
        if (!cancelled) setReport(r);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const message = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
        setError(
          /admin_usage_daily|schema cache|does not exist/i.test(message)
            ? 'De telling staat nog niet in de database. Voer migratie 0066 uit.'
            : 'Het gebruik kon niet worden opgehaald.',
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [days]);

  const dagen = useMemo(() => report?.dagen ?? [], [report]);
  const vandaag = dagen[dagen.length - 1];
  const chartData = useMemo(() => dagen.map((d) => ({ ...d, label: dayLabel(d.dag) })), [dagen]);
  const perMode = useMemo(
    () => (report?.ai_per_mode ?? []).slice(0, 12).map((m) => ({ label: m.mode, value: m.aantal })),
    [report],
  );
  const newestFirst = useMemo(() => [...dagen].reverse(), [dagen]);

  function exportCsv() {
    const cols: (keyof UsageDay)[] = [
      'dag', 'bezoekers', 'ingelogd', 'anoniem', 'aanmeldingen', 'chatberichten', 'chatters',
      'prompts_gemaakt', 'prompts_opgeslagen', 'word', 'excel', 'projecten', 'zoekopdrachten',
      'ai_aanroepen', 'ai_mislukt',
    ];
    const rows = dagen.map((d) => cols.map((c) => String(d[c])).join(','));
    downloadText(`gebruik-${days}-dagen.csv`, [cols.join(','), ...rows].join('\n'), 'text/csv');
  }

  return (
    <section aria-labelledby="gebruik-kop" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="gebruik-kop" className="flex items-center gap-2 text-lg font-bold text-rijksblauw-700 dark:text-rijksblauw-200">
            <Users size={18} aria-hidden="true" /> Gebruik per dag
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Bezoekers met en zonder account, wat ze doen en hoe vaak er een taalmodel draait.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div role="group" aria-label="Periode" className="flex overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
            {PERIODS.map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={days === p}
                onClick={() => setDays(p)}
                className={`px-3 py-1.5 text-sm ${
                  days === p
                    ? 'bg-rijksblauw-700 text-white'
                    : 'bg-white text-slate-600 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                {p} dagen
              </button>
            ))}
          </div>
          <button className="opl-btn-secondary" onClick={exportCsv} disabled={dagen.length === 0}>
            <Download size={16} /> Per dag (CSV)
          </button>
        </div>
      </div>

      {loading && !report ? (
        <div className="skeleton h-48 w-full rounded-xl" />
      ) : error ? (
        <p className="rounded-lg border border-slate-200 p-4 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300">
          {error}
        </p>
      ) : !report ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Alleen beschikbaar met de database.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile
              label="Bezoekers vandaag"
              value={n(vandaag?.bezoekers ?? 0)}
              hint={`${n(vandaag?.ingelogd ?? 0)} ingelogd, ${n(vandaag?.anoniem ?? 0)} zonder account`}
            />
            <Tile
              label="Gemiddeld per dag"
              value={n(Math.round(sum(dagen, 'bezoekers') / Math.max(1, dagen.length)))}
              hint={`bezoekers, laatste ${days} dagen`}
            />
            <Tile
              label="Aanmeldingen"
              value={n(sum(dagen, 'aanmeldingen'))}
              hint={`${n(report.gebruikers_totaal)} accounts in totaal`}
            />
            <Tile
              label="AI-aanroepen"
              value={n(sum(dagen, 'ai_aanroepen'))}
              hint={`${n(sum(dagen, 'ai_mislukt'))} mislukt, vandaag ${n(vandaag?.ai_aanroepen ?? 0)}`}
            />
            <Tile label="Chatberichten" value={n(sum(dagen, 'chatberichten'))} hint={`vandaag ${n(vandaag?.chatberichten ?? 0)}`} />
            <Tile
              label="Prompts gemaakt"
              value={n(sum(dagen, 'prompts_gemaakt'))}
              hint={`${n(sum(dagen, 'prompts_opgeslagen'))} opgeslagen`}
            />
            <Tile label="Word en Excel" value={n(sum(dagen, 'word') + sum(dagen, 'excel'))} hint={`${n(sum(dagen, 'word'))} Word, ${n(sum(dagen, 'excel'))} Excel`} />
            <Tile label="Projecten" value={n(sum(dagen, 'projecten'))} hint="nieuw aangemaakt" />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <MultiLineChartCard title="Bezoekers per dag" data={chartData} series={VISITOR_SERIES} />
            <MultiLineChartCard title="Activiteit per dag" data={chartData} series={ACTIVITY_SERIES} />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <BarChartCard title="AI-aanroepen per onderdeel" data={perMode} emptyHint="Nog geen aanroepen gemeten." />
            <div className="opl-card p-5">
              <h3 className="mb-1 text-sm font-semibold text-slate-700 dark:text-slate-200">AI-aanroepen per model</h3>
              <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
                {n(report.ai_ingelogd)} van ingelogde gebruikers, {n(report.ai_anoniem)} zonder account.
              </p>
              {report.ai_per_model.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">Nog geen aanroepen gemeten.</p>
              ) : (
                <StackTable>
                  <table className="w-full text-left text-sm">
                    <thead className="text-xs text-slate-500 dark:text-slate-400">
                      <tr>
                        <th className="py-1.5 pr-3 font-medium">Model</th>
                        <th className="py-1.5 pr-3 font-medium">Soort</th>
                        <th className="py-1.5 pr-3 text-right font-medium">Aanroepen</th>
                        <th className="py-1.5 text-right font-medium">Mislukt</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {report.ai_per_model.map((m) => (
                        <tr key={`${m.provider}-${m.model}-${m.soort}`}>
                          <td className="py-1.5 pr-3 text-slate-700 dark:text-slate-200">
                            {m.model ?? 'onbekend'} <span className="text-slate-500 dark:text-slate-400">({m.provider})</span>
                          </td>
                          <td className="py-1.5 pr-3 text-slate-600 dark:text-slate-300">{m.soort}</td>
                          <td className="py-1.5 pr-3 text-right tabular-nums">{n(m.aantal)}</td>
                          <td className="py-1.5 text-right tabular-nums">{n(m.mislukt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </StackTable>
              )}
            </div>
          </div>

          <div className="opl-card p-5">
            <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Per dag</h3>
            <div className="max-h-[28rem] overflow-auto">
              <StackTable>
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-white text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                    <tr>
                      <th className="py-1.5 pr-3 font-medium">Dag</th>
                      <th className="py-1.5 pr-3 text-right font-medium">Bezoekers</th>
                      <th className="py-1.5 pr-3 text-right font-medium">Ingelogd</th>
                      <th className="py-1.5 pr-3 text-right font-medium">Zonder account</th>
                      <th className="py-1.5 pr-3 text-right font-medium">Aanmeldingen</th>
                      <th className="py-1.5 pr-3 text-right font-medium">Chatberichten</th>
                      <th className="py-1.5 pr-3 text-right font-medium">Prompts gemaakt</th>
                      <th className="py-1.5 pr-3 text-right font-medium">Word</th>
                      <th className="py-1.5 pr-3 text-right font-medium">Excel</th>
                      <th className="py-1.5 pr-3 text-right font-medium">Projecten</th>
                      <th className="py-1.5 text-right font-medium">AI-aanroepen</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {newestFirst.map((d) => (
                      <tr key={d.dag}>
                        <td className="whitespace-nowrap py-1.5 pr-3 text-slate-700 dark:text-slate-200">{dayLabel(d.dag, true)}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{n(d.bezoekers)}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{n(d.ingelogd)}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{n(d.anoniem)}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{n(d.aanmeldingen)}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">
                          {n(d.chatberichten)}
                          {d.chatters > 0 && <span className="text-slate-500 dark:text-slate-400"> ({n(d.chatters)} pers.)</span>}
                        </td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{n(d.prompts_gemaakt)}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{n(d.word)}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{n(d.excel)}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{n(d.projecten)}</td>
                        <td className="py-1.5 text-right tabular-nums">
                          {n(d.ai_aanroepen)}
                          {d.ai_mislukt > 0 && <span className="text-slate-500 dark:text-slate-400"> ({n(d.ai_mislukt)} mislukt)</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </StackTable>
            </div>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Bezoekers tellen per browser per dag; wie op twee apparaten werkt, telt twee keer. Projecten die
              leeg bleven en weer verdwenen, tellen niet mee.
            </p>
          </div>
        </>
      )}
    </section>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-0.5 text-xl font-bold text-rijksblauw-700 dark:text-rijksblauw-200">{value}</p>
      {hint && <p className="text-[0.6875rem] text-slate-500 dark:text-slate-400">{hint}</p>}
    </div>
  );
}
