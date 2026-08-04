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
import type { ChatSettings } from '@/services/settingsService';

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
}): Promise<ChatSendResult> {
  const { messages, attachments, settings, onChunk, signal } = args;

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
  try {
    const outcome = await streamNdjson({
      url: functionUrl,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(anonKey ? { apikey: anonKey } : {}),
      },
      body: {
        mode: 'chat',
        messages: messages.slice(-CHAT_WINDOW_MESSAGES),
        attachments,
        preferredProvider: settings.provider,
        preferredModel: settings.model,
        temperature: settings.temperature,
        systemPrompt: settings.systemPrompt,
      },
      onChunk,
      signal,
    });

    if (outcome.aborted) {
      return { text: outcome.text, provider: outcome.provider, aborted: true };
    }
    if (outcome.error) {
      return { text: outcome.text, provider: outcome.provider, error: outcome.error };
    }
    const text = outcome.text.trim();
    if (!text) {
      return { text: '', provider: outcome.provider, error: 'De AI-service gaf een leeg antwoord.' };
    }
    return { text, provider: outcome.provider };
  } catch (err) {
    return { text: '', error: err instanceof Error ? err.message : 'De chat-aanroep is mislukt.' };
  }
}

// --- Handoff vanuit de generator ("Uitvoeren in chat") ---
// sessionStorage in plaats van router-state: die overleeft de login-roundtrip
// van RequireAuth in dezelfde tab en lekt niet naar andere tabs. Bij uitloggen
// wist wipeAllChatStorage deze key mee.

const HANDOFF_KEY = `${CHAT_PREFIX}handoff`;
const HANDOFF_TTL_MS = 15 * 60 * 1000;

/** Zet een gegenereerde prompt klaar om in de chat uit te voeren. */
export function writeHandoff(prompt: string): void {
  try {
    sessionStorage.setItem(HANDOFF_KEY, JSON.stringify({ prompt, createdAt: Date.now() }));
  } catch {
    /* sessieopslag niet beschikbaar — de chat opent dan gewoon leeg */
  }
}

/** Lees en verwijder de klaargezette prompt; verlopen of ongeldig -> null. */
export function consumeHandoff(): string | null {
  try {
    const raw = sessionStorage.getItem(HANDOFF_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(HANDOFF_KEY);
    const parsed = JSON.parse(raw) as { prompt?: unknown; createdAt?: unknown };
    if (typeof parsed.prompt !== 'string' || !parsed.prompt.trim()) return null;
    if (typeof parsed.createdAt !== 'number' || Date.now() - parsed.createdAt > HANDOFF_TTL_MS) {
      return null;
    }
    return parsed.prompt;
  } catch {
    return null;
  }
}
