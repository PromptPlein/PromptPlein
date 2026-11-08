import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CheckCircle2, Clock, FileText } from '@/components/common/icons';
import { getProjectRetention, keepProjectFiles, type ProjectRetention } from '@/services/chatProjectService';

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
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rijksblauw-50 text-rijksblauw-600 dark:bg-rijksblauw-500/15 dark:text-rijksblauw-300">
          <FileText size={26} />
        </span>
        <h1 className="text-2xl font-bold text-rijksblauw-700 dark:text-rijksblauw-200">
          Bronbestanden bewaren
        </h1>
      </div>

      <div className="opl-card space-y-4 p-5 text-base text-slate-700 dark:text-slate-200">
        {state === 'laden' && <p className="text-slate-500 dark:text-slate-400">Bezig met laden…</p>}

        {state === 'onbekend' && (
          <p>
            Dit project bestaat niet meer, of het is niet van jou. Ben je met een ander account
            ingelogd dan het account waarop de mail binnenkwam?
          </p>
        )}

        {state === 'fout' && <p>Het project kon niet worden geladen. Probeer het later opnieuw.</p>}

        {state === 'klaar' && info && keptUntil && (
          <div role="status" className="space-y-3">
            <p className="flex items-start gap-2 font-semibold text-rijksblauw-700 dark:text-rijksblauw-200">
              <CheckCircle2 size={22} className="mt-0.5 shrink-0" />
              De bestanden van {info.name} blijven bewaard.
            </p>
            <p>
              Ze staan er in elk geval tot {datum(keptUntil)}. Gebruik je het project in de tussentijd,
              dan schuift die datum mee. Je keuze is vastgelegd.
            </p>
          </div>
        )}

        {state === 'klaar' && info && !keptUntil && (
          <>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              <dt className="font-semibold">Project</dt>
              <dd className="min-w-0 break-words">{info.name}</dd>
              <dt className="font-semibold">Bestanden</dt>
              <dd>{bestanden(info.fileCount)}</dd>
              {info.deleteOn && (
                <>
                  <dt className="font-semibold">Verwijderd op</dt>
                  <dd>{datum(info.deleteOn)}</dd>
                </>
              )}
            </dl>

            {info.fileCount === 0 ? (
              <p>Dit project heeft geen bronbestanden meer. Er valt niets te bewaren.</p>
            ) : (
              <>
                <p className="flex items-start gap-2">
                  <Clock size={20} className="mt-0.5 shrink-0 text-slate-500 dark:text-slate-400" />
                  {info.deleteOn
                    ? 'Bronbestanden die drie maanden niet zijn gebruikt, worden verwijderd. Het project zelf blijft staan, met naam en instructie.'
                    : `Je bestanden staan er in elk geval tot ${datum(info.keepUntil)}. Wil je die termijn nu al verlengen, dan kan dat hier.`}
                </p>
                <button type="button" className="opl-btn-primary" onClick={keep} disabled={busy}>
                  {busy ? 'Bezig met bewaren…' : 'Bestanden bewaren'}
                </button>
                {error && (
                  <p role="alert" className="text-red-700 dark:text-red-300">
                    {error}
                  </p>
                )}
              </>
            )}
          </>
        )}

        {state !== 'laden' && (
          <p>
            <Link to="/chat" className="opl-raak text-rijksblauw-600 underline dark:text-rijksblauw-300">
              Naar de chat
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
