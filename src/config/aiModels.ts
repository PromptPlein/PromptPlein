/** Selecteerbare AI-modellen voor het optimaliseren van prompts. */

export type AiProvider = 'auto' | 'claude' | 'openai' | 'deepseek' | 'mistral';

export interface AiModelOption {
  id: AiProvider;
  label: string;
  hint: string;
}

export const AI_MODELS: AiModelOption[] = [
  { id: 'auto', label: 'Automatisch', hint: 'Claude → GPT-5 → DeepSeek → Mistral, met fallback' },
  { id: 'claude', label: 'Claude (Anthropic)', hint: 'Hoogste kwaliteit' },
  { id: 'openai', label: 'GPT-5 (OpenAI)', hint: 'Alternatief model' },
  { id: 'deepseek', label: 'DeepSeek', hint: 'Kostenefficiënt' },
  { id: 'mistral', label: 'Mistral', hint: 'Snel en goedkoop' },
];

/** Prijs per 1 miljoen tokens (USD). Bron: officiële provider-prijslijsten. */
export interface ModelPricing {
  /** USD per 1M invoertokens (jouw prompt). */
  input: number;
  /** USD per 1M uitvoertokens (het antwoord). */
  output: number;
}

/** Eén concreet API-model dat bij een provider hoort. */
export interface ProviderModelOption {
  /** De exacte model-id die naar de API gaat (bijv. 'claude-opus-4-8'). */
  id: string;
  /** Korte, leesbare naam voor in de UI. */
  label: string;
  /** Eén regel context: waarvoor je dit model kiest en hoe het zich verhoudt. */
  hint: string;
  /** Richtprijs per 1M tokens (USD); puur indicatief voor de admin-keuze. */
  pricing: ModelPricing;
}

/**
 * Per provider de API-modellen die de admin kan kiezen, mét richtprijzen. Het
 * EERSTE model in elke lijst is de standaard (en moet matchen met de server-side
 * default in de `optimize-prompt` edge function). Bij `auto` kiest de
 * fallback-keten zelf, dus daar is geen modelkeuze.
 *
 * Prijzen zijn USD per 1M tokens, geverifieerd in juni 2026 tegen de officiële
 * prijslijsten. Houd dit in sync met `PROVIDER_MODELS` in de edge function.
 */
export const PROVIDER_MODELS: Record<Exclude<AiProvider, 'auto'>, ProviderModelOption[]> = {
  claude: [
    {
      id: 'claude-opus-4-8',
      label: 'Claude Opus 4.8',
      hint: 'Krachtigst: complex redeneren en langlopende taken',
      pricing: { input: 5, output: 25 },
    },
    {
      id: 'claude-sonnet-4-6',
      label: 'Claude Sonnet 4.6',
      hint: 'Beste balans tussen kwaliteit en snelheid',
      pricing: { input: 3, output: 15 },
    },
    {
      id: 'claude-haiku-4-5',
      label: 'Claude Haiku 4.5',
      hint: 'Snelst en voordeligst, bijna-frontier kwaliteit',
      pricing: { input: 1, output: 5 },
    },
  ],
  openai: [
    {
      id: 'gpt-5.5',
      label: 'GPT-5.5',
      hint: 'Vlaggenschip: hoogste kwaliteit voor complex werk',
      pricing: { input: 5, output: 30 },
    },
    {
      id: 'gpt-5.5-pro',
      label: 'GPT-5.5 Pro',
      hint: 'Maximale precisie; fors duurder',
      pricing: { input: 30, output: 180 },
    },
    {
      id: 'gpt-5.4',
      label: 'GPT-5.4',
      hint: 'Voordeliger volwaardig model, sterke prestaties',
      pricing: { input: 2.5, output: 15 },
    },
    {
      id: 'gpt-5.4-mini',
      label: 'GPT-5.4 mini',
      hint: 'Snel en goedkoop voor afgebakende taken',
      pricing: { input: 0.75, output: 4.5 },
    },
    {
      id: 'gpt-5.4-nano',
      label: 'GPT-5.4 nano',
      hint: 'Goedkoopst, laagste latency',
      pricing: { input: 0.2, output: 1.25 },
    },
  ],
  deepseek: [
    {
      id: 'deepseek-v4-flash',
      label: 'DeepSeek V4 Flash',
      hint: 'Zeer goedkoop en snel, 1M contextvenster',
      pricing: { input: 0.14, output: 0.28 },
    },
    {
      id: 'deepseek-v4-pro',
      label: 'DeepSeek V4 Pro',
      hint: 'Sterker redeneren, nog steeds zeer voordelig',
      pricing: { input: 0.435, output: 0.87 },
    },
  ],
  mistral: [
    {
      id: 'mistral-small-latest',
      label: 'Mistral Small 3',
      hint: 'Beste balans: sterk en zeer goedkoop',
      pricing: { input: 0.1, output: 0.3 },
    },
    {
      id: 'ministral-8b-latest',
      label: 'Ministral 8B',
      hint: 'Snel en ultra-goedkoop, vlakke prijs',
      pricing: { input: 0.1, output: 0.1 },
    },
    {
      id: 'ministral-3b-latest',
      label: 'Ministral 3B',
      hint: 'Goedkoopst en laagste latency',
      pricing: { input: 0.04, output: 0.04 },
    },
  ],
};

/** Alle geldige model-ids per provider (voor validatie). */
function modelIds(provider: Exclude<AiProvider, 'auto'>): string[] {
  return PROVIDER_MODELS[provider].map((m) => m.id);
}

/** Het standaard-model voor een provider (eerste in de lijst). */
export function defaultModelFor(provider: AiProvider): string {
  if (provider === 'auto') return '';
  return PROVIDER_MODELS[provider][0]?.id ?? '';
}

/** Hoort `model` bij `provider`? Zo niet, dan val terug op de default. */
export function isValidModelFor(provider: AiProvider, model: string | undefined): boolean {
  if (provider === 'auto') return true;
  return !!model && modelIds(provider).includes(model);
}

/** Leesbare naam van een model-id (voor de samenvatting onder de keuze). */
export function modelLabel(provider: AiProvider, model: string | undefined): string {
  if (provider === 'auto' || !model) return '';
  return PROVIDER_MODELS[provider].find((m) => m.id === model)?.label ?? model;
}

/**
 * Formatteer een prijs per 1M tokens kort en leesbaar, bijv. "$5" of "$0,14".
 * Komma als decimaalteken (NL); hele getallen zonder decimalen.
 */
export function formatPrice(usdPerMillion: number): string {
  const str = Number.isInteger(usdPerMillion)
    ? String(usdPerMillion)
    : usdPerMillion.toFixed(2).replace('.', ',');
  return `$${str}`;
}

/** Korte kostenregel: "$5 in / $25 uit per 1M tokens". */
export function pricingSummary(pricing: ModelPricing): string {
  return `${formatPrice(pricing.input)} in / ${formatPrice(pricing.output)} uit per 1M tokens`;
}

/** Label voor de gebruikte provider in het resultaat. */
export const PROVIDER_LABELS: Record<string, string> = {
  claude: 'Claude (Anthropic)',
  openai: 'GPT-5 (OpenAI)',
  deepseek: 'DeepSeek',
  mistral: 'Mistral',
  'local-template': 'Lokale template (geen AI)',
};
