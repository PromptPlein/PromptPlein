import { getAnonKey, getFunctionUrl, isSupabaseConfigured } from '@/lib/supabase';
import { isContextPrompt, structureFormat } from '@/lib/techniques';
import type { AiProvider } from '@/config/aiModels';
import type {
  AnalyzeResult,
  FrameworkRecommendResult,
  MissingField,
  OptimizeResult,
  PrefilledField,
  PrefillResult,
  RecommendResult,
  Technique,
  TechniqueRecommendation,
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
  } = args;

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
          answeredFields: technique.follow_up_questions
            .map((q) => ({
              id: q.id,
              label: q.label,
              answer: followUpAnswers[q.id] ?? '',
            }))
            .filter((f) => f.answer.trim()),
          preferredProvider: preferredProvider ?? 'auto',
          preferredModel,
          systemPrompt,
          toneInstruction,
          temperature,
        }),
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
          optimized_content: data.optimized_content,
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

/**
 * Beveelt het best passende prompt framework (CARE, CRISP, …) aan op basis van
 * de EIGEN prompt van de gebruiker. Roept de edge function in
 * 'recommend-framework'-modus aan; faalt dat, dan lokale trefwoord-matching.
 */
export async function recommendFramework(args: {
  ownPrompt: string;
  frameworks: Technique[];
  preferredProvider?: AiProvider;
  preferredModel?: string;
}): Promise<FrameworkRecommendResult> {
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
          mode: 'recommend-framework',
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

      const data = (await response.json()) as Partial<FrameworkRecommendResult>;
      if (data.success && Array.isArray(data.recommendations)) {
        const valid = new Set(frameworks.map((t) => t.id));
        const recommendations = data.recommendations.filter((r) => valid.has(r.id));
        if (recommendations.length > 0) {
          return {
            summary: data.summary ?? '',
            recommendations,
            success: true,
            provider: (data.provider as FrameworkRecommendResult['provider']) ?? 'claude',
          };
        }
      }
      throw new Error(data.error ?? 'Geen passend prompt framework gevonden');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Onbekende fout';
      return {
        summary: '',
        recommendations: localRecommend(ownPrompt, frameworks),
        success: true,
        provider: 'local-template',
        error: `Slimme aanbeveling mislukt (${message}); lokale suggestie gebruikt.`,
      };
    }
  }

  return {
    summary: '',
    recommendations: localRecommend(ownPrompt, frameworks),
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
}): Promise<PrefillResult> {
  const { ownPrompt, technique, preferredProvider, preferredModel } = args;
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
  return 'Nieuwe template';
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
  if (!content) return 'Nieuwe template';

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
  if (!content) return { title: 'Nieuwe template', description: '', category_id: null };

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
