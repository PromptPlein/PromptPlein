import type { Technique } from '@/types';

/**
 * Bekende prompt framework-ids/namen — complete raamwerken (CARE, CRISPE,
 * RAISE, …) die de hele prompt structureren, in tegenstelling tot losse
 * prompttechnieken. Wordt als fallback gebruikt wanneer het `family`-veld
 * (nog) niet in de backend is ingevuld, zodat de groepering ook werkt zonder
 * DB-migratie.
 */
const CONTEXT_PROMPT_IDS = new Set(['tech-crisp', 'tech-care']);
const CONTEXT_PROMPT_NAMES = new Set([
  'crisp',
  'crispe',
  'care',
  'raise',
  'co-star',
  'craft',
  'create',
  'react',
]);

/**
 * De velden waaruit de aard van een techniek is af te leiden. Losser dan een
 * volledige {@link Technique}, zodat ook het admin-formulier (dat nog niet is
 * opgeslagen) kan bepalen met wat voor techniek het te maken heeft.
 */
type TechniqueIdentity = Pick<Technique, 'id' | 'name' | 'family'>;

/** Is deze techniek een prompt framework (raamwerk) i.p.v. een losse techniek? */
export function isContextPrompt(t: TechniqueIdentity): boolean {
  if (t.family) return t.family === 'context';
  return CONTEXT_PROMPT_IDS.has(t.id) || CONTEXT_PROMPT_NAMES.has(t.name.trim().toLowerCase());
}

/**
 * Vaste uitvoerstructuur die de generator moet afdwingen voor bepaalde
 * technieken. De waarde wordt naar de edge function gestuurd, die er de
 * bijbehorende structuur-instructie aan koppelt.
 *  - 'care'             → #-koppen (Rol, Context, Taak/vraag, …) voor context-raamwerken.
 *  - 'few-shot'         → rol/taak + Voorbeeld-blokken (Input/Output) + Nieuwe taak.
 *  - 'chain-of-thought' → rol/taak + interactieve stap-voor-stap-werkwijze + stapvragen.
 *  - 'persona'          → taak gericht op een ontvanger + Doel/Focus/Toon + inhoud-plaatshouder.
 *  - 'multi-persona'    → vraagstuk bekeken vanuit meerdere persona's + gezamenlijke conclusie.
 *  - 'template-based'   → taak + genummerde rubrieken + regels + Project/Context-plaatshouders.
 *  - 'meta'             → doel + ruwe prompt + verbeterinstructie (rol/context/taak/format) + max. 3 vragen.
 *  - 'socratic'         → Socratische interviewer: één vraag tegelijk om aannames bloot te leggen.
 *  - undefined          → geen vaste structuur; de AI bepaalt zelf de vorm.
 */
export type StructureFormat =
  | 'care'
  | 'few-shot'
  | 'chain-of-thought'
  | 'persona'
  | 'multi-persona'
  | 'template-based'
  | 'meta'
  | 'socratic';

const FEW_SHOT_IDS = new Set(['tech-few-shot']);
const FEW_SHOT_NAMES = new Set(['few-shot voorbeelden', 'few-shot', 'few shot']);
const COT_IDS = new Set(['tech-chain-of-thought']);
const COT_NAMES = new Set(['chain-of-thought', 'chain of thought', 'stapsgewijs redeneren']);
// Multi-persona eerst toetsen (de naam bevat ook "persona").
const MULTI_PERSONA_IDS = new Set(['tech-multi-persona']);
const MULTI_PERSONA_NAMES = new Set(['multi-persona prompting', 'multi-persona', 'multi persona']);
const PERSONA_IDS = new Set(['tech-persona']);
const PERSONA_NAMES = new Set(['persona prompting', 'persona-prompting', 'persona']);
const TEMPLATE_BASED_IDS = new Set(['tech-structured-output', 'tech-template-based']);
const TEMPLATE_BASED_NAMES = new Set([
  'template-based output',
  'sjabloongebaseerd prompten',
  'gestructureerde output',
]);
const META_IDS = new Set(['tech-meta-prompting']);
const META_NAMES = new Set(['meta prompting', 'meta-prompting', 'meta-prompten', 'meta prompten']);
const SOCRATIC_IDS = new Set(['tech-socratic']);
const SOCRATIC_NAMES = new Set(['socratic prompting', 'socratisch prompting', 'socratisch prompten']);

