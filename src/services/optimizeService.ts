import { getAnonKey, getFunctionUrl, isSupabaseConfigured } from '@/lib/supabase';
import { readNdjsonEvents, streamNdjson, type StreamOutcome } from '@/lib/ndjsonStream';
import { isContextPrompt, structureFormat } from '@/lib/techniques';
import { tidyPromptMarkup } from '@/lib/utils';
import type { AiProvider } from '@/config/aiModels';
import type {
  AnalyzeResult,
  ClarifyResult,
  FrameworkFit,
  FrameworkFitResult,
  FrameworkRecommendResult,
  MissingField,
  OptimizeResult,
  PlanResult,
  PlanRoutingOption,
  PlanStep,
  PlanStepResult,
  PromptPlan,
  Recurrence,
  PrefilledField,
  PrefillResult,
  RecommendResult,
  StepOutcome,
  StepProduces,
  Technique,
  TechniqueRecommendation,
  TranscriptTurn,
} from '@/types';

/**
 * Vult een techniek-template met de prompt-inhoud en vervolgvragen.
 * {{PROMPT}} -> promptContent, {{vraag_id}} -> antwoord.
 * Wordt zowel lokaal als (referentie) server-side gebruikt.
 */
export function fillTemplate(
  template: string,
  promptContent: string,
  answers: Record<string, string>,
): string {
  let result = template.replace(/\{\{\s*PROMPT\s*\}\}/g, promptContent);
  for (const [key, value] of Object.entries(answers)) {
    const pattern = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
    result = result.replace(pattern, value?.trim() ? value.trim() : `[${key}]`);
  }
  // Eventuele niet-ingevulde placeholders netjes opruimen.
  result = result.replace(/\{\{\s*([\w-]+)\s*\}\}/g, '[$1]');
  return result.trim();
}

/**
 * Callback die tijdens het streamen wordt aangeroepen met de VOLLEDIGE tekst tot
 * nu toe (niet alleen het nieuwe fragment). Zo kan een component de waarde direct
 * in state zetten zonder zelf te hoeven optellen.
 */
export type { StreamHandler } from '@/lib/ndjsonStream';
import type { StreamHandler } from '@/lib/ndjsonStream';

/**
 * Roept de edge function in streamende modus aan. De eigenlijke NDJSON-lezer
 * staat in `@/lib/ndjsonStream` (gedeeld met de chat); deze wrapper vult alleen
 * de url en de anon-headers in. Alle bestaande aanroepen blijven ongewijzigd.
 */
async function streamFromFunction(
  body: Record<string, unknown>,
  onChunk: StreamHandler,
  tidy: (text: string) => string = (t) => t,
): Promise<StreamOutcome> {
  const functionUrl = getFunctionUrl('optimize-prompt');
  if (!functionUrl) throw new Error('Geen edge function geconfigureerd');

  const anonKey = getAnonKey();
  return streamNdjson({
    url: functionUrl,
    headers: anonKey ? { Authorization: `Bearer ${anonKey}`, apikey: anonKey } : {},
    body,
    onChunk,
    tidy,
  });
}

/**
 * Optimaliseer een prompt. Roept de Supabase Edge Function aan (Claude met
 * DeepSeek-fallback) wanneer geconfigureerd; anders een lokale template-fill.
 */
