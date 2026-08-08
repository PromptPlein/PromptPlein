// Chatservice: verstuurt een gesprek naar de edge function (mode 'chat') en
// leest het antwoord streamend terug.
//
// Anders dan de generator-aanroepen authenticeert de chat met het
// SESSIE-token van de ingelogde gebruiker (niet de anon key): de edge function
// weigert de chat-modus voor anonieme aanroepen. Er is bewust géén lokale
// fallback — zonder AI-service is er geen chat (honest degrade).

import { getAnonKey, getFunctionUrl, isSupabaseConfigured, supabase } from '@/lib/supabase';
import { streamNdjson, type StreamHandler } from '@/lib/ndjsonStream';
import { CHAT_PREFIX } from '@/lib/chatStorage';
import { tidyChatReply } from '@/lib/utils';
import {
  composeChatOptimizePrompt,
  composeChatSystemPrompt,
  composeExecutionSystemPrompt,
  composeProjectOptimizePrompt,
  composeProjectSystemPrompt,
  MAX_CHAT_OPTIMIZE_CHARS,
  MAX_PROJECT_OPTIMIZE_CHARS,
  type ChatSettings,
} from '@/services/settingsService';
import type { ChatProjectContext } from '@/types';

/**
 * Schuivend venster: alleen de recentste berichten gaan mee. Houdt de payload
 * (en daarmee de time-to-first-token en de kosten) klein; de server kapt
 * daarbovenop nogmaals af.
 */
const CHAT_WINDOW_MESSAGES = 12;

export interface ChatSendResult {
  text: string;
  /** De provider die daadwerkelijk antwoordde (kan een fallback zijn). */
  provider?: string;
  /** Afgebroken met de stop-knop; `text` bevat de deeltekst. */
  aborted?: boolean;
  error?: string;
}

/** Verstuur het gesprek en stream het antwoord via `onChunk`. */
export async function sendChatMessage(args: {
  messages: { role: 'user' | 'assistant'; content: string }[];
  attachments: { name: string; text: string }[];
  settings: ChatSettings;
  onChunk: StreamHandler;
  signal?: AbortSignal;
  /**
   * 'execution': dit gesprek voert een gegenereerde prompt uit. Het draait dan
   * onder de neutrale uitvoer-systeemprompt (de prompt-template bepaalt zelf
   * taal, toon en opmaak), met het ruimere token-plafond server-side, en de
   * B1-huisregels worden NIET op het antwoord afgedwongen (geen tidyChatReply).
   */
  kind?: 'execution';
  /**
   * Het project waar dit gesprek onder valt. De projectinstructie wordt dan de
   * leidende systeemprompt en de bronbestanden gaan als bronblokken mee, vóór
   * de eventuele losse bijlagen van het gesprek zelf.
   */
  project?: ChatProjectContext | null;
}): Promise<ChatSendResult> {
  const { messages, attachments, settings, onChunk, signal, kind, project } = args;
  // Een uitvoergesprek en een projectgesprek sluiten elkaar uit; staat er toch
  // allebei iets klaar, dan wint de uitvoering (dat is een expliciete handoff).
  const isExecution = kind === 'execution';
  const isProject = !isExecution && Boolean(project);

  const functionUrl = getFunctionUrl('optimize-prompt');
  if (!isSupabaseConfigured || !supabase || !functionUrl) {
    return { text: '', error: 'Geen AI-service geconfigureerd. Neem contact op met de beheerder.' };
  }

  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (!accessToken) {
    return { text: '', error: 'Log in om de chat te gebruiken.' };
  }

  const anonKey = getAnonKey();
  // Uitvoergesprek: de prompt-template bepaalt zelf de huisregels, dus geen
  // B1-opschoning van het antwoord — anders zou de test misleiden over wat de
  // prompt echt doet (vet en opmaak zouden eruit worden gestript).
  //
  // Een PROJECTgesprek om dezelfde reden niet: daar bepaalt de projectinstructie
  // van de gebruiker de vorm. Zou tidyChatReply hier toch draaien, dan zouden de
  // B1-huisregels via de achterdeur alsnog zijn opmaak overrulen — precies wat
  // composeProjectSystemPrompt bewust weglaat.
  const tidy = isExecution || isProject ? (text: string) => text : tidyChatReply;
  try {
    const outcome = await streamNdjson({
      url: functionUrl,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(anonKey ? { apikey: anonKey } : {}),
      },
      body: {
        mode: 'chat',
        ...(isExecution ? { chatKind: 'execute' } : {}),
        ...(isProject ? { chatKind: 'project' } : {}),
        messages: messages.slice(-CHAT_WINDOW_MESSAGES),
        // Projectbronnen eerst, dan de losse bijlagen van dit ene gesprek. Ze
        // reizen door hetzelfde kanaal omdat het model ze op dezelfde manier
        // gebruikt; de volgorde zegt welke bron het meest gezaghebbend is.
        attachments: project ? [...project.files, ...attachments] : attachments,
        preferredProvider: settings.provider,
        preferredModel: settings.model,
        temperature: settings.temperature,
        // Huisregels van de beheerder + zijn basisinformatie, in één instructie;
        // bij een uitvoergesprek juist de neutrale uitvoerinstructie, en in een
        // project de projectinstructie van de gebruiker zelf.
        systemPrompt: isExecution
          ? composeExecutionSystemPrompt(settings)
          : isProject && project
            ? composeProjectSystemPrompt(project.instructions)
            : composeChatSystemPrompt(settings),
      },
      onChunk,
      // Huisregels ook afdwingen op wat het model teruggeeft (zie tidyChatReply);
      // tijdens het streamen én op de eindtekst, zodat beide gelijk zijn.
      tidy,
      signal,
    });

    if (outcome.aborted) {
      return { text: tidy(outcome.text), provider: outcome.provider, aborted: true };
    }
    if (outcome.error) {
      return { text: tidy(outcome.text), provider: outcome.provider, error: outcome.error };
    }
    const text = tidy(outcome.text).trim();
    if (!text) {
      return { text: '', provider: outcome.provider, error: 'De AI-service gaf een leeg antwoord.' };
    }
    return { text, provider: outcome.provider };
  } catch (err) {
    return { text: '', error: err instanceof Error ? err.message : 'De chat-aanroep is mislukt.' };
  }
}

