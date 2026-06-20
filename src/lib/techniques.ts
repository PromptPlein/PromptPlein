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

/** Is deze techniek een prompt framework (raamwerk) i.p.v. een losse techniek? */
export function isContextPrompt(t: Technique): boolean {
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
export function structureFormat(t: Technique): StructureFormat | undefined {
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
