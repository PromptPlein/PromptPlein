/**
 * Gestructureerde persona-definitie voor de Persona- en Multi-Persona-stappen van
 * de plan-bouwer. In plaats van twee algemene vragen krijgt de gebruiker per
 * persona meerdere gerichte vragen die de rol scherp en operationeel maken. Weet de
 * gebruiker een antwoord niet, dan vult de AI de velden in op basis van een korte
 * aanduiding (bijv. "mijn teammanager"), waarna de gebruiker kan bijstellen.
 *
 * De vragen komen uit de techniek-definitie in de admin (`follow_up_questions`,
 * inclusief de toelichting per veld). {@link PERSONA_QUESTIONS} hieronder is de
 * fallback: die wordt gebruikt zolang een techniek nog geen vragen heeft staan,
 * zodat de bouwer nooit leeg is.
 */

import type { FollowUpQuestion, Technique } from '@/types';

/** Eén persona-vraag zoals de bouwer hem rendert. */
export interface PersonaQuestion {
  /** Sleutel binnen een persona-object; komt overeen met het veld-id uit de admin. */
  id: PersonaFieldKey;
  /** De vraag zoals getoond aan de gebruiker. */
  label: string;
  /** Korte toelichting: waarom deze vraag ertoe doet en waar op door te vragen. */
  why: string;
  placeholder: string;
}

/**
 * Veld-id binnen een persona. Vrij vorm, omdat de admin de velden definieert —
 * de namen hieronder zijn de ids van de meegeleverde standaardvragen.
 */
export type PersonaFieldKey = string;

/** De zeven standaardvragen die samen één persona scherp definiëren (fallback). */
export const PERSONA_QUESTIONS: PersonaQuestion[] = [
  {
    id: 'rol',
    label: 'Welke functie of rol vervult deze persoon precies?',
    why: 'Dit is de kapstok. Hoe specifieker, hoe minder de AI terugvalt op een generiek gemiddelde. "Wetgevingsjurist bij een departement" activeert echte denkkaders, "jurist" niet.',
    placeholder: 'Bijv. wetgevingsjurist bij een departement',
  },
  {
    id: 'ervaring',
    label: 'Hoeveel ervaring en welke expertise heeft deze persoon?',
    why: 'Ervaring bepaalt de zekerheid waarmee de AI schrijft. Een senior nuanceert en kent uitzonderingen; een junior legt uit en volgt de regels.',
    placeholder: 'Bijv. 15 jaar ervaring, senior, specialist uitvoerbaarheid',
  },
  {
    id: 'belang',
    label: 'Welk belang bewaakt deze persoon?',
    why: 'De belangrijkste vraag. Een rol zonder belang is een decorstuk. "Bewaakt de uitvoerbaarheid" geeft de tekst richting: de AI gaat afwegen in plaats van opsommen.',
    placeholder: 'Bijv. bewaakt de uitvoerbaarheid en handhaafbaarheid',
  },
  {
    id: 'focus',
    label: 'Waar let deze persoon als eerste op?',
    why: 'Dit stuurt de volgorde en de aandacht. Wie eerst naar risico’s kijkt schrijft een andere opbouw dan wie eerst naar kansen kijkt. Het maakt de persona operationeel.',
    placeholder: 'Bijv. eerst naar risico’s en juridische houdbaarheid',
  },
  {
    id: 'niet',
    label: 'Wat doet of zegt deze persona juist níét?',
    why: 'Negatieve afbakening is het scherpste stuurmiddel. "Geeft geen politiek oordeel", "gebruikt geen jargon". Zonder grens vult de AI de ruimte met eigen aannames.',
    placeholder: 'Bijv. geeft geen politiek oordeel, belooft geen termijnen',
  },
  {
    id: 'communicatie',
    label: 'Hoe moet er gecommuniceerd worden?',
    why: 'Toon, register, zinslengte, gebruik van vaktaal. Dit is het verschil tussen inhoudelijk kloppen en herkenbaar zijn.',
    placeholder: 'Bijv. zakelijk en bondig, korte zinnen, minimaal jargon',
  },
  {
    id: 'blinde_vlek',
    label: 'Wat weet deze persoon niet, of waar twijfelt hij over?',
    why: 'Dit voorkomt de alwetende AI-stem. Een persona met blinde vlekken is geloofwaardiger en benoemt onzekerheid in plaats van hem glad te strijken.',
    placeholder: 'Bijv. minder thuis in de techniek; twijfelt over de planning',
  },
];

