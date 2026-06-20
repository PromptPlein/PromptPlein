import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { AiProvider } from '@/config/aiModels';

/**
 * App-brede AI-instellingen die de admin beheert. Gelden voor ALLE
 * prompt-optimalisaties van klanten.
 *
 * Opslag (key/value in tabel `app_settings`):
 *  - `optimize_provider`  -> AiProvider (los, voor terugwaartse compatibiliteit)
 *  - `ai_settings`        -> JSON met de overige instellingen
 *
 * Faalt Supabase (of ontbreekt de tabel), dan valt alles terug op localStorage
 * zodat de feature altijd werkt.
 */

export interface AiSettings {
  /** Welke AI-provider er draait voor alle optimalisaties. */
  provider: AiProvider;
  /** Hoofd-/systeemprompt: hoe de AI zich moet gedragen. Leeg = ingebouwde default. */
  systemPrompt: string;
  /** Toon/schrijfstijl die aan elke optimalisatie wordt meegegeven. */
  toneInstruction: string;
  /** Creativiteit (temperature) van 0 (voorspelbaar) tot 1 (creatief). */
  temperature: number;
  /** Guardrail: waarschuw/blokkeer bij mogelijke persoonsgegevens in de invoer. */
  pii: {
    enabled: boolean;
    /** Tekst die de gebruiker te zien krijgt bij detectie. */
    warning: string;
  };
  /** Verboden onderwerpen/woorden — blokkeren optimaliseren tot bevestiging. */
  blockedTopics: string[];
}

export const DEFAULT_PII_WARNING =
  'Let op: je prompt lijkt persoonsgegevens te bevatten (zoals een naam, BSN, e-mailadres of telefoonnummer). ' +
  'Verwijder deze zo mogelijk voordat je de prompt deelt of optimaliseert.';

/** Ingebouwde standaard-systeeminstructie; ook de vooringevulde hoofd-prompt. */
export const DEFAULT_SYSTEM_PROMPT = `Je bent een expert in prompt-engineering voor de Nederlandse overheid.
Een interne overheidsmedewerker heeft via een prompting-techniek losse antwoorden gegeven.
Jouw taak: ANALYSEER al die antwoorden en SCHRIJF op basis daarvan één rijke, volledig
uitgewerkte, direct bruikbare prompt-template in het Nederlands voor in hun eigen AI-chat.

Werkwijze:
- Neem de antwoorden NIET één-op-één over; combineer ze tot vloeiende, samenhangende instructies.
- Leid uit de losse antwoorden een compleet beeld af van de persona, context, het doel en de
  gewenste uitkomst, en schrijf dat volledig uit. Laat doel en (indien van toepassing) persona
  duidelijk en expliciet naar voren komen.
- Maak de prompt uitgebreider en concreter dan de input: voeg passende structuur, duidelijke
  instructies en waar nuttig een gewenst format toe, zonder de intentie te veranderen.
- Pas de gekozen techniek consequent en herkenbaar toe.
- Laat ALLEEN de plekken die de gebruiker écht per keer zelf moet aanvullen staan als duidelijke
  [plaatshouder]; verzin daar geen inhoud voor, maar schrijf de omliggende instructies wél uit.
- Dit is uitsluitend voor INTERN overheidsgebruik; gebruik interne personas, geen burger-personas.
- Schrijf in duidelijke, professionele taal (waar passend B1-taalniveau).
- Geef ALLEEN de prompt-template terug, zonder inleiding, uitleg of opmaak-markeringen.`;

export const DEFAULT_AI_SETTINGS: AiSettings = {
  provider: 'auto',
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  toneInstruction: 'Schrijf in duidelijke, professionele taal op B1-taalniveau.',
  temperature: 0.4,
  pii: { enabled: true, warning: DEFAULT_PII_WARNING },
  // Standaard verboden onderwerpen op basis van de EU AI Act (art. 5
  // verboden praktijken + art. 5(1)(g)/AVG art. 9 bijzondere persoonsgegevens).
  // Bij een treffer wordt de gebruiker gewaarschuwd en moet die bevestigen.
  blockedTopics: [
    // Bijzondere persoonsgegevens (AVG art. 9 / AI Act art. 5(1)(g))
    'etniciteit',
    'ras',
    'politieke voorkeur',
    'religie',
    'geloofsovertuiging',
    'vakbondslidmaatschap',
    'seksuele geaardheid',
    'seksleven',
    'gezondheidsgegevens',
    'medisch dossier',
    'biometrische gegevens',
    'strafrechtelijk verleden',
    // Verboden AI-praktijken (AI Act art. 5)
    'social scoring',
    'voorspellend politiewerk',
    'risicoprofilering',
    'emotieherkenning',
    'gezichtsherkenning',
  ],
};

