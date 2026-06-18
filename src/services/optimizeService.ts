import { getAnonKey, getFunctionUrl, isSupabaseConfigured } from '@/lib/supabase';
import type { AiProvider } from '@/config/aiModels';
import type { OptimizeResult, Technique } from '@/types';

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
}): Promise<OptimizeResult> {
  const { technique, promptContent, followUpAnswers, preferredProvider } = args;

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
          techniqueId: technique.id,
          template: technique.template,
          promptContent,
          followUpAnswers,
          preferredProvider: preferredProvider ?? 'auto',
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