export async function optimizePrompt(args: {
  technique: Technique;
  promptContent: string;
  followUpAnswers: Record<string, string>;
  preferredProvider?: AiProvider;
  /** Concreet API-model binnen de provider; leeg = server-default voor die provider. */
  preferredModel?: string;
  /** Admin-hoofdprompt (systeeminstructie); leeg = server-default. */
  systemPrompt?: string;
  /** Admin-toon/schrijfstijl die aan de prompt wordt meegegeven. */
  toneInstruction?: string;
  /** Admin-creativiteit (0–1). */
  temperature?: number;
  /**
   * Extra gelabelde antwoordvelden bovenop de vervolgvragen van de techniek.
   * Gebruikt door de plan-bouwer om het verzamelde materiaal van eerdere stappen
   * (persona, format, brief) als context aan de eind-compose mee te geven, in
   * exact het formaat dat de generate-modus als "ANTWOORDEN VAN DE GEBRUIKER"
   * verwerkt. Leeg = gewone enkele-techniek-generatie.
   */
  extraAnsweredFields?: { id: string; label: string; answer: string }[];
  /**
   * Het vraag-na-vraag-interview (chain-of-thought/socratic) is al ÍN de tool
   * gevoerd; de conclusie zit bij de antwoorden. De generator maakt dan een
   * direct uitvoerbare, uitgewerkte prompt in plaats van een prompt die de
   * dialoog nog moet "aanzetten".
   */
  interviewResolved?: boolean;
  /**
   * Meelezen terwijl de AI schrijft. Geef je dit mee, dan vraagt de service een
   * streamend antwoord en roept `onChunk` aan met de tekst tot dan toe — de
   * gebruiker ziet de prompt ontstaan in plaats van tientallen seconden een
   * spinner. De uiteindelijke retourwaarde is identiek aan die zonder streamen,
   * dus bestaande aanroepers hoeven niets te veranderen.
   */
  onChunk?: StreamHandler;
}): Promise<OptimizeResult> {
  const {
    technique,
    promptContent,
    followUpAnswers,
    preferredProvider,
    preferredModel,
    systemPrompt,
    toneInstruction,
    temperature,
    extraAnsweredFields,
    interviewResolved,
    onChunk,
  } = args;

  const functionUrl = getFunctionUrl('optimize-prompt');

  if (isSupabaseConfigured && functionUrl) {
    try {
      const anonKey = getAnonKey();
      const payload = {
        mode: 'generate',
        techniqueId: technique.id,
        template: technique.template,
        promptContent,
        followUpAnswers,
        // Verrijkende context zodat het model de antwoorden kan analyseren
        // en uitschrijven i.p.v. de template letterlijk in te vullen.
        techniqueName: technique.name,
        techniqueDescription: technique.description,
        techniqueStrength: technique.strength,
        // Context-raamwerken (CARE, CRISP, …) krijgen server-side de vaste
        // #-koppenstructuur opgelegd; losse technieken houden hun eigen vorm.
        isContextPrompt: isContextPrompt(technique),
        // Welke vaste uitvoerstructuur de generator moet afdwingen (CARE-koppen,
        // Few-Shot-blokken, …). Undefined = de AI bepaalt zelf de vorm.
        structureFormat: structureFormat(technique),
        // Interview al in de tool gevoerd → uitgewerkte prompt i.p.v. dialoog-aanzet.
        interviewResolved: Boolean(interviewResolved),
        answeredFields: [
          ...technique.follow_up_questions.map((q) => ({
            id: q.id,
            label: q.label,
            answer: followUpAnswers[q.id] ?? '',
          })),
          // Materiaal uit eerdere plan-stappen als gelabelde context (plan-bouwer).
          ...(extraAnsweredFields ?? []),
        ].filter((f) => f.answer.trim()),
        preferredProvider: preferredProvider ?? 'auto',
        preferredModel,
        systemPrompt,
        toneInstruction,
        temperature,
      };

      // Meelezen gevraagd? Dan de streamende route: de eerste regels staan er na
      // ongeveer een seconde in plaats van na de volledige generatie.
      if (onChunk) {
        const streamed = await streamFromFunction(payload, onChunk, tidyPromptMarkup);
        if (streamed.unclear) {
          return {
            optimized_content: '',
            success: false,
            unclear: true,
            reason: streamed.reason,
            provider: (streamed.provider as OptimizeResult['provider']) ?? 'claude',
          };
        }
        if (streamed.error) throw new Error(streamed.error);
        if (!streamed.text.trim()) throw new Error('De AI-service gaf een lege prompt terug');
        return {
          optimized_content: tidyPromptMarkup(streamed.text),
          success: true,
          provider: (streamed.provider as OptimizeResult['provider']) ?? 'claude',
        };
      }

      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(anonKey ? { Authorization: `Bearer ${anonKey}`, apikey: anonKey } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Edge function gaf status ${response.status}`);
      }

      const data = (await response.json()) as Partial<OptimizeResult>;
      // Clarity-gate: de AI vond de input onzin en maakte bewust geen template.
      // Geef dit ongewijzigd door — NIET terugvallen op een lokale template,
      // want dan zou de gebruiker alsnog een (lege) template krijgen.
      if (data.unclear) {
        return {
          optimized_content: '',
          success: false,
          unclear: true,
          reason: data.reason,
          provider: (data.provider as OptimizeResult['provider']) ?? 'claude',
        };
      }
      if (data.success && data.optimized_content) {
        return {
          // Sterretjes van het model opruimen op de plek waar élke consument
          // (tonen, kopiëren, uitvoeren, opslaan) de prompt ophaalt.
          optimized_content: tidyPromptMarkup(data.optimized_content),
          success: true,
          provider: (data.provider as OptimizeResult['provider']) ?? 'claude',
        };
      }
      throw new Error(data.error ?? 'Onbekende fout van de optimalisatie-service');
    } catch (err) {
      // Val terug op lokale template als de remote-call faalt.
      const message = err instanceof Error ? err.message : 'Onbekende fout';
      return {
        optimized_content: fillTemplate(technique.template, promptContent, followUpAnswers),
        success: true,
        provider: 'local-template',
        error: `Remote optimalisatie mislukt (${message}); lokale template gebruikt.`,
      };
    }
  }

  // Geen backend: gebruik de lokale template-fill (deterministisch, geen API).
  return {
    optimized_content: fillTemplate(technique.template, promptContent, followUpAnswers),
    success: true,
    provider: 'local-template',
  };
}

/**
 * Alias voor de generatorflow: genereert een herbruikbare prompt-template.
 * Functioneel identiek aan `optimizePrompt` — de generator denkt in "genereren".
 */
export const generatePrompt = optimizePrompt;

/**
 * Maximale omvang van het testantwoord dat mee de refine in gaat: genoeg om te
 * laten zien wat de template doet, zonder de aanroep onnodig groot te maken.
 */
const MAX_REFINE_TEST_ANSWER_CHARS = 6_000;

/**
 * Herschrijft een gegenereerde template op basis van een testrun in de
 * Testkamer: het testantwoord plus de feedback van de gebruiker sturen een
 * gerichte revisie (mode 'refine'). Anders dan `generatePrompt` behoudt dit wat
 * werkte; er is geen lokale fallback — zonder AI-service honest-degrade.
 */
export async function refinePrompt(args: {
  /** De te verbeteren prompt-template (de actieve versie). */
  previousPrompt: string;
  /** Het antwoord dat de testrun opleverde; wordt hier afgekapt. */
  testAnswer: string;
  /** De feedback van de gebruiker (vrije tekst en/of aangevinkte punten). */
  feedback: string;
  preferredProvider?: AiProvider;
  preferredModel?: string;
  temperature?: number;
  /** Meelezen terwijl de AI de herschreven template schrijft. */
  onChunk?: StreamHandler;
}): Promise<OptimizeResult> {
  const { previousPrompt, testAnswer, feedback, preferredProvider, preferredModel, temperature, onChunk } =
    args;
  const functionUrl = getFunctionUrl('optimize-prompt');

  if (!isSupabaseConfigured || !functionUrl) {
    return {
      optimized_content: '',
      success: false,
      provider: 'local-template',
      error: 'Geen AI-service beschikbaar om de prompt te verbeteren.',
    };
  }

  const payload = {
    mode: 'refine',
    refinePrompt: previousPrompt,
    refineTestAnswer: testAnswer.slice(0, MAX_REFINE_TEST_ANSWER_CHARS),
    refineFeedback: feedback,
    preferredProvider: preferredProvider ?? 'auto',
    preferredModel,
    temperature,
  };

  try {
    const anonKey = getAnonKey();

    if (onChunk) {
      const streamed = await streamFromFunction(payload, onChunk, tidyPromptMarkup);
      if (streamed.error) throw new Error(streamed.error);
      const content = tidyPromptMarkup(streamed.text).trim();
      if (!content) throw new Error('De AI-service gaf een lege prompt terug');
      return {
        optimized_content: content,
        success: true,
        provider: (streamed.provider as OptimizeResult['provider']) ?? 'claude',
      };
    }

    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(anonKey ? { Authorization: `Bearer ${anonKey}`, apikey: anonKey } : {}),
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`Edge function gaf status ${response.status}`);

    const data = (await response.json()) as Partial<OptimizeResult>;
    if (data.success && data.optimized_content) {
      return {
        optimized_content: tidyPromptMarkup(data.optimized_content),
        success: true,
        provider: (data.provider as OptimizeResult['provider']) ?? 'claude',
      };
    }
    throw new Error(data.error ?? 'De prompt kon niet worden verbeterd');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Onbekende fout';
    return {
      optimized_content: '',
      success: false,
      provider: 'local-template',
      error: `Verbeteren mislukt (${message}).`,
    };
  }
}

/**
 * Vult een persona-definitie in op basis van een korte aanduiding ("mijn
 * teammanager"): de AI leidt af hoe zo'n rol zich doorgaans gedraagt en vult de
 * meegegeven persona-velden concreet in. De gebruiker kan alles daarna aanpassen.
 */
export async function fillPersona(args: {
  hint: string;
  questions: { id: string; label: string; why?: string }[];
  context?: string;
  preferredProvider?: AiProvider;
  preferredModel?: string;
}): Promise<{ success: boolean; fields: { id: string; value: string }[]; error?: string; unclear?: boolean; reason?: string }> {
  const { hint, questions, context, preferredProvider, preferredModel } = args;
  const functionUrl = getFunctionUrl('optimize-prompt');
  if (!isSupabaseConfigured || !functionUrl) {
    return { success: false, fields: [], error: 'Geen AI-service beschikbaar om de persona in te vullen.' };
  }
  try {
    const anonKey = getAnonKey();
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(anonKey ? { Authorization: `Bearer ${anonKey}`, apikey: anonKey } : {}),
      },
      body: JSON.stringify({
        mode: 'persona-fill',
        personaHint: hint,
        personaContext: context,
        personaQuestions: questions,
        preferredProvider: preferredProvider ?? 'auto',
        preferredModel,
      }),
    });
    if (!response.ok) throw new Error(`Edge function gaf status ${response.status}`);
    const data = (await response.json()) as {
      success?: boolean;
      fields?: { id: string; value: string }[];
      error?: string;
      unclear?: boolean;
      reason?: string;
    };
    if (data.unclear) return { success: false, fields: [], unclear: true, reason: data.reason };
    if (data.success && Array.isArray(data.fields)) {
      return { success: true, fields: data.fields };
    }
    return { success: false, fields: [], error: data.error ?? 'De persona kon niet worden ingevuld.' };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Onbekende fout';
    return { success: false, fields: [], error: `Persona invullen mislukt (${message}).` };
  }
}

/** Gedeelde POST naar de optimize-prompt edge function; geeft de JSON terug. */
async function postOptimize<T>(body: Record<string, unknown>): Promise<T | null> {
  const functionUrl = getFunctionUrl('optimize-prompt');
  if (!isSupabaseConfigured || !functionUrl) return null;
  const anonKey = getAnonKey();
  const response = await fetch(functionUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(anonKey ? { Authorization: `Bearer ${anonKey}`, apikey: anonKey } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Edge function gaf status ${response.status}`);
  return (await response.json()) as T;
}

/**
 * Genereert één concept-input→output-voorbeeldpaar voor de few-shot-bouwer, op
 * basis van de taakbeschrijving. Gebruikt wanneer de gebruiker (nog) geen eigen
 * voorbeeld heeft; de gebruiker stelt het daarna bij.
 */
export async function generateFewShotExample(args: {
  input?: string;
  output?: string;
  format?: string;
  labels?: string;
  preferredProvider?: AiProvider;
  preferredModel?: string;
}): Promise<{ success: boolean; example?: { input: string; output: string }; error?: string }> {
  try {
    const data = await postOptimize<{
      success?: boolean;
      example?: { input: string; output: string };
      error?: string;
    }>({
      mode: 'fewshot-example',
      fsInput: args.input,
      fsOutput: args.output,
      fsFormat: args.format,
      fsLabels: args.labels,
      preferredProvider: args.preferredProvider ?? 'auto',
      preferredModel: args.preferredModel,
    });
    if (!data) return { success: false, error: 'Geen AI-service beschikbaar.' };
    if (data.success && data.example) return { success: true, example: data.example };
    return { success: false, error: data.error ?? 'Kon geen voorbeeld genereren.' };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Onbekende fout.' };
  }
}

/**
 * Analyseert de few-shot-voorbeelden: welke KENMERKEN over te nemen, welke
 * CASUS-SPECIFIEKE details weg te laten, plus (bij meerdere voorbeelden) een
 * dekkings- en consistentie-observatie. Dit is de kern van de few-shot-bouwer.
 */
export async function extractFewShot(args: {
  input?: string;
  output?: string;
  format?: string;
  labels?: string;
  pairs: { input: string; output: string }[];
  preferredProvider?: AiProvider;
  preferredModel?: string;
}): Promise<{
  success: boolean;
  kenmerken?: { label: string; detail: string }[];
  casus_specifiek?: { label: string; detail: string }[];
  dekking?: string;
  consistentie?: string;
  error?: string;
}> {
  try {
    const data = await postOptimize<{
      success?: boolean;
      kenmerken?: { label: string; detail: string }[];
      casus_specifiek?: { label: string; detail: string }[];
      dekking?: string;
      consistentie?: string;
      error?: string;
    }>({
      mode: 'fewshot-extract',
      fsInput: args.input,
      fsOutput: args.output,
      fsFormat: args.format,
      fsLabels: args.labels,
      fsPairs: args.pairs,
      preferredProvider: args.preferredProvider ?? 'auto',
      preferredModel: args.preferredModel,
    });
    if (!data) return { success: false, error: 'Geen AI-service beschikbaar.' };
    if (data.success) {
      return {
        success: true,
        kenmerken: data.kenmerken ?? [],
        casus_specifiek: data.casus_specifiek ?? [],
        dekking: data.dekking ?? '',
        consistentie: data.consistentie ?? '',
      };
    }
    return { success: false, error: data.error ?? 'Analyse mislukt.' };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Onbekende fout.' };
  }
}

/**
 * Meta-prompting: laat de AI een uitvoerbare PROMPT bouwen op basis van het ruwe
 * verzoek van de gebruiker (de AI beantwoordt het verzoek dus NIET zelf). Levert
 * de prompt, een toelichting (incl. de Chain-of-Thought-afweging) en of CoT is
 * opgenomen. Optionele `feedback` laat de gebruiker de prompt bijstellen.
 */
export async function buildMetaPrompt(args: {
  request: string;
  feedback?: string;
  preferredProvider?: AiProvider;
  preferredModel?: string;
}): Promise<{
  success: boolean;
  prompt?: string;
  toelichting?: string;
  cotGebruikt?: boolean;
  error?: string;
  unclear?: boolean;
  reason?: string;
}> {
  try {
    const data = await postOptimize<{
      success?: boolean;
      prompt?: string;
      toelichting?: string;
      cot_gebruikt?: boolean;
      error?: string;
      unclear?: boolean;
      reason?: string;
    }>({
      mode: 'meta-build',
      metaRequest: args.request,
      metaFeedback: args.feedback,
      preferredProvider: args.preferredProvider ?? 'auto',
      preferredModel: args.preferredModel,
    });
    if (!data) return { success: false, error: 'Geen AI-service beschikbaar.' };
    if (data.unclear) return { success: false, unclear: true, reason: data.reason };
    if (data.success && data.prompt) {
      return {
        success: true,
        prompt: data.prompt,
        toelichting: data.toelichting ?? '',
        cotGebruikt: Boolean(data.cot_gebruikt),
      };
    }
    return { success: false, error: data.error ?? 'De prompt kon niet worden gebouwd.' };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Onbekende fout.' };
  }
}

/** Lokale trefwoord-matching als de backend niet beschikbaar is of faalt. */
function localRecommend(goal: string, techniques: Technique[]): TechniqueRecommendation[] {
  const words = new Set(
    goal
      .toLowerCase()
      .split(/[^a-zà-ÿ0-9]+/)
      .filter((w) => w.length > 3),
  );

  const scored = techniques
    .map((t) => {
      // Welke gebruikssituaties van de techniek raken het doel van de gebruiker?
      const matchedUseCases = (t.use_cases ?? []).filter((uc) => {
        const lc = uc.toLowerCase();
        return [...words].some((w) => lc.includes(w));
      });
      const haystack =
        `${t.name} ${t.description ?? ''} ${t.strength ?? ''} ${(t.use_cases ?? []).join(' ')}`.toLowerCase();
      let score = 0;
      for (const w of words) if (haystack.includes(w)) score += 1;
      return { t, score, matchedUseCases };
    })
    .sort((a, b) => b.score - a.score);

  const top = scored.filter((s) => s.score > 0).slice(0, 3);
  const chosen = top.length > 0 ? top : scored.slice(0, 2);

  return chosen.map(({ t, score, matchedUseCases }) => ({
    id: t.id,
    reason: buildLocalReason(t, score, matchedUseCases),
    value: buildLocalValue(t, matchedUseCases),
  }));
}

/**
 * Bouw een korte "waarom dit de beste optie is"-zin zonder AI. Koppelt de
 * gematchte gebruikssituatie of de kracht aan het doel, zodat de oranje
 * onderbouwing ook offline gevuld is.
 */
function buildLocalValue(technique: Technique, matchedUseCases: string[]): string {
  if (matchedUseCases.length > 0) {
    return `Goede keuze omdat je doel aansluit op "${matchedUseCases[0].toLowerCase()}".`;
  }
  if (technique.strength) {
    return technique.strength.split(/(?<=[.!?])\s/)[0];
  }
  return '';
}

/** Bouw een doel-specifieke motivatie zonder AI: koppel het doel aan de techniek. */
function buildLocalReason(
  technique: Technique,
  score: number,
  matchedUseCases: string[],
): string {
  if (matchedUseCases.length > 0) {
    return `Past bij je doel: deze techniek is sterk voor "${matchedUseCases[0].toLowerCase()}".`;
  }
  if (score > 0 && technique.strength) {
    // Eerste zin van de kracht als beknopte motivatie.
    const firstSentence = technique.strength.split(/(?<=[.!?])\s/)[0];
    return `Sluit aan op je doel. ${firstSentence}`;
  }
  if (technique.strength) {
    return `Breed inzetbaar voor jouw vraag. ${technique.strength.split(/(?<=[.!?])\s/)[0]}`;
  }
  return 'Mogelijk passend op basis van je doel.';
}

/**
 * Beveelt de best passende technieken aan bij een door de gebruiker beschreven doel.
 * Roept de edge function in 'recommend'-modus aan; faalt dat, dan lokale matching.
 */
export async function recommendTechniques(args: {
  goal: string;
  techniques: Technique[];
  preferredProvider?: AiProvider;
  preferredModel?: string;
}): Promise<RecommendResult> {
  const { goal, techniques, preferredProvider, preferredModel } = args;
  const functionUrl = getFunctionUrl('optimize-prompt');

  if (isSupabaseConfigured && functionUrl) {
    try {
      const anonKey = getAnonKey();
      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(anonKey ? { Authorization: `Bearer ${anonKey}`, apikey: anonKey } : {}),
        },
        body: JSON.stringify({
          mode: 'recommend',
          goal,
          techniques: techniques.map((t) => ({
            id: t.id,
            name: t.name,
            description: t.description,
            strength: t.strength,
            use_cases: t.use_cases,
          })),
          preferredProvider: preferredProvider ?? 'auto',
          preferredModel,
        }),
      });

      if (!response.ok) {
        throw new Error(`Edge function gaf status ${response.status}`);
      }

      const data = (await response.json()) as Partial<RecommendResult>;
      // Clarity-gate: het doel was onzin → geef het verdict door i.p.v. terug te
      // vallen op lokale matching (die zou alsnog willekeurige technieken tonen).
      if (data.unclear) {
        return {
          recommendations: [],
          success: false,
          unclear: true,
          reason: data.reason,
          provider: (data.provider as RecommendResult['provider']) ?? 'claude',
        };
      }
      if (data.success && Array.isArray(data.recommendations)) {
        // Behoud alleen aanbevelingen die naar bestaande technieken verwijzen.
        const valid = new Set(techniques.map((t) => t.id));
        const recommendations = data.recommendations.filter((r) => valid.has(r.id));
        if (recommendations.length > 0) {
          return {
            recommendations,
            success: true,
            provider: (data.provider as RecommendResult['provider']) ?? 'claude',
          };
        }
      }
      throw new Error(data.error ?? 'Geen passende technieken gevonden');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Onbekende fout';
      return {
        recommendations: localRecommend(goal, techniques),
        success: true,
        provider: 'local-template',
        error: `Slimme aanbeveling mislukt (${message}); lokale suggestie gebruikt.`,
      };
    }
  }

  return {
    recommendations: localRecommend(goal, techniques),
    success: true,
    provider: 'local-template',
  };
}

