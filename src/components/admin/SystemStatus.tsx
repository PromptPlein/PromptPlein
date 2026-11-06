import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Loader2, RefreshCw } from '@/components/common/icons';
import { isSupabaseConfigured, supabase, getFunctionUrl } from '@/lib/supabase';

type Health = 'ok' | 'warn' | 'error' | 'checking';

interface Check {
  key: string;
  label: string;
  status: Health;
  detail: string;
}

const STATUS_META: Record<Health, { icon: typeof CheckCircle2; classes: string; ring: string }> = {
  ok: { icon: CheckCircle2, classes: 'text-rijksgroen', ring: 'bg-rijksgroen' },
  warn: { icon: AlertTriangle, classes: 'text-rijksoranje', ring: 'bg-rijksoranje' },
  error: { icon: XCircle, classes: 'text-rijksrood', ring: 'bg-rijksrood' },
  checking: { icon: Loader2, classes: 'text-slate-400', ring: 'bg-slate-300' },
};

/**
 * Systeemstatus voor beheerders: controleert of de verbindingen werken
 * (Supabase database + edge-functie). Voor de eindgebruiker is dit niet
 * relevant; daarom staat het alleen in het admin-paneel.
 */
export default function SystemStatus() {
  const [checks, setChecks] = useState<Check[]>(initialChecks);
  const [running, setRunning] = useState(false);

  async function runChecks() {
    setRunning(true);
    setChecks(initialChecks.map((c) => ({ ...c, status: 'checking', detail: 'Bezig met controleren…' })));

    const results: Check[] = [];

    // 1. Configuratie
    results.push({
      key: 'config',
      label: 'Configuratie',
      status: isSupabaseConfigured ? 'ok' : 'warn',
      detail: isSupabaseConfigured
        ? 'Supabase-omgevingsvariabelen zijn ingesteld.'
        : 'Geen Supabase geconfigureerd. De app draait in lokale demo-modus (localStorage).',
    });

    // 2. Database-verbinding (lichte query)
    if (isSupabaseConfigured && supabase) {
      try {
        const { error } = await supabase.from('prompts').select('id', { count: 'exact', head: true });
        results.push({
          key: 'database',
          label: 'Database',
          status: error ? 'error' : 'ok',
          detail: error ? `Query mislukt: ${error.message}` : 'Verbinding met de database werkt.',
        });
      } catch (err) {
        results.push({
          key: 'database',
          label: 'Database',
          status: 'error',
          detail: err instanceof Error ? err.message : 'Onbekende fout bij het verbinden.',
        });
      }

      // 3. Edge-functie (optimize-prompt) bereikbaar
      const fnUrl = getFunctionUrl('optimize-prompt');
      if (fnUrl) {
        try {
          // CORS-preflight/OPTIONS is genoeg om te zien of het endpoint leeft.
          const res = await fetch(fnUrl, { method: 'OPTIONS' });
          results.push({
            key: 'edge',
            label: 'AI edge-functie',
            status: res.ok || res.status === 204 ? 'ok' : 'warn',
            detail: res.ok || res.status === 204
              ? 'De optimize-prompt functie is bereikbaar.'
              : `Onverwachte status (${res.status}). Controleer of de functie is uitgerold.`,
          });
        } catch {
          results.push({
            key: 'edge',
            label: 'AI edge-functie',
            status: 'warn',
            detail: 'Functie niet bereikbaar. Optimalisaties vallen terug op een lokale template.',
          });
        }
      }
    } else {
      results.push({
        key: 'database',
        label: 'Database',
        status: 'warn',
        detail: 'Lokale demo-modus: data wordt in de browser (localStorage) bewaard.',
      });
    }

    setChecks(results);
    setRunning(false);
  }

  useEffect(() => {
    void runChecks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const overall: Health = checks.some((c) => c.status === 'error')
    ? 'error'
    : checks.some((c) => c.status === 'warn')
      ? 'warn'
      : checks.some((c) => c.status === 'checking')
        ? 'checking'
        : 'ok';

  const overallText: Record<Health, string> = {
    ok: 'Alle verbindingen werken',
    warn: 'Werkend, met aandachtspunten',
    error: 'Er is een verbinding die niet werkt',
    checking: 'Status controleren…',
  };

  return (
    <div className="opl-card p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className={`inline-block h-2.5 w-2.5 rounded-full ${STATUS_META[overall].ring}`} />
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Systeemstatus: {overallText[overall]}
          </h3>
        </div>
        <button
          onClick={runChecks}
          disabled={running}
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-60 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <RefreshCw size={13} className={running ? 'animate-spin' : ''} /> Vernieuwen
        </button>
      </div>

      <ul className="divide-y divide-slate-100 dark:divide-slate-700">
        {checks.map((c) => {
          const Icon = STATUS_META[c.status].icon;
          return (
            <li key={c.key} className="flex items-start gap-3 py-3">
              <Icon
                size={18}
                className={`mt-0.5 shrink-0 ${STATUS_META[c.status].classes} ${c.status === 'checking' ? 'animate-spin' : ''}`}
              />
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{c.label}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{c.detail}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const initialChecks: Check[] = [
  { key: 'config', label: 'Configuratie', status: 'checking', detail: '' },
  { key: 'database', label: 'Database', status: 'checking', detail: '' },
];
