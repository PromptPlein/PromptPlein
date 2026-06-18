/** Selecteerbare AI-modellen voor het optimaliseren van prompts. */

export type AiProvider = 'auto' | 'claude' | 'openai' | 'deepseek';

export interface AiModelOption {
  id: AiProvider;
  label: string;
  hint: string;
}

export const AI_MODELS: AiModelOption[] = [
  { id: 'auto', label: 'Automatisch', hint: 'Claude → GPT-4 → DeepSeek, met fallback' },
  { id: 'claude', label: 'Claude (Anthropic)', hint: 'Hoogste kwaliteit' },
  { id: 'openai', label: 'GPT-4 (OpenAI)', hint: 'Alternatief model' },
  { id: 'deepseek', label: 'DeepSeek', hint: 'Kostenefficiënt' },
];

/** Label voor de gebruikte provider in het resultaat. */
export const PROVIDER_LABELS: Record<string, string> = {
  claude: 'Claude (Anthropic)',
  openai: 'GPT-4 (OpenAI)',
  deepseek: 'DeepSeek',
  'local-template': 'Lokale template (geen AI)',
};