/** Ruwe stap zoals de edge function die teruggeeft (nog niet gedecoreerd). */
interface RawPlanStep {
  technique_id: string;
  title: string;
  rationale: string;
  produces: StepProduces;
}

/**
 * Decoreer een ruwe plan-stap tot een volledige {@link PlanStep}: geef hem een
 * stabiele id en leid `structure_format`/`interactive` client-side af uit de
 * echte techniek (via {@link structureFormat}). De AI bepaalt de structuur dus
 * niet zelf — dat blijft consistent met de rest van de generator.
 */
function decoratePlanStep(
  raw: RawPlanStep,
  index: number,
  techniqueById: Map<string, Technique>,
): PlanStep {
  const technique = techniqueById.get(raw.technique_id);
  const format = technique ? structureFormat(technique) : undefined;
  return {
    id: `step-${index + 1}`,
    technique_id: raw.technique_id,
    title: raw.title,
    rationale: raw.rationale,
    produces: raw.produces,
    structure_format: format,
    interactive: format === 'chain-of-thought' || format === 'socratic',
  };
}

/**
 * Waarborgt dat een plan ALTIJD met de Chain-of-Thought-stap BEGINT. Die stap
 * haalt vraag voor vraag het totaalplaatje op bij de gebruiker; alle volgende
 * stappen bouwen daarop voort (hun velden worden ermee voor-ingevuld) en
 * versterken het beeld. De planner krijgt deze regel ook mee, maar dit is de
 * harde garantie — ook voor het lokale fallback-plan. Staat de techniek al
 * vooraan, dan blijft het plan ongewijzigd; staat hij verderop, dan schuift hij
 * naar voren; ontbreekt hij, dan komt hij er vooraan bij.
 */
function withCotFirst(plan: PromptPlan, techniques: Technique[]): PromptPlan {
  const cot = techniques.find((t) => structureFormat(t) === 'chain-of-thought');
  if (!cot) return plan; // techniek niet beschikbaar → plan ongewijzigd laten
  const index = plan.steps.findIndex((s) => s.technique_id === cot.id);
  if (index === 0) return plan;
  const byId = new Map(techniques.map((t) => [t.id, t]));
  const steps =
    index > 0
      ? [plan.steps[index], ...plan.steps.filter((_, i) => i !== index)]
      : [
          decoratePlanStep(
            {
              technique_id: cot.id,
              title: 'Breng je vraagstuk scherp in beeld',
              rationale:
                'We halen eerst vraag voor vraag het totaalplaatje op; alle volgende stappen bouwen daarop voort.',
              produces: 'brief',
            },
            0,
            byId,
          ),
          ...plan.steps,
        ];
  // Hernummer de stap-ids, zodat ze uniek blijven en de volgorde volgen.
  return { ...plan, steps: steps.map((s, i) => ({ ...s, id: `step-${i + 1}` })) };
}

