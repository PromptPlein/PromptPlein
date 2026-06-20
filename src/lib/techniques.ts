import type { Technique } from '@/types';

/**
 * Bekende contextprompt-ids/namen — complete raamwerken (CRISP, CARE) die de
 * hele prompt structureren, in tegenstelling tot losse prompttechnieken.
 * Wordt als fallback gebruikt wanneer het `family`-veld (nog) niet in de
 * backend is ingevuld, zodat de groepering ook werkt zonder DB-migratie.
 */
const CONTEXT_PROMPT_IDS = new Set(['tech-crisp', 'tech-care']);
const CONTEXT_PROMPT_NAMES = new Set(['crisp', 'care']);

/** Is deze techniek een contextprompt (raamwerk) i.p.v. een losse techniek? */
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
 *  - undefined          → geen vaste structuur; de AI bepaalt zelf de vorm.
 */
export type StructureFormat = 'care' | 'few-shot' | 'chain-of-thought';

const FEW_SHOT_IDS = new Set(['tech-few-shot']);
const FEW_SHOT_NAMES = new Set(['few-shot voorbeelden', 'few-shot', 'few shot']);
const COT_IDS = new Set(['tech-chain-of-thought']);
const COT_NAMES = new Set(['chain-of-thought', 'chain of thought', 'stapsgewijs redeneren']);

/** Welke vaste uitvoerstructuur hoort bij deze techniek (indien van toepassing)? */
export function structureFormat(t: Technique): StructureFormat | undefined {
  if (isContextPrompt(t)) return 'care';
  const id = t.id;
  const name = t.name.trim().toLowerCase();
  if (FEW_SHOT_IDS.has(id) || FEW_SHOT_NAMES.has(name)) return 'few-shot';
  if (COT_IDS.has(id) || COT_NAMES.has(name)) return 'chain-of-thought';
  return undefined;
}
