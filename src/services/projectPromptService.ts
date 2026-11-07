// "Prompt maken" in een project en de context prompt in de chat: de vragenronde
// en de prompt.
//
// Alleen AI-aanroepen; opslaan loopt via chatProjectService, want het resultaat
// is gewoon de projectinstructie. Er is geen lokale tak: projecten vragen een
// account en daarmee een geconfigureerde Supabase.

import { getAnonKey, getFunctionUrl, isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { ChatSettings } from '@/services/settingsService';
import type { Technique } from '@/types';

export interface ProjectTurn {
  question: string;
  answer: string;
}

export interface ProjectInterviewStep {
  klaar: boolean;
  soort?: string;
  begrip?: string;
  vraag?: string;
  opties?: string[];
  max?: number;
}

export interface ProjectPromptDraft {
  prompt: string;
  framework?: { id: string; name: string };
  reden?: string;
  titel?: string;
}

/**
 * Technieken die een medewerker hier zou moeten voorbereiden of die zelf een
 * gesprek voeren, passen niet in een vaste prompt: Few-Shot vraagt voorbeelden
 * die de vragenronde niet ophaalt, de rest stelt zelf vragen of levert een prompt op.
 */
const NIET_VOOR_PROJECTPROMPT = /chain-of-thought|few-shot|meta|socrat|step-back|skill/i;

function projectFrameworks(techniques: Technique[]) {
  return techniques
    .filter((t) => t.is_active !== false)
    .filter((t) =>
      t.family === 'context' ? t.modality === 'text' : !NIET_VOOR_PROJECTPROMPT.test(t.name),
    )
    .map(({ id, name, description, template }) => ({ id, name, description, template }));
}

async function post<T extends { success?: boolean; error?: string }>(
  body: Record<string, unknown>,
  settings: ChatSettings | null,
  signal?: AbortSignal,
  /** De context prompt werkt net als de chat zelf ook zonder account. */
  openForGuests = false,
): Promise<T> {
  const functionUrl = getFunctionUrl('optimize-prompt');
  if (!isSupabaseConfigured || !supabase || !functionUrl) {
    throw new Error('Geen AI-service geconfigureerd. Neem contact op met de beheerder.');
  }
  const { data } = await supabase.auth.getSession();
  const anonKey = getAnonKey();
  const accessToken = data.session?.access_token ?? (openForGuests ? anonKey : undefined);
  if (!accessToken) throw new Error('Log in om een prompt voor je project te maken.');

  const response = await fetch(functionUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      ...(anonKey ? { apikey: anonKey } : {}),
    },
    // Het chatmodel uit Beheer: de prompt stuurt daarna elk gesprek in dit project.
    body: JSON.stringify({
      ...body,
      preferredProvider: settings?.provider,
      preferredModel: settings?.model,
    }),
    signal,
  });
  const result = (await response.json().catch(() => null)) as T | null;
  if (!response.ok || !result?.success) {
    throw new Error(result?.error || 'Dat lukte niet. Probeer het opnieuw.');
  }
  return result;
}

export function nextProjectQuestion(args: {
  goal: string;
  turns: ProjectTurn[];
  settings: ChatSettings | null;
  signal?: AbortSignal;
}): Promise<ProjectInterviewStep> {
  return post<ProjectInterviewStep & { success?: boolean; error?: string }>(
    { mode: 'project-interview', goal: args.goal, transcript: args.turns },
    args.settings,
    args.signal,
  );
}

export function writeProjectPrompt(args: {
  goal: string;
  turns: ProjectTurn[];
  soort?: string;
  techniques: Technique[];
  settings: ChatSettings | null;
  signal?: AbortSignal;
}): Promise<ProjectPromptDraft> {
  return post<ProjectPromptDraft & { success?: boolean; error?: string }>(
    {
      mode: 'project-prompt',
      goal: args.goal,
      transcript: args.turns,
      projectSoort: args.soort,
      techniques: projectFrameworks(args.techniques),
    },
    args.settings,
    args.signal,
  );
}

export function adjustProjectPrompt(args: {
  prompt: string;
  feedback: string;
  settings: ChatSettings | null;
  signal?: AbortSignal;
}): Promise<ProjectPromptDraft> {
  return post<ProjectPromptDraft & { success?: boolean; error?: string }>(
    {
      mode: 'project-prompt',
      projectPromptCurrent: args.prompt,
      projectPromptFeedback: args.feedback,
    },
    args.settings,
    args.signal,
  );
}

/** De volgende vraag bij een context prompt: hier gaat het om de taak van nu. */
export function nextContextQuestion(args: {
  goal: string;
  turns: ProjectTurn[];
  material?: string;
  settings: ChatSettings | null;
  signal?: AbortSignal;
}): Promise<ProjectInterviewStep> {
  return post<ProjectInterviewStep & { success?: boolean; error?: string }>(
    {
      mode: 'context-interview',
      goal: args.goal,
      transcript: args.turns,
      projectContext: args.material,
    },
    args.settings,
    args.signal,
    true,
  );
}

/** Kiest het framework en schrijft de prompt die in het tekstvak komt. */
export function writeContextPrompt(args: {
  goal: string;
  turns: ProjectTurn[];
  soort?: string;
  material?: string;
  techniques: Technique[];
  settings: ChatSettings | null;
  signal?: AbortSignal;
}): Promise<ProjectPromptDraft> {
  return post<ProjectPromptDraft & { success?: boolean; error?: string }>(
    {
      mode: 'context-prompt',
      goal: args.goal,
      transcript: args.turns,
      projectSoort: args.soort,
      projectContext: args.material,
      techniques: projectFrameworks(args.techniques),
    },
    args.settings,
    args.signal,
    true,
  );
}