/** Bouw een eenvoudig lokaal plan (geen backend): top-techniek + compose-stap. */
function localPlan(goal: string, techniques: Technique[]): PromptPlan {
  const recs = localRecommend(goal, techniques);
  const byId = new Map(techniques.map((t) => [t.id, t]));
  const base = (recs[0] && byId.get(recs[0].id)) ?? techniques[0];
  const steps: PlanStep[] = [];
  if (base) {
    steps.push(
      decoratePlanStep(
        {
          technique_id: base.id,
          title: `Werk je doel uit met ${base.name}`,
          rationale: base.strength?.split(/(?<=[.!?])\s/)[0] ?? 'Passend bij je doel.',
          produces: 'brief',
        },
        0,
        byId,
      ),
      decoratePlanStep(
        {
          technique_id: base.id,
          title: 'Stel de complete prompt samen',
          rationale: 'Giet het verzamelde materiaal in één herbruikbare prompt.',
          produces: 'text',
        },
        1,
        byId,
      ),
    );
  }
  return {
    goal,
    summary: 'Een eenvoudig plan op basis van je doel (lokale suggestie).',
    steps,
  };
}

/**
 * Stelt een slim, geordend PLAN op van prompttechnieken die samen één sterke,
 * herbruikbare template opbouwen (doel-flow). Roept de edge function in
 * 'plan'-modus aan; faalt dat, dan een eenvoudig lokaal plan. Elke stap wordt
 * client-side gedecoreerd met de afgeleide `structure_format`/`interactive`.
 */
export async function generatePlan(args: {
  goal: string;
  techniques: Technique[];
  preferredProvider?: AiProvider;
  preferredModel?: string;
  /**
   * Het antwoord op de routingvraag, als de planner die eerder terugstelde. Is dit
   * gezet, dan staat de herhaalbaarheid vast en vraagt de planner niet opnieuw.
   */
  recurrence?: Recurrence;
}): Promise<PlanResult> {
  const { goal, techniques, preferredProvider, preferredModel, recurrence } = args;
  const functionUrl = getFunctionUrl('optimize-prompt');
  const byId = new Map(techniques.map((t) => [t.id, t]));

  if (isSupabaseConfigured && functionUrl) {
    try {
      const anonKey = getAnonKey();
      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(anonKey ? { Authorization: `Bearer ${anonKey}`, apikey: anonKey } : {}),
        },
        body: JSON.stringify({
          mode: 'plan',
          goal,
          techniques: techniques.map((t) => ({
            id: t.id,
            name: t.name,
            description: t.description,
            strength: t.strength,
            use_cases: t.use_cases,
            // Extra plan-signalen: de planner weegt raamwerk-vs-techniek en de
            // vaste structuur mee om een zinvolle volgorde te kiezen.
            is_framework: isContextPrompt(t),
            structure_format: structureFormat(t),
          })),
          preferredProvider: preferredProvider ?? 'auto',
          preferredModel,
          recurrence,
        }),
      });

      if (!response.ok) {
        throw new Error(`Edge function gaf status ${response.status}`);
      }

      const data = (await response.json()) as {
        success?: boolean;
        plan?: { summary?: string; steps?: RawPlanStep[] };
        provider?: PlanResult['provider'];
        unclear?: boolean;
        reason?: string;
        error?: string;
        needs_routing?: boolean;
        question?: string;
        options?: PlanRoutingOption[];
      };

      // Clarity-gate: het doel was onzin → geef het verdict door i.p.v. terug te
      // vallen op een lokaal plan (dat zou alsnog willekeurige stappen tonen).
      if (data.unclear) {
        return {
          success: false,
          unclear: true,
          reason: data.reason,
          provider: data.provider ?? 'claude',
        };
      }

      // Routing-gate: de herhaalbaarheid is niet af te leiden uit het doel. Geef de
      // vraag door i.p.v. een lokaal plan; de wizard legt hem voor en plant opnieuw.
      if (data.needs_routing && data.question && Array.isArray(data.options) && data.options.length > 0) {
        return {
          success: false,
          routing: { question: data.question, options: data.options },
          provider: data.provider ?? 'claude',
        };
      }

      if (data.success && data.plan && Array.isArray(data.plan.steps)) {
        // Behoud alleen stappen die naar bestaande technieken verwijzen, en
        // decoreer ze met de client-side afgeleide structuur.
        const steps = data.plan.steps
          .filter((s) => byId.has(s.technique_id))
          .map((s, i) => decoratePlanStep(s, i, byId));
        if (steps.length > 0) {
          return {
            // Harde garantie: het plan begint altijd met de Chain-of-Thought-stap.
            plan: withCotFirst({ goal, summary: data.plan.summary ?? '', steps }, techniques),
            success: true,
            provider: data.provider ?? 'claude',
          };
        }
      }
      throw new Error(data.error ?? 'Geen bruikbaar plan ontvangen');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Onbekende fout';
      return {
        plan: withCotFirst(localPlan(goal, techniques), techniques),
        success: true,
        provider: 'local-template',
        error: `Slim plan mislukt (${message}); lokaal plan gebruikt.`,
      };
    }
  }

  return {
    plan: withCotFirst(localPlan(goal, techniques), techniques),
    success: true,
    provider: 'local-template',
  };
}

/** Menselijk leesbaar label per stap-uitkomst, voor de doorgegeven context. */
function produceLabel(produces: StepProduces): string {
  switch (produces) {
    case 'persona':
      return 'PERSONA';
    case 'format':
      return 'FORMAT';
    case 'brief':
      return 'BRIEF';
    default:
      return 'MATERIAAL';
  }
}

/**
 * Serialiseert de verzamelde stap-uitkomsten tot een compact tekstblok dat als
 * "materiaal uit eerdere stappen" naar de volgende stap gaat. Dit IS de
 * thread-seam: "dat wat gemaakt is gebruikt voor de volgende stap".
 */
export function serializeOutcomes(outcomes: StepOutcome[]): string {
  return outcomes
    .filter((o) => o.material.trim())
    .map((o, i) => `${produceLabel(o.produces)} (uit stap ${i + 1}):\n${o.material.trim()}`)
    .join('\n\n');
}

/**
 * Voert één plan-stap uit. Twee smaken:
 *  - Niet-interactief: verzamelt in één keer het uitgeschreven MATERIAAL (persona,
 *    format-rubrieken, brief), voortbouwend op eerdere stappen.
 *  - Interactief (chain-of-thought / socratic): één beurt in een vraag-na-vraag-
 *    interview. Levert óf `needs_input`+`question` (nog een vraag), óf `done`+
 *    `material` (genoeg info, brief geconsolideerd) op basis van het `transcript`.
 * Produceert bewust GEEN template (dat doet alleen de eind-compose via
 * {@link generatePrompt}). Faalt de AI, dan honest-degrade: `{success:false,
 * error}` zodat de wizard een retry toont — nooit nep-materiaal.
 */
export async function runPlanStep(args: {
  goal: string;
  step: PlanStep;
  techniqueName?: string;
  /** Compact tekstblok van eerdere uitkomsten (zie {@link serializeOutcomes}). */
  outcomesSummary?: string;
  /** Interactieve stap? Dan stelt de AI één vraag tegelijk i.p.v. materiaal. */
  interactive?: boolean;
  /** Het vraag-na-vraag-transcript tot nu toe (alleen interactieve stap). */
  transcript?: TranscriptTurn[];
  /** De gebruiker wil geen input meer geven → rond het interview af met een conclusie. */
  forceFinish?: boolean;
  /** Er is nog geen doel/context: laat de AI eerst vragen wat de gebruiker wil bereiken. */
  noContext?: boolean;
  preferredProvider?: AiProvider;
  preferredModel?: string;
}): Promise<PlanStepResult> {
  const {
    goal,
    step,
    techniqueName,
    outcomesSummary,
    interactive,
    transcript,
    forceFinish,
    noContext,
    preferredProvider,
    preferredModel,
  } = args;
  const functionUrl = getFunctionUrl('optimize-prompt');

  if (!isSupabaseConfigured || !functionUrl) {
    // Geen backend: er is geen zinvolle lokale manier om materiaal te schrijven.
    // Honest-degrade — de wizard slaat de stap over of toont een retry.
    return {
      success: false,
      provider: 'local-template',
      error: 'Geen AI-service beschikbaar om materiaal te genereren.',
    };
  }

  try {
    const anonKey = getAnonKey();
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(anonKey ? { Authorization: `Bearer ${anonKey}`, apikey: anonKey } : {}),
      },
      body: JSON.stringify({
        mode: 'plan-step',
        goal,
        stepTitle: step.title,
        stepProduces: step.produces,
        stepTechniqueName: techniqueName,
        outcomesSummary,
        stepInteractive: Boolean(interactive),
        // Bepaalt de interview-toon: socratic (alleen vragen) vs chain-of-thought.
        stepFormat: interactive ? step.structure_format : undefined,
        transcript: interactive ? (transcript ?? []) : undefined,
        forceFinish: interactive ? Boolean(forceFinish) : undefined,
        noContext: interactive ? Boolean(noContext) : undefined,
        preferredProvider: preferredProvider ?? 'auto',
        preferredModel,
      }),
    });

    if (!response.ok) {
      throw new Error(`Edge function gaf status ${response.status}`);
    }

    const data = (await response.json()) as {
      success?: boolean;
      material?: string;
      needs_input?: boolean;
      question?: string;
      done?: boolean;
      provider?: PlanStepResult['provider'];
      unclear?: boolean;
      reason?: string;
      error?: string;
    };

    if (data.unclear) {
      return {
        success: false,
        unclear: true,
        reason: data.reason,
        provider: data.provider ?? 'claude',
      };
    }
    // Interactief: de AI heeft nog een vraag nodig.
    if (data.success && data.needs_input && data.question?.trim()) {
      return {
        success: true,
        needs_input: true,
        question: data.question.trim(),
        provider: data.provider ?? 'claude',
      };
    }
    // Materiaal of afgeronde interview-brief.
    if (data.success && data.material?.trim()) {
      return {
        success: true,
        done: true,
        material: data.material.trim(),
        provider: data.provider ?? 'claude',
      };
    }
    return {
      success: false,
      provider: data.provider ?? 'claude',
      error: data.error ?? 'Geen materiaal ontvangen voor deze stap.',
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Onbekende fout';
    return {
      success: false,
      provider: 'local-template',
      error: `Stap mislukt (${message}).`,
    };
  }
}

