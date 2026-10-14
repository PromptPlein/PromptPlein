import { getAnonKey, getFunctionUrl, isSupabaseConfigured, supabase } from '@/lib/supabase';

/**
 * Beheer, Prompts: de systeemprompts van de edge function die de beheerder zelf
 * kan aanpassen. De standaardteksten staan in de edge function (die geeft ze
 * via de modus 'prompt-catalog' aan een beheerder); een eigen versie staat in
 * app_settings onder 'prompt_overrides' als JSON van id naar tekst. De server
 * leest die bij elke aanroep, met een korte cache van 30 seconden.
 */

export interface ServerPrompt {
  id: string;
  groep: string;
  titel: string;
  uitleg: string;
  standaard: string;
}

const OVERRIDES_KEY = 'prompt_overrides';

/** De lijst met prompts en hun standaardtekst. Alleen voor beheerders. */
export async function getPromptCatalog(): Promise<ServerPrompt[]> {
  const functionUrl = getFunctionUrl('optimize-prompt');
  if (!isSupabaseConfigured || !functionUrl || !supabase) {
    throw new Error('Geen verbinding met de AI-dienst geconfigureerd');
  }
  const anonKey = getAnonKey();
  const token = (await supabase.auth.getSession()).data.session?.access_token;
  if (!token) throw new Error('Log opnieuw in om de prompts te laden');
  const response = await fetch(functionUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(anonKey ? { apikey: anonKey } : {}),
    },
    body: JSON.stringify({ mode: 'prompt-catalog' }),
  });
  const data = (await response.json()) as { success?: boolean; prompts?: ServerPrompt[]; error?: string };
  if (!response.ok || !data.success || !Array.isArray(data.prompts)) {
    throw new Error(data.error ?? `De AI-dienst gaf status ${response.status}`);
  }
  return data.prompts;
}

/** De eigen versies die de beheerder heeft opgeslagen (id naar tekst). */
export async function getPromptOverrides(): Promise<Record<string, string>> {
  if (!isSupabaseConfigured || !supabase) return {};
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', OVERRIDES_KEY)
    .maybeSingle();
  if (error || !data?.value) return {};
  try {
    const parsed = JSON.parse(data.value as string) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).filter((e): e is [string, string] => typeof e[1] === 'string'),
    );
  } catch {
    return {};
  }
}

/**
 * Slaat de eigen versies op. Alleen teksten die afwijken van de standaard gaan
 * mee; een prompt zonder eigen versie draait op de standaard uit de code.
 */
export async function savePromptOverrides(overrides: Record<string, string>): Promise<void> {
  if (!isSupabaseConfigured || !supabase) throw new Error('Geen database geconfigureerd');
  const { error } = await supabase
    .from('app_settings')
    .upsert([{ key: OVERRIDES_KEY, value: JSON.stringify(overrides) }], { onConflict: 'key' });
  if (error) throw error;
}
