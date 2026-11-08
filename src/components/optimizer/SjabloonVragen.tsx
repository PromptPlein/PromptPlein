import { Check } from '@/components/common/icons';
import clsx from 'clsx';
import { splitFieldLabel } from '@/lib/fieldLabel';
import type { VraagHerkomst } from '@/services/optimizeService';
import type { Technique } from '@/types';

interface SjabloonVragenProps {
  technique: Pick<Technique, 'id' | 'follow_up_questions'>;
  antwoorden: Record<string, string>;
  /** De nieuwe antwoorden, plus welke vraag de gebruiker zelf aanpaste. */
  onChange: (antwoorden: Record<string, string>, aangepast: string) => void;
  /**
   * Waar elk antwoord vandaan komt na "Vul de vragen in uit deze tekst". Een
   * vraag zonder herkomst heeft de gebruiker zelf geschreven of aangepast.
   */
  herkomst?: Record<string, VraagHerkomst>;
  disabled?: boolean;
}

const HERKOMST_LABEL: Record<VraagHerkomst, { tekst: string; className: string }> = {
  tekst: {
    tekst: 'Uit je tekst',
    className: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  },
  aangevuld: {
    tekst: 'Uit je tekst, aangevuld door de AI',
    className: 'bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200',
  },
  ai: {
    tekst: 'Bedacht door de AI',
    className: 'bg-pleingroen/15 text-pleingroen',
  },
};

/**
 * De contextstap van een sjabloon: de vragen van het sjabloon onder elkaar, elk
 * met een eigen vak, vóórdat de velden zelf in beeld komen. Zo staat de
 * gebruiker bij elke vraag stil en geeft hij in eigen woorden mee wat hij weet.
 * Daarna zet de AI het in de velden (voor-invullen) en vraagt naar wat ontbreekt.
 * Zijn de vragen ingevuld uit een voorbereide tekst, dan staat bij elke vraag
 * waar het antwoord vandaan komt; dat label verdwijnt zodra de gebruiker het
 * antwoord zelf aanpast.
 *
 * De vragen zijn de velden van het sjabloon zelf (naam plus uitleg uit het
 * label, het voorbeeld uit de placeholder), zodat een nieuw sjabloon ze
 * vanzelf meekrijgt.
 */
export default function SjabloonVragen({
  technique,
  antwoorden,
  onChange,
  herkomst,
  disabled,
}: SjabloonVragenProps) {
  const vragen = technique.follow_up_questions;
  const beantwoord = vragen.filter((q) => antwoorden[q.id]?.trim()).length;
  const heeftAanvulling = Object.values(herkomst ?? {}).some((h) => h !== 'tekst');

  return (
    <div>
      <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
        {beantwoord} van {vragen.length} vragen beantwoord. Steekwoorden mogen; wat je nog niet
        weet, laat je leeg.
        {heeftAanvulling &&
          ' Wat de AI zelf heeft bedacht, staat in een alinea na "Aangevuld door de AI:". Pas aan of haal weg wat niet klopt.'}
      </p>
      <ol className="space-y-4">
        {vragen.map((q, i) => {
          const { name, instruction } = splitFieldLabel(q.label);
          const id = `sjabloon-${technique.id}-${q.id}`;
          const ingevuld = Boolean(antwoorden[q.id]?.trim());
          const bron = herkomst?.[q.id] ? HERKOMST_LABEL[herkomst[q.id]] : null;
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
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-rijksblauw-600 dark:text-rijksblauw-300">
                      {name}
                    </span>
                    {bron && (
                      <span className={clsx('rounded-full px-2 py-0.5 text-[0.6875rem] font-medium', bron.className)}>
                        {bron.tekst}
                      </span>
                    )}
                  </span>
                  <span className="block text-sm font-medium text-slate-800 dark:text-slate-100">
                    {instruction ?? name}
                  </span>
                </label>
                <textarea
                  id={id}
                  rows={antwoorden[q.id]?.includes('\n') ? 5 : 2}
                  className="opl-input mt-1.5 resize-y text-sm"
                  value={antwoorden[q.id] ?? ''}
                  placeholder={q.placeholder}
                  disabled={disabled}
                  onChange={(e) => onChange({ ...antwoorden, [q.id]: e.target.value }, q.id)}
                />
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
