import {
  Blocks,
  Bot,
  CodeXml,
  FileText,
  ImageIcon,
  LayoutDashboard,
  type LucideIcon,
} from '@/components/common/icons';
import { PROMPT_KINDS, type PromptKind } from '@/lib/techniques';

/**
 * De soort van een opgeslagen prompt: wat hij oplevert, naast de categorie die
 * zegt waar hij over gaat (migratie 0064). Dezelfde zes als bij Maken, Wat
 * wordt het?, met dezelfde namen en iconen.
 */
export const PROMPT_KIND_META: Record<PromptKind, { label: string; icon: LucideIcon }> = {
  text: { label: 'Tekst', icon: FileText },
  code: { label: 'Code', icon: CodeXml },
  dashboard: { label: 'Dashboard', icon: LayoutDashboard },
  agent: { label: 'Agent', icon: Bot },
  skill: { label: 'Skill', icon: Blocks },
  image: { label: 'Afbeelding', icon: ImageIcon },
};

export function isPromptKind(value: unknown): value is PromptKind {
  return typeof value === 'string' && (PROMPT_KINDS as readonly string[]).includes(value);
}

/** De soort van een prompt; oude rijen zonder soort zijn tekst. */
export function promptKindOf(prompt: { kind?: string | null }): PromptKind {
  return isPromptKind(prompt.kind) ? prompt.kind : 'text';
}

/**
 * Welke soort hoort bij het framework waarmee de prompt is gebouwd. Een
 * framework zonder `modality` doet bij elke soort mee en zegt dus niets.
 */
export function kindFromModality(modality?: string | null): PromptKind | null {
  if (!modality) return null;
  if (modality.startsWith('code')) return 'code';
  if (modality.startsWith('dashboard')) return 'dashboard';
  return isPromptKind(modality) ? modality : null;
}

/**
 * Wat je met een prompt van deze soort doet, voor de promptpagina. Tekst draait
 * gewoon in de chat; de rest hoort in een ander hulpmiddel.
 */
export const PROMPT_KIND_USE: Record<PromptKind, string | null> = {
  text: null,
  code: 'Plak deze prompt in je codeerhulp, zoals Copilot, Cursor of Claude Code.',
  dashboard: 'Plak deze prompt in je codeerhulp, zoals Copilot, Cursor of Claude Code. Die bouwt het dashboard.',
  agent: 'Gebruik deze prompt als instructie voor een agent in je AI-omgeving.',
  skill: 'Een vaste werkwijze voor een AI-assistent. Zet hem als skill of vaste instructie in je AI-omgeving.',
  image: 'Plak deze prompt in ChatGPT of Copilot om het beeld te maken. PromptPlein maakt zelf geen beeld.',
};
