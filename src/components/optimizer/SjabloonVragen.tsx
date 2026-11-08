import { useRef } from 'react';
import { useNlddValue } from '@/lib/nldd';
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

const HERKOMST_LABEL: Record<VraagHerkomst, { tekst: string; color: 'success' | 'warning' | 'oranje' }> = {
  tekst: { tekst: 'Uit je tekst', color: 'success' },
  aangevuld: { tekst: 'Uit je tekst, aangevuld door de AI', color: 'warning' },
  ai: { tekst: 'Bedacht door de AI', color: 'oranje' },
};

/**
 * The context step of a template: its questions under each other, each with its
 * own field, before the fields themselves appear. The user stops at each
 * question and gives what he knows in his own words; then the AI puts it in the
 * fields (prefill) and asks for what is missing. When the questions were filled
 * from a prepared text, each question says where the answer comes from; that
 * label goes away once the user edits the answer.
 *
 * The questions are the template's own fields (name and explanation from the
 * label, the example from the placeholder), so a new template gets them for free.
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
    <nldd-container gap="16">
      <nldd-text size="xs" color="secondary">
        {beantwoord} van {vragen.length} vragen beantwoord. Steekwoorden mogen; wat je nog niet
        weet, laat je leeg.
        {heeftAanvulling &&
          ' Wat de AI zelf heeft bedacht, staat in een alinea na "Aangevuld door de AI:". Pas aan of haal weg wat niet klopt.'}
      </nldd-text>
      {vragen.map((q, i) => {
        const { name, instruction } = splitFieldLabel(q.label);
        return (
          <SjabloonVraag
            key={q.id}
            nummer={i + 1}
            naam={name}
            instructie={instruction ?? undefined}
            placeholder={q.placeholder}
            value={antwoorden[q.id] ?? ''}
            bron={herkomst?.[q.id] ? HERKOMST_LABEL[herkomst[q.id]] : null}
            disabled={disabled}
            onValue={(v) => onChange({ ...antwoorden, [q.id]: v }, q.id)}
          />
        );
      })}
    </nldd-container>
  );
}

function SjabloonVraag({
  nummer,
  naam,
  instructie,
  placeholder,
  value,
  bron,
  disabled,
  onValue,
}: {
  nummer: number;
  naam: string;
  instructie?: string;
  placeholder?: string;
  value: string;
  bron: { tekst: string; color: 'success' | 'warning' | 'oranje' } | null;
  disabled?: boolean;
  onValue: (value: string) => void;
}) {
  const ref = useRef<HTMLElement & { value?: string }>(null);
  useNlddValue(ref, value, onValue);
  const ingevuld = Boolean(value.trim());
  return (
    <nldd-form-field label={`${nummer}. ${naam}`} supporting-label={ingevuld ? 'ingevuld' : undefined}>
      {instructie && <nldd-form-field-help-text>{instructie}</nldd-form-field-help-text>}
      {bron && <nldd-tag size="sm" color={bron.color} text={bron.tekst}></nldd-tag>}
      <nldd-multi-line-text-field
        ref={ref}
        size="sm"
        rows={value.includes('\n') ? 5 : 2}
        resize="vertical"
        placeholder={placeholder}
        disabled={disabled || undefined}
      ></nldd-multi-line-text-field>
    </nldd-form-field>
  );
}