/**
 * Vertaalt de vervolgvragen uit de admin naar persona-vragen. Een vraag zonder
 * toelichting valt terug op de toelichting van de gelijknamige standaardvraag,
 * zodat een half ingevulde techniek-definitie geen kale velden oplevert.
 */
export function toPersonaQuestions(followUps: FollowUpQuestion[]): PersonaQuestion[] {
  return followUps
    .filter((q) => q.id?.trim() && q.label?.trim())
    .map((q) => {
      const fallback = PERSONA_QUESTIONS.find((d) => d.id === q.id);
      return {
        id: q.id,
        label: q.label,
        why: q.why?.trim() || fallback?.why || '',
        placeholder: q.placeholder?.trim() || fallback?.placeholder || '',
      };
    });
}

/**
 * De vragen die de persona-bouwer moet tonen: die van de techniek uit de admin,
 * of de meegeleverde standaardvragen zolang de techniek er nog geen heeft.
 */
export function resolvePersonaQuestions(technique?: Technique): PersonaQuestion[] {
  const fromAdmin = toPersonaQuestions(technique?.follow_up_questions ?? []);
  return fromAdmin.length > 0 ? fromAdmin : PERSONA_QUESTIONS;
}

/** De ingevulde waarden van één persona (per vraag-id). */
export type PersonaData = Partial<Record<PersonaFieldKey, string>>;

/** Eén persona in de builder: de korte aanduiding (hint) plus de zeven velden. */
export interface PersonaEntry {
  /** Stabiele id voor de lijst (client-side). */
  id: string;
  /** Korte aanduiding, bijv. "mijn teammanager" — voedt de AI-invulhulp. */
  hint: string;
  fields: PersonaData;
}

/** Maak een lege persona-invoer met een stabiele id. */
export function emptyPersona(id: string): PersonaEntry {
  return { id, hint: '', fields: {} };
}

/** Heeft deze persona minstens één ingevuld veld (of een hint)? */
export function personaHasContent(
  p: PersonaEntry,
  questions: PersonaQuestion[] = PERSONA_QUESTIONS,
): boolean {
  return Boolean(p.hint.trim()) || questions.some((q) => p.fields[q.id]?.trim());
}

/**
 * Serialiseert één of meer persona's tot leesbare, gelabelde tekst. Dit is wat als
 * antwoord van de stap in de analyse/compose-pipeline landt, zodat de rest van de
 * flow ongewijzigd blijft werken. De labels komen uit de techniek-definitie, dus
 * een wijziging in de admin verandert ook de tekst die de AI te zien krijgt.
 */
export function serializePersonas(
  personas: PersonaEntry[],
  questions: PersonaQuestion[] = PERSONA_QUESTIONS,
): string {
  const filled = personas.filter((p) => personaHasContent(p, questions));
  if (filled.length === 0) return '';
  return filled
    .map((p, i) => {
      const header =
        filled.length > 1
          ? `Persona ${i + 1}${p.hint.trim() ? ` — ${p.hint.trim()}` : ''}`
          : p.hint.trim()
            ? `Persona — ${p.hint.trim()}`
            : 'Persona';
      const lines = questions.filter((q) => p.fields[q.id]?.trim()).map(
        (q) => `- ${q.label} ${p.fields[q.id]!.trim()}`,
      );
      return `${header}\n${lines.join('\n')}`;
    })
    .join('\n\n');
}
