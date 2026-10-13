import { useMemo } from 'react';
import { ExternalLink, Scale } from 'lucide-react';
import { detectVerantwoordSignalen } from '@/lib/verantwoordGebruik';

/**
 * Wijzer onder het invoerveld van de bouwer: raakt de opdracht aan besluiten
 * over burgers, persoonsgegevens of vertrouwelijke informatie, dan staan hier de
 * kaders en instrumenten die daarbij horen. Blokkeert niets; de guardrails doen
 * dat al bij echte persoonsgegevens in de tekst.
 */
export default function VerantwoordGebruikHint({ text }: { text: string }) {
  const signalen = useMemo(() => detectVerantwoordSignalen(text), [text]);
  if (signalen.length === 0) return null;

  return (
    <div
      role="note"
      className="animate-fade-in mt-3 rounded-xl border border-rijksblauw-200 bg-rijksblauw-50/50 px-4 py-3 text-sm dark:border-rijksblauw-500/30 dark:bg-rijksblauw-500/10"
    >
      <p className="flex items-center gap-2 font-medium text-rijksblauw-800 dark:text-rijksblauw-100">
        <Scale size={16} className="shrink-0 text-rijksblauw-500" />
        Verantwoord gebruik van AI bij deze opdracht
      </p>
      <ul className="mt-2 space-y-2">
        {signalen.map((s) => (
          <li key={s.id} className="text-slate-600 dark:text-slate-300">
            <span className="font-medium text-slate-800 dark:text-slate-100">{s.titel}.</span>{' '}
            {s.tekst}
            {s.links.length > 0 && (
              <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                {s.links.map((l) => (
                  <a
                    key={l.href}
                    href={l.href}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1 text-xs font-medium text-rijksblauw-600 hover:underline dark:text-rijksblauw-300"
                  >
                    {l.label} <ExternalLink size={11} />
                  </a>
                ))}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
