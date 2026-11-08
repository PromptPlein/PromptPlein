// Geheugen van de chat: vaste wensen die een gebruiker liet onthouden met
// "voortaan", "onthoud dit" of "vanaf nu" (migratie 0052).
//
// Elke wens is een eigen rij in `user_memories`, zodat de gebruiker hem op
// /instellingen/chat los kan zien en verwijderen. In de chat komen de wensen als
// laatste blok in de systeemprompt, waar ze leidend zijn (composeMemoryBlock).
//
// Tot MEMORY_VECTOR_THRESHOLD_TOKENS gaan alle wensen in elke beurt mee. Wordt het
// geheugen groter, dan zoekt de edge function met vectoren de wensen die bij de
// vraag passen ('memory-search').
//
// RLS is de poort: alleen de eigenaar leest en schrijft. Zonder backend staan de
// wensen in localStorage, net als de rest van de lokale modus; opslaan vanuit de
// chat kan daar niet, want zonder backend is er geen AI.

import { getAnonKey, getFunctionUrl, isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { UserMemory } from '@/types';

/**
 * Boven deze omvang gaat niet meer het hele geheugen mee, maar alleen wat bij de
 * vraag past. Gekozen door de eigenaar (8-11-2026).
 */
export const MEMORY_VECTOR_THRESHOLD_TOKENS = 100_000;

/** Zelfde duur als bij de eigen instructie: een wijziging elders komt snel door. */
const CACHE_MS = 60_000;

const LOCAL_KEY = 'opl.memories';

/**
 * Ruwe schatting van het aantal tokens: Mistral rekent voor Nederlands op zo'n
 * vier tekens per token. Genoeg om te weten aan welke kant van de grens we zitten.
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Het totaal van de wensen, in geschatte tokens. */
export function memoryTokens(memories: readonly { text: string }[]): number {
  return memories.reduce((sum, m) => sum + estimateTokens(m.text) + 2, 0);
}

let cache: { userId: string; memories: UserMemory[]; at: number } | null = null;

/** Vergeet de cache, zodat de volgende chatbeurt de wensen opnieuw ophaalt. */
function invalidate(): void {
  cache = null;
}

async function currentSession(): Promise<{ userId: string; token: string } | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  return session ? { userId: session.user.id, token: session.access_token } : null;
}

function readLocal(): UserMemory[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    const parsed = raw ? (JSON.parse(raw) as UserMemory[]) : [];
    return Array.isArray(parsed) ? parsed.filter((m) => typeof m?.text === 'string') : [];
  } catch {
    return [];
  }
}

function writeLocal(memories: UserMemory[]): void {
  try {
    if (memories.length) localStorage.setItem(LOCAL_KEY, JSON.stringify(memories));
    else localStorage.removeItem(LOCAL_KEY);
  } catch {
    /* localStorage niet beschikbaar: er valt niets te bewaren */
  }
}

function toMemory(row: { id: string; text: string; created_at?: string }): UserMemory {
  return { id: row.id, text: row.text, createdAt: row.created_at ?? new Date().toISOString() };
}

async function fetchAll(): Promise<UserMemory[]> {
  const { data, error } = await supabase!
    .from('user_memories')
    .select('id, text, created_at')
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as { id: string; text: string; created_at: string }[]).map(toMemory);
}

/** Alle wensen, oudste eerst, voor de instellingenpagina. Gooit bij een fout. */
export async function loadMemories(): Promise<UserMemory[]> {
  if (!isSupabaseConfigured || !supabase) return readLocal();
  const session = await currentSession();
  if (!session) return [];
  const memories = await fetchAll();
  cache = { userId: session.userId, memories, at: Date.now() };
  return memories;
}