/** Welke vaste uitvoerstructuur hoort bij deze techniek (indien van toepassing)? */
export function structureFormat(t: TechniqueIdentity): StructureFormat | undefined {
  if (isContextPrompt(t)) return 'care';
  const id = t.id;
  const name = t.name.trim().toLowerCase();
  if (FEW_SHOT_IDS.has(id) || FEW_SHOT_NAMES.has(name)) return 'few-shot';
  if (COT_IDS.has(id) || COT_NAMES.has(name)) return 'chain-of-thought';
  // Multi-persona vóór persona, want de naam bevat ook "persona".
  if (MULTI_PERSONA_IDS.has(id) || MULTI_PERSONA_NAMES.has(name) || name.includes('multi-persona')) {
    return 'multi-persona';
  }
  if (PERSONA_IDS.has(id) || PERSONA_NAMES.has(name) || name.includes('persona')) {
    return 'persona';
  }
  if (
    TEMPLATE_BASED_IDS.has(id) ||
    TEMPLATE_BASED_NAMES.has(name) ||
    name.includes('sjabloon') ||
    name.includes('template')
  ) {
    return 'template-based';
  }
  if (META_IDS.has(id) || META_NAMES.has(name) || name.includes('meta')) return 'meta';
  if (SOCRATIC_IDS.has(id) || SOCRATIC_NAMES.has(name) || name.includes('socrat')) return 'socratic';
  return undefined;
}

/**
 * Technieken waarvan de bouwer zélf bepaalt wat hij vraagt: stap voor stap, of
 * afhankelijk van wat de gebruiker aanlevert. Ze hebben dus geen vaste
 * vervolgvragen, en er valt in de admin niets aan vragen te beheren. De tekst
 * hieronder legt uit wat de bouwer in plaats daarvan doet.
 *
 * Persona en Multi-Persona staan hier bewust NIET tussen: die bouwers renderen
 * juist wél de vervolgvragen uit de admin (zie {@link ../lib/persona}).
 */
const SELF_DIRECTED_BUILDERS: Partial<Record<StructureFormat, string>> = {
  'chain-of-thought':
    'Deze techniek voert een interview: de AI stelt één vraag tegelijk, vraagt door op elk antwoord en werkt zo toe naar een conclusie. Welke vragen dat zijn hangt af van het vraagstuk van de gebruiker, dus er is geen vaste vragenlijst.',
  socratic:
    'Deze techniek voert een Socratisch interview: de AI stelt één vraag tegelijk om verborgen aannames bloot te leggen en uit te dagen. Elke vraag bouwt voort op het vorige antwoord, dus er is geen vaste vragenlijst.',
  'few-shot':
    'Deze techniek gebruikt een eigen bouwer in fasen: de gebruiker beschrijft de taak, geeft voorbeelden van input en output, en de AI haalt daar de over te nemen kenmerken uit. Welke stappen er komen hangt af van de keuzes van de gebruiker, dus er is geen vaste vragenlijst.',
  meta:
    'Bij deze techniek bouwt de AI zélf een prompt. De gebruiker beschrijft in één veld wat hij nodig heeft; daarna levert de AI een uitvoerbare prompt die met feedback bij te stellen is. Er zijn dus geen in te vullen velden om te beheren.',
};

/**
 * Bepaalt de bouwer van deze techniek zijn eigen vragen? Zo ja: de uitleg over
 * wat die bouwer doet. Zo nee (undefined): de techniek gebruikt de vervolgvragen
 * uit de admin.
 */
export function selfDirectedBuilder(t: TechniqueIdentity): string | undefined {
  const fmt = structureFormat(t);
  return fmt ? SELF_DIRECTED_BUILDERS[fmt] : undefined;
}

/**
 * Technieken met een eigen invoerscherm: ze halen hun input op via een eigen
 * bouwer (persona/few-shot/meta) of een eigen keuze vooraf (template-based:
 * voorbeelddocument of format-omschrijving), niet via de vervolgvragen.
 */
const OWN_INPUT_FORMATS: StructureFormat[] = [
  'persona',
  'multi-persona',
  'few-shot',
  'meta',
  'template-based',
];

/**
 * Heeft deze techniek een eigen invoerscherm dat de gebruiker moet zien? Zo ja,
 * dan mag een stap er nooit overheen springen — ook niet als laatste stap, waar
 * anders meteen de compose zou starten en de bouwer dus nooit in beeld kwam.
 *
 * Bewust NIET waar bij technieken die alleen vervolgvragen hebben: die worden
 * automatisch voor-ingevuld uit de context tot dan toe, en een laatste stap mag
 * daarmee gewoon direct de eindprompt samenstellen.
 */
export function hasOwnInputStep(t: TechniqueIdentity): boolean {
  const fmt = structureFormat(t);
  return Boolean(fmt && OWN_INPUT_FORMATS.includes(fmt));
}
