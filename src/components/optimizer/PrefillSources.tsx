import { Globe } from 'lucide-react';
import type { PrefillResult } from '@/types';

/**
 * Wat het zoeken op internet bij het invullen van de velden opleverde: de
 * zoekvragen, de bronnen, en hoeveel velden er een feit uit kregen. Staat boven
 * de velden, zodat de gebruiker ziet dat het internet echt is geraadpleegd en
 * waar de velden met het blauwe label "Aangevuld van internet" vandaan komen.
 */
export default function PrefillSources({ prefill }: { prefill: PrefillResult }) {
  const sources = prefill.sources ?? [];
  const notices = prefill.notices ?? [];
  if (sources.length === 0 && notices.length === 0) return null;
  const metBron = prefill.fields.filter((f) => f.source === 'bron').length;

  return (
    <div className="space-y-1.5 rounded-lg border border-rijksblauw-200 bg-white px-3 py-2.5 text-xs dark:border-rijksblauw-500/30 dark:bg-slate-800">
      {notices.map((n) => (
        <p key={n} className="text-amber-700 dark:text-amber-300">
          {n}
        </p>
      ))}
      {sources.length > 0 && (
        <>
          <p className="flex items-center gap-1.5 font-medium text-rijksblauw-700 dark:text-rijksblauw-200">
            <Globe size={13} />
            Internet geraadpleegd: {sources.length} {sources.length === 1 ? 'bron' : 'bronnen'},{' '}
            {metBron === 0
              ? 'maar geen enkel veld kreeg er een feit uit'
              : `${metBron} ${metBron === 1 ? 'veld' : 'velden'} aangevuld`}
          </p>
          {prefill.queries && prefill.queries.length > 0 && (
            <p className="text-slate-500 dark:text-slate-400">
              Gezocht op: {prefill.queries.map((q) => `"${q}"`).join(' en ')}
            </p>
          )}
          <ol className="space-y-0.5">
            {sources.map((s, i) => (
              <li key={s.url} className="flex gap-1.5">
                <span className="shrink-0 tabular-nums text-slate-400">[{i + 1}]</span>
                <a
                  href={s.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="min-w-0 truncate text-rijksblauw-600 hover:underline dark:text-rijksblauw-300"
                  title={s.url}
                >
                  {s.title}
                </a>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}