/**
 * Analyseert één plan-stap op basis van de INPUT van de gebruiker (de antwoorden
 * op de vervolgvragen van de techniek) plus het doel en eerdere stappen. Levert
 * het (voorlopige) materiaal én de hiaten: wat de gebruiker nog moet aanleveren
 * voor het totale plaatje. Herhaalbaar met een `clarification` tot de gebruiker
 * tevreden is. Faalt de AI, dan honest-degrade (`{success:false, error}`).
 */
export async function analyzePlanStep(args: {
  goal: string;
  step: PlanStep;
  technique: Technique;
  /** De antwoorden van de gebruiker op de vervolgvragen van de techniek. */
  answers: Record<string, string>;
  /** Compact tekstblok van eerdere uitkomsten (zie {@link serializeOutcomes}). */
  outcomesSummary?: string;
  /** Optionele extra toelichting uit de "wat mist nog"-lus. */
  clarification?: string;
  /**
   * Extra gelabelde velden bovenop de vervolgvragen (bijv. de gestructureerde
   * persona-definitie uit de PersonaBuilder). Worden meegewogen bij de analyse.
   */
  extraAnsweredFields?: { id: string; label: string; answer: string }[];
  preferredProvider?: AiProvider;
  preferredModel?: string;
}): Promise<PlanStepResult> {
  const {
    goal,
    step,
    technique,
    answers,
    outcomesSummary,
    clarification,
    extraAnsweredFields,
    preferredProvider,
    preferredModel,
  } = args;
  const functionUrl = getFunctionUrl('optimize-prompt');

  if (!isSupabaseConfigured || !functionUrl) {
    return {
      success: false,
      provider: 'local-template',
      error: 'Geen AI-service beschikbaar om deze stap te analyseren.',
    };
  }

  // Zet de antwoorden om naar gelabelde velden (zoals de generate-modus verwacht),
  // plus eventuele extra velden (bijv. de persona-definitie).
  const answeredFields = [
    ...technique.follow_up_questions.map((q) => ({
      id: q.id,
      label: q.label,
      answer: answers[q.id] ?? '',
    })),
    ...(extraAnsweredFields ?? []),
  ].filter((f) => f.answer.trim());

  try {
    const anonKey = getAnonKey();
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(anonKey ? { Authorization: `Bearer ${anonKey}`, apikey: anonKey } : {}),
      },
      body: JSON.stringify({
        mode: 'plan-step-analyze',
        goal,
        stepTitle: step.title,
        stepProduces: step.produces,
        stepTechniqueName: technique.name,
        outcomesSummary,
        answeredFields,
        clarification: clarification?.trim() || undefined,
        preferredProvider: preferredProvider ?? 'auto',
        preferredModel,
      }),
    });

    if (!response.ok) {
      throw new Error(`Edge function gaf status ${response.status}`);
    }

    const data = (await response.json()) as {
      success?: boolean;
      material?: string;
      summary?: string;
      gaps?: { label: string; question: string }[];
      provider?: PlanStepResult['provider'];
      unclear?: boolean;
      reason?: string;
      error?: string;
    };

    if (data.unclear) {
      return { success: false, unclear: true, reason: data.reason, provider: data.provider ?? 'claude' };
    }
    if (data.success && data.material?.trim()) {
      return {
        success: true,
        material: data.material.trim(),
        summary: data.summary,
        gaps: Array.isArray(data.gaps) ? data.gaps : [],
        provider: data.provider ?? 'claude',
      };
    }
    return {
      success: false,
      provider: data.provider ?? 'claude',
      error: data.error ?? 'Geen analyse ontvangen voor deze stap.',
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Onbekende fout';
    return { success: false, provider: 'local-template', error: `Stap-analyse mislukt (${message}).` };
  }
}

/**
 * Eén beurt van de doel-dialoog (clarify-modus): de gebruiker beschrijft in eigen
 * woorden wat die wil bereiken en de AI denkt stap voor stap mee met één vraag per
 * beurt — eerst over het vraagstuk zelf, dan verdiepend, en tot slot over gebruik
 * en vorm (chatgesprek, zelfstandige assistent of programma; tekst, code, beeld, …).
 * Die laatste antwoorden bepalen straks welk framework past.
 *
 * Levert óf `needs_input`+`question` (de volgende vraag), óf `done`+`brief` (de
 * uitgeschreven opdrachtbeschrijving). Er komt bewust GEEN template uit deze
 * modus. Faalt de AI, dan honest-degrade: `{success:false, error}` zodat de UI
 * een retry toont in plaats van een verzonnen vraag.
 */
