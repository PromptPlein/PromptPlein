import { Check } from 'lucide-react';
import clsx from 'clsx';
import { splitFieldLabel } from '@/lib/fieldLabel';
import type { Technique } from '@/types';

interface SjabloonVragenProps {
  technique: Pick<Technique, 'id' | 'follow_up_questions'>;
  antwoorden: Record<string, string>;
  onChange: (antwoorden: Record<string, string>) => void;
  disabled?: boolean;
}

/**
 * De contextstap van een sjabloon: de vragen van het sjabloon onder elkaar, elk
 * met een eigen vak, vóórdat de velden zelf in beeld komen. Zo staat de
 * gebruiker bij elke vraag stil en geeft hij in eigen woorden mee wat hij weet.
 * Daarna zet de AI het in de velden (voor-invullen) en vraagt naar wat ontbreekt.
 *
 * De vragen zijn de velden van het sjabloon zelf (naam plus uitleg uit het
 * label, het voorbeeld uit de placeholder), zodat een nieuw sjabloon ze
 * vanzelf meekrijgt.
 */
export default function SjabloonVragen({
  technique,
  antwoorden,
  onChange,
  disabled,
}: SjabloonVragenProps) {
  const vragen = technique.follow_up_questions;
  const beantwoord = vragen.filter((q) => antwoorden[q.id]?.trim()).length;

  return (
    <div>
      <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
        {beantwoord} van {vragen.length} vragen beantwoord. Steekwoorden mogen; wat je nog niet
        weet, laat je leeg.
      </p>
      <ol className="space-y-4">
        {vragen.map((q, i) => {
          const { name, instruction } = splitFieldLabel(q.label);
          const id = `sjabloon-${technique.id}-${q.id}`;
          const ingevuld = Boolean(antwoorden[q.id]?.trim());
          return (
            <li key={q.id} className="flex gap-3">
              <span
                aria-hidden="true"
                className={clsx(
                  'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                  ingevuld
                    ? 'bg-rijksblauw-500 text-white'
                    : 'bg-rijksblauw-100 text-rijksblauw-700 dark:bg-rijksblauw-500/20 dark:text-rijksblauw-200',
                )}
              >
                {ingevuld ? <Check size={13} /> : i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <label htmlFor={id} className="block">
                  <span className="block text-xs font-semibold uppercase tracking-wide text-rijksblauw-600 dark:text-rijksblauw-300">
                    {name}
                  </span>
                  <span className="block text-sm font-medium text-slate-800 dark:text-slate-100">
                    {instruction ?? name}
                  </span>
                </label>
                <textarea
                  id={id}
                  rows={2}
                  className="opl-input mt-1.5 resize-y text-sm"
                  value={antwoorden[q.id] ?? ''}
                  placeholder={q.placeholder}
                  disabled={disabled}
                  onChange={(e) => onChange({ ...antwoorden, [q.id]: e.target.value })}
                />
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