/**
 * Verbetert in één klik de tekst die de gebruiker in het invoerveld heeft
 * staan (het oranje sterretje). Bewust een lichte herschrijving, geen
 * generator: het resultaat blijft één verstuurbaar chatbericht.
 *
 * Gooit nooit; bij een fout komt de oorspronkelijke tekst terug met een
 * melding, zodat de UI de tekst van de gebruiker ongemoeid kan laten.
 */
export async function optimizeChatInput(args: {
  text: string;
  settings: ChatSettings;
  signal?: AbortSignal;
}): Promise<{ text: string; changed: boolean; provider?: string; error?: string }> {
  const { settings, signal } = args;
  const text = args.text.trim().slice(0, MAX_CHAT_OPTIMIZE_CHARS);
  const noop = { text: args.text, changed: false };

  const functionUrl = getFunctionUrl('optimize-prompt');
  if (!isSupabaseConfigured || !supabase || !functionUrl) {
    return { ...noop, error: 'Geen AI-service geconfigureerd. Neem contact op met de beheerder.' };
  }
  if (!text) return noop;

  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (!accessToken) return { ...noop, error: 'Log in om de chat te gebruiken.' };

  const anonKey = getAnonKey();
  try {
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        ...(anonKey ? { apikey: anonKey } : {}),
      },
      body: JSON.stringify({
        mode: 'chat-optimize',
        chatInput: text,
        preferredProvider: settings.provider,
        preferredModel: settings.model,
        // De door de beheerder ingestelde instructie voor déze verbeterslag.
        systemPrompt: composeChatOptimizePrompt(settings),
      }),
      signal,
    });

    if (!response.ok) throw new Error(`Edge function gaf status ${response.status}`);

    const result = (await response.json()) as {
      success?: boolean;
      optimized?: string;
      provider?: string;
      error?: string;
    };
    const optimized = typeof result.optimized === 'string' ? result.optimized.trim() : '';
    if (result.success && optimized) {
      return { text: optimized, changed: optimized !== args.text.trim(), provider: result.provider };
    }
    throw new Error(result.error ?? 'De verbetering gaf geen bruikbaar resultaat.');
  } catch (err) {
    // Afgebroken door de gebruiker: geen foutmelding, gewoon niets doen.
    if (err instanceof DOMException && err.name === 'AbortError') return noop;
    const message = err instanceof Error ? err.message : 'Onbekende fout';
    return { ...noop, error: `Verbeteren mislukt (${message}).` };
  }
}

/**
 * Maakt van de ruwe projectinstructie een volwaardige systeemprompt (het oranje
 * sterretje in de projectinstellingen). Anders dan `optimizeChatInput` hierboven
 * is dit géén lichte herschrijving: het resultaat stuurt élk gesprek in het
 * project, dus rol, eindproduct, werkwijze, vorm en grenzen worden echt
 * uitgewerkt (zie PROJECTINSTRUCTIE_Framework.md).
 *
 * De projectnaam en de bestandsnamen gaan mee als context — ze verraden het
 * onderwerp waar een ruwe instructie vaak over zwijgt. De ínhoud van de
 * bestanden niet: die hoort in het gesprek thuis, niet in een instructie die
 * over alle gesprekken gaat.
 *
 * Draait op het STERKSTE model van de ingestelde provider in plaats van op het
 * chatmodel; de server regelt dat (zie STRONGEST_MODEL in de edge function).
 *
 * Gooit nooit; bij een fout komt de oorspronkelijke tekst terug met een melding,
 * zodat de UI de instructie van de gebruiker ongemoeid kan laten.
 */
