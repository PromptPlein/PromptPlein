// Chatservice: verstuurt een gesprek naar de edge function (mode 'chat') en
// leest het antwoord streamend terug.
//
// De chat werkt met én zonder account: is er een sessie, dan gaat het
// sessietoken mee, anders de anon key (net als bij de generator). Alleen de
// projectaanroepen eisen een ingelogde gebruiker, want projecten staan in de
// database. Er is bewust géén lokale fallback: zonder AI-service is er geen
// chat (honest degrade).

import { getAnonKey, getFunctionUrl, isSupabaseConfigured, supabase } from '@/lib/supabase';
import { streamNdjson, type StatusHandler, type StreamHandler } from '@/lib/ndjsonStream';
import { CHAT_PREFIX } from '@/lib/chatStorage';
import {
  composeChatOptimizePrompt,
  composeChatSystemPrompt,
  composeExecutionSystemPrompt,
  composeProjectOptimizePrompt,
  composeProjectSystemPrompt,
  composeWebSearchInstruction,
  MAX_CHAT_OPTIMIZE_CHARS,
  MAX_PROJECT_OPTIMIZE_CHARS,
  withMemoryBlock,
  type ChatSettings,
} from '@/services/settingsService';
import { getPersonalInstructionForChat } from '@/services/personalInstructionService';
import { getMemoriesForChat } from '@/services/memoryService';
import type { ChatProjectContext, ChatSource } from '@/types';

/**
 * Schuivend venster: alleen de recentste berichten gaan mee. Houdt de payload
 * (en daarmee de time-to-first-token en de kosten) klein; de server kapt
 * daarbovenop nogmaals af.
 */
const CHAT_WINDOW_MESSAGES = 12;

/**
 * Bearer-token voor de open chatmodi: het sessietoken als iemand is ingelogd,
 * anders de anon key. Zo werkt de chat voor gasten en houdt een ingelogde
 * gebruiker zijn eigen identiteit in de logs.
 */
async function sessionOrAnonToken(anonKey: string | undefined): Promise<string | undefined> {
  if (!supabase) return anonKey;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? anonKey;
}