export async function runClarifyTurn(args: {
  /** Wat de gebruiker in eigen woorden beschreef; blijft de hele dialoog gelijk. */
  goal: string;
  /** Het vraag-en-antwoordgesprek tot nu toe. */
  transcript?: TranscriptTurn[];
  /** De gebruiker wil geen vragen meer beantwoorden → rond af met wat er ligt. */
  forceFinish?: boolean;
  preferredProvider?: AiProvider;
  preferredModel?: string;
}): Promise<ClarifyResult> {
  try {
    const data = await postOptimize<{
      success?: boolean;
      needs_input?: boolean;
      question?: string;
      asked?: number;
      max?: number;
      done?: boolean;
      brief?: string;
      provider?: ClarifyResult['provider'];
      unclear?: boolean;
      reason?: string;
      error?: string;
    }>({
      mode: 'clarify',
      goal: args.goal,
      transcript: args.transcript ?? [],
      forceFinish: Boolean(args.forceFinish),
      preferredProvider: args.preferredProvider ?? 'auto',
      preferredModel: args.preferredModel,
    });
    if (!data) {
      return {
        success: false,
        provider: 'local-template',
        error: 'Geen AI-service beschikbaar voor het gesprek.',
      };
    }
    if (data.unclear) {
      return {
        success: false,
        unclear: true,
        reason: data.reason,
        provider: data.provider ?? 'claude',
      };
    }
    if (data.success && data.needs_input && data.question?.trim()) {
      return {
        success: true,
        needs_input: true,
        question: data.question.trim(),
        asked: data.asked,
        max: data.max,
        provider: data.provider ?? 'claude',
      };
    }
    if (data.success && data.brief?.trim()) {
      return {
        success: true,
        done: true,
        brief: data.brief.trim(),
        provider: data.provider ?? 'claude',
      };
    }
    return {
      success: false,
      provider: data.provider ?? 'claude',
      error: data.error ?? 'Er kwam geen vraag of samenvatting terug.',
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Onbekende fout';
    return { success: false, provider: 'local-template', error: `Gesprek mislukt (${message}).` };
  }
}

/** Eén door de AI blootgelegde aanname in de eindtemplate, als vraag aan de gebruiker. */
export interface TemplateAssumption {
  label: string;
  question: string;
}

/**
 * Socratische eindcontrole van de plan-bouwer: toetst de gegenereerde
 * eindtemplate tegen het doel en het door de gebruiker aangeleverde materiaal,
 * en geeft de AANNAMES terug die erin geslopen zijn — elk als concrete vraag.
 * Best-effort: faalt de call of is er geen backend, dan `{success:false}` en
 * slaat de wizard de controle gewoon over (de template blijft bruikbaar).
 */
export async function checkAssumptions(args: {
  goal: string;
  templateContent: string;
  /** Compact tekstblok van de stap-uitkomsten (zie {@link serializeOutcomes}). */
  outcomesSummary?: string;
  preferredProvider?: AiProvider;
  preferredModel?: string;
}): Promise<{ success: boolean; assumptions: TemplateAssumption[]; error?: string }> {
  try {
    const data = await postOptimize<{
      success?: boolean;
      assumptions?: unknown;
      error?: string;
    }>({
      mode: 'assumption-check',
      goal: args.goal,
      templateContent: args.templateContent,
      outcomesSummary: args.outcomesSummary,
      preferredProvider: args.preferredProvider ?? 'auto',
      preferredModel: args.preferredModel,
    });
    if (!data) return { success: false, assumptions: [], error: 'Geen AI-service beschikbaar.' };
    if (data.success && Array.isArray(data.assumptions)) {
      const assumptions = (data.assumptions as TemplateAssumption[])
        .filter((a) => a && typeof a.question === 'string' && a.question.trim())
        .map((a) => ({ label: (a.label ?? '').trim(), question: a.question.trim() }));
      return { success: true, assumptions };
    }
    return { success: false, assumptions: [], error: data.error ?? 'Controle mislukt.' };
  } catch (err) {
    return {
      success: false,
      assumptions: [],
      error: err instanceof Error ? err.message : 'Onbekende fout.',
    };
  }
}

/**
 * Waar de framework-zoekactie op dit moment mee bezig is. Voedt de voortgangs-
 * tekst in de UI: dezelfde wachttijd voelt korter als zichtbaar is wát er gebeurt.
 *  - 'analyzing' → de prompt is verstuurd, de AI leest hem
 *  - 'weighing'  → er komt antwoord binnen; de frameworks worden afgewogen
 *  - 'writing'   → de motivaties worden geschreven (eerste veld is compleet)
 */
export type FrameworkSearchPhase = 'analyzing' | 'weighing' | 'writing';

/** Het afsluitende 'done'-event van de streamende framework-aanbeveling. */
interface FrameworkDoneEvent {
  summary?: string;
  recommendations?: unknown;
  missingContext?: unknown;
  provider?: string;
}

/**
 * Beveelt het best passende prompt framework (CARE, CRISP, …) aan op basis van
 * de EIGEN prompt van de gebruiker. Roept de edge function in
 * 'recommend-framework'-modus aan; faalt dat, dan lokale trefwoord-matching.
 *
 * Streamt: de samenvatting en elke afgeronde aanbeveling worden via de
 * `on*`-callbacks doorgegeven zodra ze binnen zijn, zodat de gebruiker niet naar
 * een stilstaande spinner kijkt tot het hele JSON-antwoord af is.
 */
export async function recommendFramework(args: {
  ownPrompt: string;
  frameworks: Technique[];
  preferredProvider?: AiProvider;
  preferredModel?: string;
  /**
   * Optionele toelichting van de gebruiker uit de heranalyse-lus: extra context
   * die de gebruiker zelf heeft aangevuld nadat de AI aangaf wat er nog ontbrak.
   * Wordt bij de heranalyse meegewogen zodat de aanbeveling beter aansluit.
   */
  clarification?: string;
  /**
   * De `ownPrompt` is de OPDRACHTBESCHRIJVING uit de doel-dialoog, geen door de
   * gebruiker geschreven prompt. De server weegt dan expliciet mee hoe de prompt
   * straks gebruikt wordt (chat / zelfstandige assistent / programma) en in welke
   * vorm de uitkomst moet landen.
   */
  fromDialogue?: boolean;
  /**
   * Voortgangsmelding terwijl de AI werkt. De aanroeper kan hiermee tonen wát er
   * gebeurt in plaats van een stilstaande spinner.
   */
  onPhase?: (phase: FrameworkSearchPhase) => void;
  /** De samenvatting is afgerond binnen (nog vóór de aanbevelingen). */
  onSummary?: (text: string) => void;
  /** Eén afgeronde aanbeveling; komt binnen zodra hij compleet is. */
  onRecommendation?: (rec: TechniqueRecommendation) => void;
}): Promise<FrameworkRecommendResult> {
  const {
    ownPrompt,
    frameworks,
    preferredProvider,
    preferredModel,
    clarification,
    fromDialogue,
    onPhase,
    onSummary,
    onRecommendation,
  } = args;
  const functionUrl = getFunctionUrl('optimize-prompt');

  if (isSupabaseConfigured && functionUrl) {
    try {
      const anonKey = getAnonKey();
      const valid = new Set(frameworks.map((t) => t.id));
      const keep = (list: unknown): TechniqueRecommendation[] =>
        (Array.isArray(list) ? (list as TechniqueRecommendation[]) : []).filter(
          (r) => r && typeof r.id === 'string' && valid.has(r.id),
        );

      // Tussenstand uit de stream; het afsluitende 'done'-event is leidend.
      let streamedSummary = '';
      const streamedRecs: TechniqueRecommendation[] = [];
      let done: FrameworkDoneEvent | null = null;
      let streamError = '';

      const read = await readNdjsonEvents({
        url: functionUrl,
        headers: anonKey ? { Authorization: `Bearer ${anonKey}`, apikey: anonKey } : {},
        body: {
          mode: 'recommend-framework',
          ownPrompt,
          clarification,
          fromDialogue: Boolean(fromDialogue),
          techniques: frameworks.map((t) => ({
            id: t.id,
            name: t.name,
            // Beschrijving, doel (strength) en gebruikssituaties bepalen samen of
            // een raamwerk bij dit vraagstuk past; die gaan dus alle drie mee.
            description: t.description,
            strength: t.strength,
            use_cases: t.use_cases,
            // Laat de server dezelfde scheiding raamwerk/techniek toepassen.
            family: t.family,
          })),
          preferredProvider: preferredProvider ?? 'auto',
          preferredModel,
        },
        onEvent: (ev) => {
          switch (ev.type) {
            case 'phase':
              onPhase?.(ev.phase as FrameworkSearchPhase);
              break;
            case 'summary':
              streamedSummary = typeof ev.text === 'string' ? ev.text : '';
              if (streamedSummary) onSummary?.(streamedSummary);
              break;
            case 'recommendation': {
              const [rec] = keep([ev.rec]);
              if (rec && !streamedRecs.some((r) => r.id === rec.id)) {
                streamedRecs.push(rec);
                onRecommendation?.(rec);
              }
              break;
            }
            case 'done':
              done = ev as FrameworkDoneEvent;
              break;
            case 'error':
              streamError = typeof ev.error === 'string' ? ev.error : 'Onbekende fout';
              break;
          }
        },
      });

      // Oudere edge function zonder stream-ondersteuning: gewoon één JSON-object.
      if (!read.streamed) {
        const data = (read.json ?? {}) as Partial<FrameworkRecommendResult>;
        const recommendations = keep(data.recommendations);
        if (data.success && recommendations.length > 0) {
          return {
            summary: data.summary ?? '',
            recommendations,
            missingContext: Array.isArray(data.missingContext) ? data.missingContext : [],
            success: true,
            provider: (data.provider as FrameworkRecommendResult['provider']) ?? 'claude',
          };
        }
        throw new Error(data.error ?? 'Geen passend prompt framework gevonden');
      }

      // Via de cast, omdat TypeScript de toekenning binnen de callback niet in
      // de control-flow meeneemt en `done` anders tot `never` versmalt.
      const settled = done as FrameworkDoneEvent | null;
      if (settled) {
        const recommendations = keep(settled.recommendations);
        if (recommendations.length > 0) {
          return {
            summary: settled.summary ?? streamedSummary,
            recommendations,
            missingContext: Array.isArray(settled.missingContext)
              ? (settled.missingContext as string[])
              : [],
            success: true,
            provider: (settled.provider as FrameworkRecommendResult['provider']) ?? 'claude',
          };
        }
      }

      // De stream brak af nadat er al aanbevelingen binnen waren: die zijn geldig
      // en bruikbaar, dus daar gaan we mee door in plaats van alles weg te gooien.
      if (streamedRecs.length > 0) {
        return {
          summary: streamedSummary,
          recommendations: streamedRecs,
          missingContext: [],
          success: true,
          provider: 'claude',
        };
      }

      throw new Error(streamError || 'Geen passend prompt framework gevonden');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Onbekende fout';
      return {
        summary: '',
        recommendations: localRecommend(ownPrompt, frameworks),
        missingContext: [],
        success: true,
        provider: 'local-template',
        error: `Slimme aanbeveling mislukt (${message}); lokale suggestie gebruikt.`,
      };
    }
  }

  return {
    summary: '',
    recommendations: localRecommend(ownPrompt, frameworks),
    missingContext: [],
    success: true,
    provider: 'local-template',
  };
}

/**
 * Lokale fallback voor de framework-fit-modus (geen backend). Grove trefwoord-
 * overlap tussen het vraagstuk en elk framework bepaalt of het "past". Levert
 * voor ELK framework een oordeel, zodat de UI ook zonder AI een vraagstuk-
 * gerelateerde regel per kaart kan tonen.
 */
function localFrameworkFit(ownPrompt: string, frameworks: Technique[]): FrameworkFit[] {
  const words = new Set(
    ownPrompt
      .toLowerCase()
      .split(/[^a-zà-ÿ0-9]+/)
      .filter((w) => w.length > 3),
  );
  return frameworks.map((t) => {
    const haystack =
      `${t.name} ${t.description ?? ''} ${t.strength ?? ''} ${(t.use_cases ?? []).join(' ')}`.toLowerCase();
    let score = 0;
    for (const w of words) if (haystack.includes(w)) score += 1;
    const fits = score >= 2;
    const firstStrength = t.strength ? t.strength.split(/(?<=[.!?])\s/)[0] : '';
    return {
      id: t.id,
      fits,
      value: fits
        ? firstStrength || 'Sluit aan bij wat je vraagstuk nodig heeft.'
        : 'Sluit minder duidelijk aan op de kern van je vraagstuk.',
      missing: fits
        ? ''
        : 'Maak in je prompt concreter welk onderwerp, doelgroep en soort tekst je bedoelt.',
    };
  });
}

/**
 * Beoordeelt ELK meegegeven framework tegen de geplakte prompt/het vraagstuk:
 * past het (fits), een vraagstuk-specifieke uitleg (value), en zo niet: wat er
 * nog bij moet om het wél te laten matchen (missing). Roept de edge function in
 * 'framework-fit'-modus aan; faalt dat, dan lokale trefwoord-matching.
 */
export async function explainFrameworkFit(args: {
  ownPrompt: string;
  frameworks: Technique[];
  preferredProvider?: AiProvider;
  preferredModel?: string;
}): Promise<FrameworkFitResult> {
  const { ownPrompt, frameworks, preferredProvider, preferredModel } = args;
  const functionUrl = getFunctionUrl('optimize-prompt');

  if (isSupabaseConfigured && functionUrl) {
    try {
      const anonKey = getAnonKey();
      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(anonKey ? { Authorization: `Bearer ${anonKey}`, apikey: anonKey } : {}),
        },
        body: JSON.stringify({
          mode: 'framework-fit',
          ownPrompt,
          techniques: frameworks.map((t) => ({
            id: t.id,
            name: t.name,
            description: t.description,
            strength: t.strength,
            use_cases: t.use_cases,
          })),
          preferredProvider: preferredProvider ?? 'auto',
          preferredModel,
        }),
      });

      if (!response.ok) {
        throw new Error(`Edge function gaf status ${response.status}`);
      }

      const data = (await response.json()) as Partial<FrameworkFitResult>;
      if (data.success && Array.isArray(data.fits)) {
        const valid = new Set(frameworks.map((t) => t.id));
        const fits = data.fits.filter((f) => valid.has(f.id));
        if (fits.length > 0) {
          return {
            fits,
            success: true,
            provider: (data.provider as FrameworkFitResult['provider']) ?? 'claude',
          };
        }
      }
      throw new Error(data.error ?? 'Geen fit-oordeel ontvangen');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Onbekende fout';
      return {
        fits: localFrameworkFit(ownPrompt, frameworks),
        success: true,
        provider: 'local-template',
        error: `Slimme fit-uitleg mislukt (${message}); lokale inschatting gebruikt.`,
      };
    }
  }

  return {
    fits: localFrameworkFit(ownPrompt, frameworks),
    success: true,
    provider: 'local-template',
  };
}

