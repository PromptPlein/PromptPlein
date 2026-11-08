import { useEffect, useState } from 'react';
import { isSupabaseConfigured, supabase, getFunctionUrl } from '@/lib/supabase';

type Health = 'ok' | 'warn' | 'error' | 'checking';

interface Check {
  key: string;
  label: string;
  status: Health;
  detail: string;
}

const STATUS_META: Record<Exclude<Health, 'checking'>, { icon: string; color: 'success' | 'warning' | 'critical' }> = {
  ok: { icon: 'check-mark-circle-filled', color: 'success' },
  warn: { icon: 'exclamation-triangle-filled', color: 'warning' },
  error: { icon: 'dismiss-circle-filled', color: 'critical' },
};

const BADGE_COLOR: Record<Health, 'success' | 'warning' | 'critical' | 'neutral'> = {
  ok: 'success',
  warn: 'warning',
  error: 'critical',
  checking: 'neutral',
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
            detail:
              res.ok || res.status === 204
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
    <nldd-card>
      <nldd-container padding="24" sm-padding="16" gap="12">
        <nldd-title heading-level={2} size={5} text="Systeemstatus">
          <nldd-container slot="supporting-text" layout="row" gap="8" vertical-alignment="center">
            <nldd-badge size="sm" color={BADGE_COLOR[overall]} decorative></nldd-badge>
            <nldd-text size="sm" color="secondary">
              {overallText[overall]}
            </nldd-text>
          </nldd-container>
          <nldd-button
            slot="end"
            size="sm"
            appearance="neutral-transparent"
            start-icon="refresh"
            text="Vernieuwen"
            loading={running || undefined}
            loading-text="Bezig met controleren"
            onClick={() => void runChecks()}
          ></nldd-button>
        </nldd-title>
        <nldd-list accessible-label="Verbindingen">
          {checks.map((c) => (
            <nldd-list-item key={c.key}>
              {c.status === 'checking' ? (
                <nldd-cell min-width="24px" min-height="24px" vertical-alignment="top">
                  <nldd-activity-indicator size="20" timing="instant"></nldd-activity-indicator>
                </nldd-cell>
              ) : (
                <nldd-icon-cell
                  size="20"
                  vertical-alignment="top"
                  icon={STATUS_META[c.status].icon}
                  color={STATUS_META[c.status].color}
                ></nldd-icon-cell>
              )}
              <nldd-spacer-cell size="12"></nldd-spacer-cell>
              <nldd-text-cell text={c.label} supporting-text={c.detail || undefined}></nldd-text-cell>
            </nldd-list-item>
          ))}
        </nldd-list>
      </nldd-container>
    </nldd-card>
  );
}

const initialChecks: Check[] = [
  { key: 'config', label: 'Configuratie', status: 'checking', detail: '' },
  { key: 'database', label: 'Database', status: 'checking', detail: '' },
];
