import { getAnonKey, getFunctionUrl, isSupabaseConfigured } from '@/lib/supabase';
import type { AiProvider } from '@/config/aiModels';
import type {
  OptimizeResult,
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
          preferredProvider: preferredProvider ?? 'auto',
          systemPrompt,
          toneInstruction,
          temperature,
        }),
      });

      if (!response.ok) {
        throw new Error(`Edge function gaf status ${response.status}`);
      }

      const data = (await response.json()) as Partial<OptimizeResult>;
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
      const haystack =
        `${t.name} ${t.description ?? ''} ${t.strength ?? ''} ${(t.use_cases ?? []).join(' ')}`.toLowerCase();
      let score = 0;
      for (const w of words) if (haystack.includes(w)) score += 1;
      return { t, score };
    })
    .sort((a, b) => b.score - a.score);
  const top = scored.filter((s) => s.score > 0).slice(0, 3);
  const chosen = top.length > 0 ? top : scored.slice(0, 2);
  return chosen.map(({ t }) => ({ id: t.id, reason: 'Mogelijk passend op basis van je doel.' }));
}

/**
 * Beveelt de best passende technieken aan bij een door de gebruiker beschreven doel.
 * Roept de edge function in 'recommend'-modus aan; faalt dat, dan lokale matching.
 */
export async function recommendTechniques(args: {
  goal: string;
  techniques: Technique[];
  preferredProvider?: AiProvider;
}): Promise<RecommendResult> {
  const { goal, techniques, preferredProvider } = args;
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
        }),
      });

      if (!response.ok) {
        throw new Error(`Edge function gaf status ${response.status}`);
      }

      const data = (await response.json()) as Partial<RecommendResult>;
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