export interface ChatSendResult {
  text: string;
  /** De provider die daadwerkelijk antwoordde (kan een fallback zijn). */
  provider?: string;
  /** Afgebroken met de stop-knop; `text` bevat de deeltekst. */
  aborted?: boolean;
  error?: string;
  /**
   * Het antwoord brak af voordat het klaar was (uitvoerbudget op of verbinding
   * weg) en er staat al tekst. Vraag het vervolg op met `continueFrom`.
   */
  incomplete?: boolean;
  /** De tekst van deze aanroep precies zoals hij binnenkwam, niet bijgesneden. */
  raw?: string;
  /**
   * De internetbronnen die dit antwoord heeft meegekregen, in de volgorde
   * waarin het model ze zag. Alleen gevuld wanneer er is gezocht én er iets
   * gevonden is.
   */
  sources?: ChatSource[];
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
   * taal, toon en opmaak) en met het ruimere token-plafond server-side.
   */
  kind?: 'execution';
  /**
   * Denken aan: het model redeneert eerst en antwoordt daarna pas. Zie
   * {@link useThinking}; de knop staat in de invoerbalk.
   */
  thinking?: boolean;
  /**
   * Zoeken op internet aan: de server zoekt eerst en zet de treffers als
   * bronblok onder de systeemprompt. Zie {@link useWebSearch}; de knop staat
   * naast "Denken" in de invoerbalk.
   */
  webSearch?: boolean;
  /** Voortgang naast de tekst, zodat de chat "Zoekt op internet…" kan tonen. */
  onStatus?: StatusHandler;
  /**
   * Het project waar dit gesprek onder valt. De projectinstructie wordt dan de
   * leidende systeemprompt en de bronbestanden gaan als bronblokken mee, vóór
   * de eventuele losse bijlagen van het gesprek zelf.
   */
  project?: ChatProjectContext | null;
  /**
   * Het antwoord tot nu toe: deze aanroep schrijft het af in plaats van een
   * nieuw antwoord te beginnen. `onChunk` krijgt dan alleen het vervolg.
   */
  continueFrom?: string;
}): Promise<ChatSendResult> {
  const {
    messages,
    attachments,
    settings,
    onChunk,
    signal,
    kind,
    project,
    thinking,
    webSearch,
    continueFrom,
  } = args;
  // Een uitvoergesprek en een projectgesprek sluiten elkaar uit; staat er toch
  // allebei iets klaar, dan wint de uitvoering (dat is een expliciete handoff).
  const isExecution = kind === 'execution';
  const isProject = !isExecution && Boolean(project);
  // Alleen in een gewoon gesprek. Een uitvoergesprek test de prompt zelf en in een
  // project is de projectinstructie al de instructie van de gebruiker.
  // Het geheugen geldt in elk gesprek van de gebruiker, ook in een project, en is
  // daar leidend. Niet bij uitvoeren: daar wordt de prompt zelf getest. De vraag
  // van nu en die daarvoor bepalen welke wensen meegaan als het geheugen groot is.
  const memoryQuery = messages
    .filter((m) => m.role === 'user')
    .slice(-2)
    .map((m) => m.content)
    .join('\n\n');
  const [personalInstruction, memories] = await Promise.all([
    isExecution || isProject ? Promise.resolve('') : getPersonalInstructionForChat(),
    isExecution ? Promise.resolve([] as string[]) : getMemoriesForChat(memoryQuery),
  ]);

  const functionUrl = getFunctionUrl('optimize-prompt');
  if (!isSupabaseConfigured || !supabase || !functionUrl) {
    return { text: '', error: 'Geen AI-service geconfigureerd. Neem contact op met de beheerder.' };
  }

  const anonKey = getAnonKey();
  const accessToken = await sessionOrAnonToken(anonKey);
  if (!accessToken) {
    return { text: '', error: 'Geen AI-service geconfigureerd. Neem contact op met de beheerder.' };
  }

  // Het antwoord gaat ongewijzigd naar het scherm — geen opschoning achteraf.
  // De opmaakregels staan in de systeemprompt en dat is de enige plek waar het
  // gedrag van de chat vandaan komt; een nabewerking hier zou een tweede,
  // onzichtbare regelset zijn en het antwoord anders laten lezen dan het model
  // het schreef.
  // De bronnen komen één keer voorbij in de stream, vóór de eerste tekst; we
  // houden ze vast zodat ze bij het afgeronde bericht terechtkomen.
  let sources: ChatSource[] | undefined;
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
        ...(continueFrom ? { continueFrom } : {}),
        // Projectbronnen eerst, dan de losse bijlagen van dit ene gesprek. Ze
        // reizen door hetzelfde kanaal omdat het model ze op dezelfde manier
        // gebruikt; de volgorde zegt welke bron het meest gezaghebbend is.
        attachments: project ? [...project.files, ...attachments] : attachments,
        preferredProvider: settings.provider,
        preferredModel: settings.model,
        temperature: settings.temperature,
        thinking,
        // Zoeken op internet: het zoekwerk gebeurt server-side, want daar staat
        // de sleutel van de zoekdienst. De instelling en de instructie van de
        // beheerder reizen alleen mee als de gebruiker de knop aan heeft staan,
        // zodat een gewone beurt geen tekst meesleept die toch niet wordt
        // gebruikt.
        ...(webSearch
          ? {
              webSearch: true,
              webSearchResults: settings.webSearchResults,
              webSearchInstruction: composeWebSearchInstruction(settings),
            }
          : {}),
        // De systeemprompt van de beheerder, in een gewoon gesprek met daaronder
        // de persoonlijke instructie van de gebruiker; bij een uitvoergesprek de
        // neutrale uitvoerinstructie en in een project de projectinstructie van
        // de gebruiker zelf. Het geheugen komt in beide laatste gevallen als
        // laatste blok. De server voegt er niets aan toe.
        systemPrompt: isExecution
          ? composeExecutionSystemPrompt(settings)
          : isProject && project
            ? withMemoryBlock(composeProjectSystemPrompt(project.instructions), settings, memories)
            : composeChatSystemPrompt(settings, personalInstruction, memories),
      },
      onChunk,
      signal,
      onStatus: (status) => {
        if (status.sources) sources = status.sources;
        args.onStatus?.(status);
      },
    });

    const raw = outcome.raw ?? outcome.text;
    if (outcome.aborted) {
      return { text: outcome.text, raw, provider: outcome.provider, sources, aborted: true };
    }
    if (outcome.error) {
      // Viel de provider weg nadat er al tekst stond, dan is dat begin
      // bruikbaar en kan het vervolg alsnog worden opgevraagd.
      return {
        text: outcome.text,
        raw,
        provider: outcome.provider,
        sources,
        error: outcome.error,
        ...(raw.trim() ? { incomplete: true } : {}),
      };
    }
    const text = outcome.text.trim();
    // Een vervolg zonder nieuwe tekst is geen fout: het antwoord was al af.
    if (!text && continueFrom) return { text: '', raw: '', provider: outcome.provider };
    if (!text) {
      return { text: '', provider: outcome.provider, error: 'De AI-service gaf een leeg antwoord.' };
    }
    return {
      text,
      raw,
      provider: outcome.provider,
      sources,
      ...(outcome.incomplete ? { incomplete: true } : {}),
    };
  } catch (err) {
    return { text: '', error: err instanceof Error ? err.message : 'De chat-aanroep is mislukt.' };
  }
}