/**
 * Lokale fallback voor de prompt-analyse: markeer een veld als ontbrekend
 * wanneer geen van de trefwoorden uit het label/placeholder in de prompt
 * voorkomt. Grof, maar werkt zonder backend.
 */
function localAnalyze(ownPrompt: string, technique: Technique): MissingField[] {
  const haystack = ownPrompt.toLowerCase();
  return technique.follow_up_questions
    .filter((q) => {
      const cues = `${q.label} ${q.placeholder ?? ''}`
        .toLowerCase()
        .split(/[^a-zà-ÿ0-9]+/)
        .filter((w) => w.length > 3);
      return cues.length > 0 && !cues.some((w) => haystack.includes(w));
    })
    .map((q) => ({
      id: q.id,
      label: q.label,
      question: `Voeg informatie toe voor "${q.label}".`,
    }));
}

/**
 * Analyseert de eigen prompt van de gebruiker tegen de vereiste velden van de
 * gekozen prompt framework (CARE, CRISP, …) en geeft terug welke onderdelen nog
 * ontbreken. Roept de edge function in 'analyze'-modus aan; faalt dat, dan
 * lokale trefwoord-matching.
 */
export async function analyzePrompt(args: {
  ownPrompt: string;
  technique: Technique;
  preferredProvider?: AiProvider;
  preferredModel?: string;
}): Promise<AnalyzeResult> {
  const { ownPrompt, technique, preferredProvider, preferredModel } = args;
  const functionUrl = getFunctionUrl('optimize-prompt');

  if (isSupabaseConfigured && functionUrl) {
    try {
      const anonKey = getAnonKey();
      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(anonKey ? { Authorization: `Bearer ${anonKey}`, apikey: anonKey } : {}),
        },
        body: JSON.stringify({
          mode: 'analyze',
          ownPrompt,
          techniqueName: technique.name,
          analyzeFields: technique.follow_up_questions.map((q) => ({
            id: q.id,
            label: q.label,
            placeholder: q.placeholder,
          })),
          preferredProvider: preferredProvider ?? 'auto',
          preferredModel,
        }),
      });

      if (!response.ok) {
        throw new Error(`Edge function gaf status ${response.status}`);
      }

      const data = (await response.json()) as Partial<AnalyzeResult>;
      if (data.success && Array.isArray(data.missing)) {
        // Behoud alleen verwijzingen naar bestaande velden van de techniek.
        const valid = new Set(technique.follow_up_questions.map((q) => q.id));
        const missing = data.missing.filter((m) => valid.has(m.id));
        return {
          summary: data.summary ?? '',
          missing,
          success: true,
          provider: (data.provider as AnalyzeResult['provider']) ?? 'claude',
        };
      }
      throw new Error(data.error ?? 'Analyse gaf geen bruikbaar resultaat');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Onbekende fout';
      const missing = localAnalyze(ownPrompt, technique);
      return {
        summary:
          missing.length === 0
            ? 'Je prompt lijkt de belangrijkste onderdelen al te bevatten.'
            : `Er ${missing.length === 1 ? 'lijkt 1 onderdeel' : `lijken ${missing.length} onderdelen`} nog te ontbreken.`,
        missing,
        success: true,
        provider: 'local-template',
        error: `Slimme analyse mislukt (${message}); lokale controle gebruikt.`,
      };
    }
  }

  const missing = localAnalyze(ownPrompt, technique);
  return {
    summary:
      missing.length === 0
        ? 'Je prompt lijkt de belangrijkste onderdelen al te bevatten.'
        : `Er ${missing.length === 1 ? 'lijkt 1 onderdeel' : `lijken ${missing.length} onderdelen`} nog te ontbreken.`,
    missing,
    success: true,
    provider: 'local-template',
  };
}

/**
 * Ontleedt de eigen tekst/prompt van de gebruiker en vult de velden van de gekozen
 * techniek alvast voor: per veld een voorstel met herkomst ('prompt' = afgeleid uit
 * de tekst, 'ai' = suggestie) en een korte toelichting. Zo begint de gebruiker niet
 * met lege velden, maar met een controleerbare, aanpasbare basis. Roept de edge
 * function in 'prefill'-modus aan; lukt dat niet (of geen backend), dan een lege
 * voor-invulling zodat de UI gewoon met lege velden verdergaat.
 */
export async function prefillFields(args: {
  ownPrompt: string;
  technique: Technique;
  preferredProvider?: AiProvider;
  preferredModel?: string;
  /**
   * Optionele toelichting uit de "wat mist nog voor dit framework"-lus: extra
   * context die de gebruiker aanleverde nadat bleek welke velden nog ontbraken.
   * Wordt meegewogen zodat die velden nu concreet ingevuld worden.
   */
  clarification?: string;
  /**
   * De `ownPrompt` is een GEÜPLOAD DOCUMENT (geen losse prompt). De AI leest het
   * dan volledig door en analyseert de layout/structuur om de velden voor te vullen.
   */
  fromDocument?: boolean;
  /**
   * De `ownPrompt` OMSCHRIJFT het gewenste document (de gebruiker heeft geen
   * voorbeelddocument). De AI stelt dan zelf een passende structuur voor op
   * basis van gangbare (rijks)overheidsconventies.
   */
  fromFormatBrief?: boolean;
}): Promise<PrefillResult> {
  const {
    ownPrompt,
    technique,
    preferredProvider,
    preferredModel,
    clarification,
    fromDocument,
    fromFormatBrief,
  } = args;
  const content = ownPrompt.trim();
  const empty: PrefillResult = {
    summary: '',
    fields: [],
    success: true,
    provider: 'local-template',
  };
  if (!content) return empty;

  const functionUrl = getFunctionUrl('optimize-prompt');
  if (!isSupabaseConfigured || !functionUrl) return empty;

  const analyzeFields = technique.follow_up_questions.map((q) => ({
    id: q.id,
    label: q.label,
    placeholder: q.placeholder,
  }));

  try {
    const anonKey = getAnonKey();
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(anonKey ? { Authorization: `Bearer ${anonKey}`, apikey: anonKey } : {}),
      },
      body: JSON.stringify({
        mode: 'prefill',
        ownPrompt: content,
        clarification,
        fromDocument,
        fromFormatBrief,
        techniqueName: technique.name,
        analyzeFields,
        preferredProvider: preferredProvider ?? 'auto',
        preferredModel,
      }),
    });

    if (!response.ok) {
      // Diagnostisch: lees de servermelding mee zodat de echte reden zichtbaar wordt.
      const detail = await response.text().catch(() => '');
      console.error('[prefill] edge function', response.status, detail);
      throw new Error(`Edge function gaf status ${response.status}${detail ? ` — ${detail}` : ''}`);
    }

    const data = (await response.json()) as Partial<PrefillResult>;
    // Clarity-gate: de prompt was onzin → geef het verdict door.
    if (data.unclear) {
      return {
        summary: '',
        fields: [],
        success: false,
        unclear: true,
        reason: data.reason,
        provider: (data.provider as PrefillResult['provider']) ?? 'claude',
      };
    }
    if (data.success && Array.isArray(data.fields)) {
      // Behoud alleen voorstellen die naar bestaande velden van de techniek verwijzen.
      const valid = new Set(technique.follow_up_questions.map((q) => q.id));
      const fields: PrefilledField[] = data.fields.filter((f) => valid.has(f.id));
      return {
        summary: data.summary ?? '',
        fields,
        success: true,
        provider: (data.provider as PrefillResult['provider']) ?? 'claude',
      };
    }
    throw new Error(data.error ?? 'Prefill gaf geen bruikbaar resultaat');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Onbekende fout';
    // Voor-invullen is een hulp-laag: bij een fout gewoon lege velden, met een
    // niet-blokkerende melding zodat de gebruiker alsnog zelf kan invullen.
    return { ...empty, error: `Voor-invullen mislukt (${message}); begin met lege velden.` };
  }
}

