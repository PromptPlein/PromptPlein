/**
 * Gestructureerde persona-definitie voor de Persona- en Multi-Persona-stappen van
 * de plan-bouwer. In plaats van twee algemene vragen krijgt de gebruiker per
 * persona zeven gerichte vragen die de rol scherp en operationeel maken. Weet de
 * gebruiker een antwoord niet, dan vult de AI de velden in op basis van een korte
 * aanduiding (bijv. "mijn teammanager"), waarna de gebruiker kan bijstellen.
 */

/** Eén van de zeven persona-vragen. */
export interface PersonaQuestion {
  /** Sleutel binnen een persona-object. */
  id: PersonaFieldKey;
  /** De vraag zoals getoond aan de gebruiker. */
  label: string;
  /** Korte toelichting: waarom deze vraag ertoe doet. */
  why: string;
  placeholder: string;
}

export type PersonaFieldKey =
  | 'rol'
  | 'ervaring'
  | 'belang'
  | 'focus'
  | 'niet'
  | 'communicatie'
  | 'blinde_vlek';

/** De zeven vragen die samen één persona scherp definiëren. */
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
export function personaHasContent(p: PersonaEntry): boolean {
  return Boolean(p.hint.trim()) || PERSONA_QUESTIONS.some((q) => p.fields[q.id]?.trim());
}

/**
 * Serialiseert één of meer persona's tot leesbare, gelabelde tekst. Dit is wat als
 * antwoord van de stap in de analyse/compose-pipeline landt, zodat de rest van de
 * flow ongewijzigd blijft werken.
 */
export function serializePersonas(personas: PersonaEntry[]): string {
  const filled = personas.filter(personaHasContent);
  if (filled.length === 0) return '';
  return filled
    .map((p, i) => {
      const header =
        filled.length > 1
          ? `Persona ${i + 1}${p.hint.trim() ? ` — ${p.hint.trim()}` : ''}`
          : p.hint.trim()
            ? `Persona — ${p.hint.trim()}`
            : 'Persona';
      const lines = PERSONA_QUESTIONS.filter((q) => p.fields[q.id]?.trim()).map(
        (q) => `- ${q.label} ${p.fields[q.id]!.trim()}`,
      );
      return `${header}\n${lines.join('\n')}`;
    })
    .join('\n\n');
}
