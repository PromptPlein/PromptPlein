/** Selecteerbare AI-modellen voor het optimaliseren van prompts. */

/**
 * Alle providers die de code kent. Claude en OpenAI staan er nog in zodat oude,
 * opgeslagen instellingen blijven parsen — welke providers écht gebruikt mogen
 * worden staat in {@link ENABLED_PROVIDERS}.
 */
export type AiProvider = 'auto' | 'claude' | 'openai' | 'deepseek' | 'mistral';

/**
 * De providers die PromptPlein daadwerkelijk gebruikt: alleen Mistral en
 * DeepSeek (beide Europees of goedkoop, en de sleutels die er zijn). Claude en
 * OpenAI zijn bewust uitgezet: hun code blijft staan zodat ze later weer aan
 * kunnen, maar ze zijn niet te kiezen en de fallback-keten slaat ze over.
 * Houd dit in sync met `ENABLED_PROVIDERS` in de `optimize-prompt` edge function.
 */
export const ENABLED_PROVIDERS: AiProvider[] = ['auto', 'deepseek', 'mistral'];

/** Mag deze provider gebruikt worden? Onbekend/uitgezet → false. */
export function isEnabledProvider(id: string | undefined): id is AiProvider {
  return Boolean(id) && ENABLED_PROVIDERS.includes(id as AiProvider);
}

export interface AiModelOption {
  id: AiProvider;
  label: string;
  hint: string;
  /**
   * Directe link naar de pagina waar je de API-sleutel van deze provider beheert.
   * Ontbreekt bij 'auto': die keten gebruikt alle providers, dus daar hoort geen
   * enkele portal bij.
   */
  apiKeysUrl?: string;
}

/** De keuzes in de admin: alleen wat er ook echt draait (zie ENABLED_PROVIDERS). */
export const AI_MODELS: AiModelOption[] = [
  { id: 'auto', label: 'Automatisch', hint: 'DeepSeek → Mistral, met fallback' },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    hint: 'Kostenefficiënt',
    apiKeysUrl: 'https://platform.deepseek.com/api_keys',
  },
  {
    id: 'mistral',
    label: 'Mistral',
    hint: 'Snel en goedkoop',
    apiKeysUrl: 'https://console.mistral.ai/api-keys',
  },
];

/**
 * De providers met een eigen API-portal, in de volgorde van de fallback-keten.
 * Gebruikt voor de "beheer je sleutels"-rij onder de modelkeuze.
 */