/**
 * Verrijkt/breidt de tekst van ÉÉN framework-veld op zijn plek uit (de per-veld
 * "Vul verder aan"-actie). Roept de edge function in 'expand-field'-modus aan.
 * Al goed gevulde velden blijven grotendeels ongemoeid (changed:false). Faalt de
 * call, is er geen backend, of is het veld leeg, dan een veilige no-op die de
 * oorspronkelijke tekst van de gebruiker teruggeeft — deze helper gooit nooit.
 * Spiegelt het fetch/header/error-patroon van {@link prefillFields}.
 */
export async function expandField(args: {
  field: { id: string; label: string; placeholder?: string };
  currentValue: string;
  siblings: Array<{ label: string; value: string }>;
  techniqueName?: string;
  structureFormat?: string;
  preferredProvider?: AiProvider;
  preferredModel?: string;
}): Promise<{
  value: string;
  changed: boolean;
  improvements: string[];
  provider: string;
  success: boolean;
  error?: string;
}> {
  const { field, currentValue, siblings, techniqueName, structureFormat, preferredProvider, preferredModel } =
    args;
  const noop = {
    value: currentValue,
    changed: false,
    improvements: [] as string[],
    provider: 'local-template',
    success: true,
  } as const;

  const functionUrl = getFunctionUrl('optimize-prompt');
  if (!isSupabaseConfigured || !functionUrl || !currentValue.trim()) return { ...noop };

  try {
    const anonKey = getAnonKey();
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(anonKey ? { Authorization: `Bearer ${anonKey}`, apikey: anonKey } : {}),
      },
      body: JSON.stringify({
        mode: 'expand-field',
        fieldId: field.id,
        fieldLabel: field.label,
        fieldPlaceholder: field.placeholder,
        currentValue,
        siblings,
        techniqueName,
        structureFormat,
        preferredProvider: preferredProvider ?? 'auto',
        preferredModel,
      }),
    });

    if (!response.ok) {
      throw new Error(`Edge function gaf status ${response.status}`);
    }

    const data = (await response.json()) as {
      success?: boolean;
      value?: string;
      changed?: boolean;
      improvements?: unknown;
      provider?: string;
      error?: string;
    };

    if (data.success && typeof data.value === 'string') {
      const improvements = (Array.isArray(data.improvements) ? data.improvements : [])
        .filter((s): s is string => typeof s === 'string')
        .map((s) => s.trim())
        .filter(Boolean);
      return {
        value: data.value,
        changed: Boolean(data.changed),
        improvements,
        provider: data.provider ?? 'claude',
        success: true,
      };
    }
    throw new Error(data.error ?? 'Aanvullen gaf geen bruikbaar resultaat');
  } catch (err) {
    // Nooit gooien: behoud de tekst van de gebruiker en meld de fout niet-blokkerend.
    const message = err instanceof Error ? err.message : 'Onbekende fout';
    return {
      value: currentValue,
      changed: false,
      improvements: [],
      provider: 'local-template',
      success: false,
      error: `Aanvullen mislukt (${message}).`,
    };
  }
}

/**
 * Lokale fallback voor de titel: leid een korte titel af uit de gegenereerde
 * template zonder AI. Pak bij voorkeur de #Taak/vraag:-, #Rol:- of #Context:-kop,
 * anders de eerste zinvolle regel. Spiegelt de server-side `localTitle`.
 */
function localTitle(templateContent: string): string {
  const text = templateContent.trim();
  const clean = (s: string) => {
    const v = s
      .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
      .replace(/[.\s]+$/, '')
      .trim();
    return v.length > 70 ? `${v.slice(0, 67)}…` : v;
  };
  for (const key of ['taak', 'rol', 'context']) {
    const m = text.match(new RegExp(`#\\s*${key}[^:\\n]*:\\s*([^\\n]+)`, 'i'));
    if (m && m[1].trim()) return clean(m[1]);
  }
  const firstLine = text
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith('#'));
  if (firstLine) return clean(firstLine.split(/(?<=[.!?])\s/)[0]);
  return 'Nieuwe prompt';
}

/**
 * Bedenkt een korte, beschrijvende titel voor een gegenereerde prompt-template
 * door de edge function in 'title'-modus aan te roepen. Faalt dat (of geen
 * backend), dan een lokale samenvatting uit de inhoud.
 */
export async function generateTitle(args: {
  templateContent: string;
  preferredProvider?: AiProvider;
  preferredModel?: string;
}): Promise<string> {
  const { templateContent, preferredProvider, preferredModel } = args;
  const content = templateContent.trim();
  if (!content) return 'Nieuwe prompt';

  const functionUrl = getFunctionUrl('optimize-prompt');

  if (isSupabaseConfigured && functionUrl) {
    try {
      const anonKey = getAnonKey();
      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(anonKey ? { Authorization: `Bearer ${anonKey}`, apikey: anonKey } : {}),
        },
        body: JSON.stringify({
          mode: 'title',
          templateContent: content,
          preferredProvider: preferredProvider ?? 'auto',
          preferredModel,
        }),
      });

      if (!response.ok) {
        throw new Error(`Edge function gaf status ${response.status}`);
      }

      const data = (await response.json()) as { success?: boolean; title?: string };
      if (data.success && data.title?.trim()) {
        return data.title.trim();
      }
      throw new Error('Geen titel ontvangen');
    } catch {
      // Stilletjes terugvallen op een lokale titel; dit is een hulpsuggestie.
      return localTitle(content);
    }
  }

  return localTitle(content);
}

/** Voorgestelde metadata voor een gegenereerde template (eigen-prompt-/techniek-flow). */
export interface MetadataSuggestion {
  /** Voorgestelde titel op basis van de inhoud. */
  title: string;
  /** Voorgestelde korte omschrijving op basis van de inhoud. */
  description: string;
  /** Id van de best passende bestaande categorie, of null bij geen duidelijke match. */
  category_id: string | null;
}

/**
 * Stelt in één AI-call een titel, omschrijving én best passende categorie voor,
 * op basis van de gegenereerde template-inhoud. Roept de edge function in
 * 'metadata'-modus aan; faalt dat (of geen backend), dan een lokale titel zonder
 * omschrijving/categorie. Dit zijn hulp-suggesties die de gebruiker mag aanpassen.
 */
export async function generateMetadata(args: {
  templateContent: string;
  categories: { id: string; name: string; description?: string }[];
  preferredProvider?: AiProvider;
  preferredModel?: string;
}): Promise<MetadataSuggestion> {
  const { templateContent, categories, preferredProvider, preferredModel } = args;
  const content = templateContent.trim();
  if (!content) return { title: 'Nieuwe prompt', description: '', category_id: null };

  const functionUrl = getFunctionUrl('optimize-prompt');

  if (isSupabaseConfigured && functionUrl) {
    try {
      const anonKey = getAnonKey();
      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(anonKey ? { Authorization: `Bearer ${anonKey}`, apikey: anonKey } : {}),
        },
        body: JSON.stringify({
          mode: 'metadata',
          templateContent: content,
          metaCategories: categories.map((c) => ({
            id: c.id,
            name: c.name,
            description: c.description,
          })),
          preferredProvider: preferredProvider ?? 'auto',
          preferredModel,
        }),
      });

      if (!response.ok) {
        throw new Error(`Edge function gaf status ${response.status}`);
      }

      const data = (await response.json()) as Partial<MetadataSuggestion> & { success?: boolean };
      if (data.success && data.title?.trim()) {
        const valid = new Set(categories.map((c) => c.id));
        return {
          title: data.title.trim(),
          description: typeof data.description === 'string' ? data.description.trim() : '',
          category_id:
            typeof data.category_id === 'string' && valid.has(data.category_id)
              ? data.category_id
              : null,
        };
      }
      throw new Error('Geen metadata ontvangen');
    } catch {
      return { title: localTitle(content), description: '', category_id: null };
    }
  }

  return { title: localTitle(content), description: '', category_id: null };
}