/** Verwijdert één wens. */
export async function deleteMemory(id: string): Promise<void> {
  invalidate();
  if (!isSupabaseConfigured || !supabase) {
    writeLocal(readLocal().filter((m) => m.id !== id));
    return;
  }
  const { error } = await supabase.from('user_memories').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/** Verwijdert het hele geheugen van de ingelogde gebruiker. */
export async function deleteAllMemories(): Promise<void> {
  invalidate();
  if (!isSupabaseConfigured || !supabase) {
    writeLocal([]);
    return;
  }
  const session = await currentSession();
  if (!session) return;
  const { error } = await supabase.from('user_memories').delete().eq('user_id', session.userId);
  if (error) throw new Error(error.message);
}

/**
 * Zet wensen terug, voor Ongedaan maken na een vervanging. Zonder vector: die
 * maakt 'memory-search' later alsnog als het geheugen zo groot wordt.
 */
async function restoreMemories(texts: string[]): Promise<void> {
  if (texts.length === 0 || !supabase) return;
  const { error } = await supabase.from('user_memories').insert(texts.map((text) => ({ text })));
  if (error) throw new Error(error.message);
}

async function callMemoryFunction<T>(token: string, body: Record<string, unknown>): Promise<T> {
  const functionUrl = getFunctionUrl('optimize-prompt');
  if (!functionUrl) throw new Error('Geen AI-service geconfigureerd');
  const anonKey = getAnonKey();
  const response = await fetch(functionUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(anonKey ? { apikey: anonKey } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const result = (await response.json().catch(() => ({}))) as T & {
    success?: boolean;
    error?: string;
  };
  if (!response.ok || !result.success) throw new Error(result.error ?? 'Geen antwoord');
  return result;
}

export interface RememberResult {
  saved: UserMemory[];
  replaced: UserMemory[];
  /** Zet alles terug zoals het was: de nieuwe wensen weg, de vervangen terug. */
  undo: () => Promise<void>;
}

/**
 * Laat het model de wens uit een bericht opschrijven en slaat hem op. Gooit als
 * er niemand is ingelogd of het opslaan mislukt; geeft lege lijsten als het
 * bericht geen vaste wens bevatte.
 */
export async function rememberFromMessage(args: {
  message: string;
  previousUser?: string;
  previousAssistant?: string;
  preferredProvider?: string;
  preferredModel?: string;
}): Promise<RememberResult> {
  if (!isSupabaseConfigured || !supabase) throw new Error('Onthouden kan alleen met een account');
  const session = await currentSession();
  if (!session) throw new Error('Log in om de chat iets te laten onthouden');
  const result = await callMemoryFunction<{
    saved?: { id: string; text: string }[];
    replaced?: { id: string; text: string }[];
  }>(session.token, {
    mode: 'memory-save',
    message: args.message,
    previousUser: args.previousUser,
    previousAssistant: args.previousAssistant,
    preferredProvider: args.preferredProvider,
    preferredModel: args.preferredModel,
  });
  invalidate();
  const saved = (result.saved ?? []).map(toMemory);
  const replaced = (result.replaced ?? []).map(toMemory);
  return {
    saved,
    replaced,
    undo: async () => {
      invalidate();
      if (saved.length) {
        const { error } = await supabase!
          .from('user_memories')
          .delete()
          .in('id', saved.map((m) => m.id));
        if (error) throw new Error(error.message);
      }
      await restoreMemories(replaced.map((m) => m.text));
    },
  };
}

/** De nieuwste wensen die samen onder de grens blijven, in de oorspronkelijke volgorde. */
function newestWithinLimit(memories: UserMemory[]): UserMemory[] {
  const picked: UserMemory[] = [];
  let tokens = 0;
  for (let i = memories.length - 1; i >= 0; i--) {
    const cost = estimateTokens(memories[i].text) + 2;
    if (tokens + cost > MEMORY_VECTOR_THRESHOLD_TOKENS) break;
    tokens += cost;
    picked.unshift(memories[i]);
  }
  return picked;
}

/**
 * De wensen voor een chatbeurt, als tekst. Faalt nooit: lukt het ophalen niet, dan
 * wordt de vraag gewoon beantwoord, alleen zonder geheugen. `query` is de vraag
 * van nu, nodig als het geheugen te groot is om helemaal mee te sturen.
 */
export async function getMemoriesForChat(query: string): Promise<string[]> {
  if (!isSupabaseConfigured || !supabase) return readLocal().map((m) => m.text);
  try {
    const session = await currentSession();
    if (!session) return [];
    let memories: UserMemory[];
    if (cache?.userId === session.userId && Date.now() - cache.at < CACHE_MS) {
      memories = cache.memories;
    } else {
      memories = await fetchAll();
      cache = { userId: session.userId, memories, at: Date.now() };
    }
    if (memoryTokens(memories) <= MEMORY_VECTOR_THRESHOLD_TOKENS) return memories.map((m) => m.text);

    // Te groot om elke beurt mee te sturen: alleen wat bij de vraag past.
    try {
      const { memories: found } = await callMemoryFunction<{ memories: { text: string }[] }>(
        session.token,
        { mode: 'memory-search', query: query.slice(-8000) },
      );
      if (found.length > 0) return found.map((m) => m.text);
    } catch (err) {
      console.warn('Geheugen doorzoeken mislukt, de nieuwste wensen gaan mee', err);
    }
    return newestWithinLimit(memories).map((m) => m.text);
  } catch (err) {
    console.warn('Geheugen niet opgehaald', err);
    return [];
  }
}