export const API_PORTALS = AI_MODELS.filter(
  (m): m is AiModelOption & { apiKeysUrl: string } => Boolean(m.apiKeysUrl),
);

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
 * Claude en OpenAI staan er nog in — ze zijn niet te kiezen (zie AI_MODELS),
 * maar oude opgeslagen model-ids moeten wel te valideren blijven.
 *
 * Prijzen zijn USD per 1M tokens, geverifieerd tegen de officiële prijslijsten:
 * Mistral in augustus 2026, de rest in juni 2026. Houd dit in sync met
 * `PROVIDER_MODELS` in de edge function.
 *
 * Bij Mistral staan bewust de `-latest`-aliassen in de id's en niet de gedateerde
 * snapshots: de alias schuift mee met een nieuwe generatie, de snapshot verloopt.
 * Per augustus 2026 wijzen ze naar `mistral-small-2603` (Small 4, maart 2026),
 * `mistral-medium-2604` (Medium 3.5, april 2026), `mistral-large-2512` (Large 3),
 * `ministral-8b-2512` en `ministral-3b-2512` (Ministral 3, december 2025).
 * Alleen label, hint en prijs hoeven dan bij te blijven — de id's niet.
 *
 * UITZONDERING: Ministral 3 14B staat er met de gedateerde `ministral-14b-2512`.
 * Die maat is nieuw in de Ministral 3-generatie, dus er is geen oudere
 * `ministral-14b-latest` waarvan vaststaat dat hij bestaat; de gedateerde id
 * staat wél letterlijk in Mistrals changelog. Blijkt de alias er te zijn, dan
 * mag deze id daarop over.
 *
 * Mistrals gespecialiseerde modellen staan er niet in: Codestral (code-aanvulling),
 * Voxtral (spraak), OCR, Shieldstral (moderatie), Leanstral (Lean 4-bewijzen) en
 * de embedding-modellen doen geen prompt-optimalisatie.
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
      label: 'Mistral Small 4',
      hint: 'Beste balans: instrueren, redeneren en code in één model',
      pricing: { input: 0.15, output: 0.6 },
    },
    {
      id: 'mistral-medium-latest',
      label: 'Mistral Medium 3.5',
      hint: 'Krachtigst: multimodaal, gemaakt voor agentisch werk en code',
      pricing: { input: 1.5, output: 7.5 },
    },
    {
      id: 'mistral-large-latest',
      label: 'Mistral Large 3',
      hint: 'Zwaar model tegen een schappelijke prijs, 675B met 41B actief',
      pricing: { input: 0.5, output: 1.5 },
    },
    {
      id: 'ministral-14b-2512',
      label: 'Ministral 3 14B',
      hint: 'Grootste Ministral, vlakke prijs in en uit',
      pricing: { input: 0.2, output: 0.2 },
    },
    {
      id: 'ministral-8b-latest',
      label: 'Ministral 3 8B',
      hint: 'Snel en goedkoop, vlakke prijs in en uit',
      pricing: { input: 0.15, output: 0.15 },
    },
    {
      id: 'ministral-3b-latest',
      label: 'Ministral 3 3B',
      hint: 'Goedkoopst en laagste latency',
      pricing: { input: 0.1, output: 0.1 },
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

/**
 * Het STERKSTE model per provider, voor aanroepen waar kwaliteit zwaarder weegt
 * dan de prijs per aanroep. Houd in sync met `STRONGEST_MODEL` in de
 * `optimize-prompt` edge function — die maakt de keuze echt; dit exemplaar is
 * er alleen om de admin te laten zien wat er gaat draaien.
 *
 * Let op: dit is NIET altijd het eerste model uit PROVIDER_MODELS. Die lijst
 * begint met de standaard (goedkoop en snel genoeg voor de chat); hier gaat het
 * juist om de bovenkant. Bij DeepSeek is Flash de standaard en Pro de sterkere.
 *
 * Bij Mistral staat hier bewust Small 4 en niet Medium 3.5, hoewel Medium 3.5
 * sterker is: die kost $1,50/$7,50 tegen $0,15/$0,60 per 1M tokens, dus tien tot
 * twaalf keer zo veel. Small 4 is hier het sterkste model dat de prijs per
 * projectinstelling nog verantwoordt. Wil je die bovengrens verleggen, zet dan
 * 'mistral-medium-latest' neer én dezelfde regel in de edge function.
 */
export const STRONGEST_MODELS: Record<Exclude<AiProvider, 'auto'>, string> = {
  claude: 'claude-opus-4-8',
  openai: 'gpt-5.5',
  deepseek: 'deepseek-v4-pro',
  mistral: 'mistral-small-latest',
};

/**
 * Leesbare naam van het sterkste model van deze provider. Bij 'auto' leeg: de
 * fallback-keten bepaalt dan zelf welke provider antwoordt.
 */
export function strongestModelLabelFor(provider: AiProvider): string {
  if (provider === 'auto') return '';
  return modelLabel(provider, STRONGEST_MODELS[provider]);
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

/**
 * Korte providernaam voor krappe plekken (de voortgangsweergave tijdens het
 * werken, waar twee modellen naast elkaar staan). Onbekende id's geven we
 * ongewijzigd terug: liever de ruwe naam dan een lege plek.
 */
export function providerShortLabel(id: string): string {
  const short: Record<string, string> = {
    claude: 'Claude',
    openai: 'GPT-5',
    deepseek: 'DeepSeek',
    mistral: 'Mistral',
    'local-template': 'Lokale template',
  };
  return short[id] ?? id;
}
