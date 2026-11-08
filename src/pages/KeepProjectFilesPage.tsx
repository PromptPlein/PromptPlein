import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getProjectRetention, keepProjectFiles, type ProjectRetention } from '@/services/chatProjectService';
import '@nldd/design-system/activity-indicator';
import '@nldd/design-system/banner';
import '@nldd/design-system/button';
import '@nldd/design-system/button-group';
import '@nldd/design-system/card';
import '@nldd/design-system/container';
import '@nldd/design-system/icon';
import '@nldd/design-system/link';
import '@nldd/design-system/list';
import '@nldd/design-system/list-item';
import '@nldd/design-system/simple-section';
import '@nldd/design-system/spacer';
import '@nldd/design-system/text';
import '@nldd/design-system/text-cell';
import '@nldd/design-system/title';

/**
 * Hier komt de link uit de mail "Je bronbestanden worden over een week
 * verwijderd" uit (migratie 0053). De link zelf bewaart niets, want mailscanners
 * openen links vanzelf. De knop wel, en de database legt dat vast.
 */

function datum(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
}

function bestanden(n: number): string {
  return n === 1 ? '1 bronbestand' : `${n} bronbestanden`;
}

export default function KeepProjectFilesPage() {
  const { projectId = '' } = useParams();
  const [state, setState] = useState<'laden' | 'klaar' | 'onbekend' | 'fout'>('laden');
  const [info, setInfo] = useState<ProjectRetention | null>(null);
  const [keptUntil, setKeptUntil] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    getProjectRetention(projectId)
      .then((r) => {
        if (cancelled) return;
        setInfo(r);
        setState(r ? 'klaar' : 'onbekend');
      })
      .catch(() => !cancelled && setState('fout'));
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  async function keep() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      setKeptUntil(await keepProjectFiles(projectId));
    } catch {
      setError('Bewaren is niet gelukt. Probeer het later opnieuw.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <nldd-simple-section width="42rem">
      <nldd-container layout="row" gap="12" vertical-alignment="center">
        <nldd-icon icon="file-text" size="48" color="lintblauw" box></nldd-icon>
        <nldd-title heading-level={1} size={2} text="Bronbestanden bewaren"></nldd-title>
      </nldd-container>
      <nldd-spacer size="24"></nldd-spacer>

      <nldd-card>
        <nldd-container padding="20" gap="16">
          {state === 'laden' && <nldd-activity-indicator size="32" show-text text="Bezig met laden"></nldd-activity-indicator>}

          {state === 'onbekend' && (
            <nldd-text>
              Dit project bestaat niet meer, of het is niet van jou. Ben je met een ander account
              ingelogd dan het account waarop de mail binnenkwam?
            </nldd-text>
          )}

          {state === 'fout' && <nldd-text>Het project kon niet worden geladen. Probeer het later opnieuw.</nldd-text>}

          {state === 'klaar' && info && keptUntil && (
            <nldd-container role="status" gap="12">
              <nldd-container layout="row" gap="8">
                <nldd-icon icon="check-mark-circle" size="24" color="success"></nldd-icon>
                <nldd-text weight="bold">De bestanden van {info.name} blijven bewaard.</nldd-text>
              </nldd-container>
              <nldd-text>
                Ze staan er in elk geval tot {datum(keptUntil)}. Gebruik je het project in de tussentijd,
                dan schuift die datum mee. Je keuze is vastgelegd.
              </nldd-text>
            </nldd-container>
          )}

          {state === 'klaar' && info && !keptUntil && (
            <>
              <nldd-list appearance="simple" accessible-label="Gegevens van het project">
                <nldd-list-item size="sm">
                  <nldd-text-cell width="9rem" text="**Project**"></nldd-text-cell>
                  <nldd-text-cell text={info.name}></nldd-text-cell>
                </nldd-list-item>
                <nldd-list-item size="sm">
                  <nldd-text-cell width="9rem" text="**Bestanden**"></nldd-text-cell>
                  <nldd-text-cell text={bestanden(info.fileCount)}></nldd-text-cell>
                </nldd-list-item>
                {info.deleteOn && (
                  <nldd-list-item size="sm">
                    <nldd-text-cell width="9rem" text="**Verwijderd op**"></nldd-text-cell>
                    <nldd-text-cell text={datum(info.deleteOn)}></nldd-text-cell>
                  </nldd-list-item>
                )}
              </nldd-list>

              {info.fileCount === 0 ? (
                <nldd-text>Dit project heeft geen bronbestanden meer. Er valt niets te bewaren.</nldd-text>
              ) : (
                <>
                  <nldd-container layout="row" gap="8">
                    <nldd-icon icon="clock" size="20" color="secondary-content"></nldd-icon>
                    <nldd-text>
                      {info.deleteOn
                        ? 'Bronbestanden die drie maanden niet zijn gebruikt, worden verwijderd. Het project zelf blijft staan, met naam en instructie.'
                        : `Je bestanden staan er in elk geval tot ${datum(info.keepUntil)}. Wil je die termijn nu al verlengen, dan kan dat hier.`}
                    </nldd-text>
                  </nldd-container>
                  <nldd-button-group>
                    <nldd-button
                      appearance="primary"
                      text="Bewaar bestanden"
                      onClick={keep}
                      loading={busy || undefined}
                      loading-text="Bezig met bewaren"
                    ></nldd-button>
                  </nldd-button-group>
                  {error && (
                    <nldd-container role="alert">
                      <nldd-banner variant="critical" size="sm" text={error}></nldd-banner>
                    </nldd-container>
                  )}
                </>
              )}
            </>
          )}

          {state !== 'laden' && <nldd-link href="/chat" text="Naar de chat"></nldd-link>}
        </nldd-container>
      </nldd-card>
    </nldd-simple-section>
  );
}