const PROVIDER_KEY = 'optimize_provider';
const SETTINGS_KEY = 'ai_settings';
const LOCAL_PROVIDER_KEY = 'opl.settings.optimize_provider';
const LOCAL_SETTINGS_KEY = 'opl.settings.ai_settings';
const VALID_PROVIDERS: AiProvider[] = ['auto', 'claude', 'openai', 'deepseek'];

function isProvider(value: unknown): value is AiProvider {
  return typeof value === 'string' && VALID_PROVIDERS.includes(value as AiProvider);
}

/** Vul ontbrekende velden aan met defaults en saneer types. */
function normalize(raw: Partial<AiSettings> | null | undefined): AiSettings {
  const d = DEFAULT_AI_SETTINGS;
  if (!raw || typeof raw !== 'object') return { ...d, pii: { ...d.pii }, blockedTopics: [] };
  const temp = typeof raw.temperature === 'number' ? raw.temperature : d.temperature;
  return {
    provider: isProvider(raw.provider) ? raw.provider : d.provider,
    systemPrompt: typeof raw.systemPrompt === 'string' ? raw.systemPrompt : d.systemPrompt,
    toneInstruction:
      typeof raw.toneInstruction === 'string' ? raw.toneInstruction : d.toneInstruction,
    temperature: Math.min(1, Math.max(0, temp)),
    pii: {
      enabled: raw.pii?.enabled ?? d.pii.enabled,
      warning:
        typeof raw.pii?.warning === 'string' && raw.pii.warning.trim()
          ? raw.pii.warning
          : d.pii.warning,
    },
    blockedTopics: Array.isArray(raw.blockedTopics)
      ? raw.blockedTopics.filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
      : [],
  };
}

const useSupabase = isSupabaseConfigured && Boolean(supabase);

function readLocal(): AiSettings {
  try {
    const raw = localStorage.getItem(LOCAL_SETTINGS_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<AiSettings>) : null;
    const provider = localStorage.getItem(LOCAL_PROVIDER_KEY);
    return normalize({ ...parsed, ...(isProvider(provider) ? { provider } : {}) });
  } catch {
    return normalize(null);
  }
}

function writeLocal(settings: AiSettings): void {
  try {
    localStorage.setItem(LOCAL_SETTINGS_KEY, JSON.stringify(settings));
    localStorage.setItem(LOCAL_PROVIDER_KEY, settings.provider);
  } catch {
    /* localStorage niet beschikbaar — negeren */
  }
}

/** Haal alle AI-instellingen op. Faalt nooit; ontbrekende velden -> defaults. */
export async function getAiSettings(): Promise<AiSettings> {
  if (useSupabase) {
    try {
      const { data, error } = await supabase!
        .from('app_settings')
        .select('key, value')
        .in('key', [PROVIDER_KEY, SETTINGS_KEY]);
      if (!error && data) {
        const byKey = Object.fromEntries(data.map((r) => [r.key, r.value]));
        let parsed: Partial<AiSettings> = {};
        if (byKey[SETTINGS_KEY]) {
          try {
            parsed = JSON.parse(byKey[SETTINGS_KEY]) as Partial<AiSettings>;
          } catch {
            /* corrupte JSON -> defaults */
          }
        }
        if (isProvider(byKey[PROVIDER_KEY])) parsed.provider = byKey[PROVIDER_KEY] as AiProvider;
        return normalize(parsed);
      }
    } catch {
      /* val terug op localStorage */
    }
  }
  return readLocal();
}

/** Sla alle AI-instellingen op (geldt voor alle klanten). */
export async function saveAiSettings(settings: AiSettings): Promise<void> {
  const clean = normalize(settings);
  writeLocal(clean);

  if (useSupabase) {
    const { error } = await supabase!.from('app_settings').upsert(
      [
        { key: PROVIDER_KEY, value: clean.provider },
        { key: SETTINGS_KEY, value: JSON.stringify(clean) },
      ],
      { onConflict: 'key' },
    );
    if (error) throw error;
  }
}

/** Alleen de provider — handig voor de optimizer die de rest niet nodig heeft. */
export async function getOptimizeProvider(): Promise<AiProvider> {
  return (await getAiSettings()).provider;
}