export async function optimizeProjectInstructions(args: {
  instructions: string;
  projectName?: string;
  fileNames?: string[];
  settings: ChatSettings;
  signal?: AbortSignal;
}): Promise<{ text: string; changed: boolean; provider?: string; error?: string }> {
  const { settings, signal } = args;
  const instructions = args.instructions.trim();
  const noop = { text: args.instructions, changed: false };

  const functionUrl = getFunctionUrl('optimize-prompt');
  if (!isSupabaseConfigured || !supabase || !functionUrl) {
    return { ...noop, error: 'Geen AI-service geconfigureerd. Neem contact op met de beheerder.' };
  }
  if (!instructions) return noop;
  // Bewust niet stil afkappen: bij een instructie van deze omvang zou de
  // gebruiker een herschrijving terugkrijgen die op de helft van zijn tekst is
  // gebaseerd, zonder dat hij dat ziet.
  if (instructions.length > MAX_PROJECT_OPTIMIZE_CHARS) {
    return {
      ...noop,
      error: `Deze instructie is te lang om te verbeteren (maximaal ${MAX_PROJECT_OPTIMIZE_CHARS.toLocaleString('nl-NL')} tekens). Kort hem eerst in.`,
    };
  }

  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (!accessToken) return { ...noop, error: 'Log in om je projectinstructie te verbeteren.' };

  const anonKey = getAnonKey();
  try {
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        ...(anonKey ? { apikey: anonKey } : {}),
      },
      body: JSON.stringify({
        mode: 'project-optimize',
        projectInstructions: instructions,
        projectName: args.projectName ?? '',
        projectFileNames: args.fileNames ?? [],
        preferredProvider: settings.provider,
        // Bewust GEEN preferredModel: de server kiest hier het sterkste model van
        // de gekozen provider (STRONGEST_MODEL). Het chatmodel is gekozen voor
        // snelheid en prijs per beurt; deze aanroep gebeurt één keer per project
        // en het resultaat stuurt daarna élk gesprek erin.
        systemPrompt: composeProjectOptimizePrompt(settings),
      }),
      signal,
    });

    if (!response.ok) throw new Error(`Edge function gaf status ${response.status}`);

    const result = (await response.json()) as {
      success?: boolean;
      optimized?: string;
      provider?: string;
      error?: string;
    };
    const optimized = typeof result.optimized === 'string' ? result.optimized.trim() : '';
    if (result.success && optimized) {
      return { text: optimized, changed: optimized !== instructions, provider: result.provider };
    }
    throw new Error(result.error ?? 'De verbetering gaf geen bruikbaar resultaat.');
  } catch (err) {
    // Afgebroken door de gebruiker: geen foutmelding, gewoon niets doen.
    if (err instanceof DOMException && err.name === 'AbortError') return noop;
    const message = err instanceof Error ? err.message : 'Onbekende fout';
    return { ...noop, error: `Verbeteren mislukt (${message}).` };
  }
}

// --- Handoff vanuit de generator ("Uitvoeren in chat") ---
// sessionStorage in plaats van router-state: die overleeft de login-roundtrip
// van RequireAuth in dezelfde tab en lekt niet naar andere tabs. Bij uitloggen
// wist wipeAllChatStorage deze key mee.

const HANDOFF_KEY = `${CHAT_PREFIX}handoff`;
const HANDOFF_TTL_MS = 15 * 60 * 1000;

/** De klaargezette prompt plus hoe de chat ermee om moet gaan. */
export interface ChatHandoff {
  prompt: string;
  /** 'execute' = draai als uitvoergesprek (neutrale systeemprompt, ruim plafond). */
  kind: 'chat' | 'execute';
}

/** Zet een gegenereerde prompt klaar om in de chat uit te voeren. */
export function writeHandoff(prompt: string, kind: ChatHandoff['kind'] = 'execute'): void {
  try {
    sessionStorage.setItem(HANDOFF_KEY, JSON.stringify({ prompt, kind, createdAt: Date.now() }));
  } catch {
    /* sessieopslag niet beschikbaar — de chat opent dan gewoon leeg */
  }
}

/** Lees en verwijder de klaargezette prompt; verlopen of ongeldig -> null. */
export function consumeHandoff(): ChatHandoff | null {
  try {
    const raw = sessionStorage.getItem(HANDOFF_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(HANDOFF_KEY);
    const parsed = JSON.parse(raw) as { prompt?: unknown; kind?: unknown; createdAt?: unknown };
    if (typeof parsed.prompt !== 'string' || !parsed.prompt.trim()) return null;
    if (typeof parsed.createdAt !== 'number' || Date.now() - parsed.createdAt > HANDOFF_TTL_MS) {
      return null;
    }
    // Een payload zonder kind is door een oudere versie geschreven; de enige
    // schrijver was toen "Uitvoeren in chat", dus uitvoeren is dan correct.
    return { prompt: parsed.prompt, kind: parsed.kind === 'chat' ? 'chat' : 'execute' };
  } catch {
    return null;
  }
}