/**
 * Verbetert in één klik de tekst die de gebruiker in het invoerveld heeft
 * staan (het rode sterretje). Bewust een lichte herschrijving, geen
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

  const anonKey = getAnonKey();
  const accessToken = await sessionOrAnonToken(anonKey);
  if (!accessToken) {
    return { ...noop, error: 'Geen AI-service geconfigureerd. Neem contact op met de beheerder.' };
  }

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
 * Maakt van de ruwe projectinstructie een volwaardige systeemprompt (het rode
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
 * Draait op het chatmodel uit Beheer, net als de chat zelf. Is er geen geldig
 * model gekozen, dan neemt de server het sterkste model van de provider (zie
 * resolveProjectModel in de edge function).
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
        // Het chatmodel uit Beheer: het resultaat stuurt daarna élk gesprek in
        // het project, dus het hoort minstens zo sterk te zijn als het model van
        // die gesprekken. Zonder geldige keuze kiest de server het sterkste
        // model van de provider (STRONGEST_MODEL).
        preferredModel: settings.model,
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

// --- Handoff vanuit de generator ("Kopiëren in chat") ---
// sessionStorage in plaats van router-state: die overleeft de login-roundtrip
// van RequireAuth in dezelfde tab en lekt niet naar andere tabs. Bij uitloggen
// wist clearChatHandoffs deze key mee.

const HANDOFF_KEY = `${CHAT_PREFIX}handoff`;
const HANDOFF_TTL_MS = 15 * 60 * 1000;

/** De klaargezette prompt plus hoe de chat ermee om moet gaan. */
export interface ChatHandoff {
  prompt: string;
  /**
   * 'compose' = zet de prompt in het invoerveld en verstuur niets; de gebruiker
   * bepaalt zelf wanneer hij hem draait. 'execute' = draai hem meteen als
   * uitvoergesprek (neutrale systeemprompt, ruim plafond).
   */
  kind: 'chat' | 'execute' | 'compose';
}

/** Zet een gegenereerde prompt klaar voor de chat. */
export function writeHandoff(prompt: string, kind: ChatHandoff['kind'] = 'compose'): void {
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
    const kind =
      parsed.kind === 'chat' || parsed.kind === 'compose' ? parsed.kind : 'execute';
    return { prompt: parsed.prompt, kind };
  } catch {
    return null;
  }
}
