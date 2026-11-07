// Persoonlijke instructie voor de chat: wensen die een gebruiker zelf instelt.
//
// Dit is de enige chatinstelling die op de server staat, in
// `user_chat_preferences` (migratie 0047). Gesprekken blijven op het apparaat;
// zie src/lib/chatStorage.ts. Daarom vereist de instructie een account en zegt de
// instellingenpagina erbij waar hij staat.
//
// RLS is de poort: alleen de eigenaar leest en schrijft. Zonder backend staat de
// tekst in localStorage, net als de rest van de lokale modus.

import { isSupabaseConfigured, supabase } from '@/lib/supabase';

/** Spiegel van de CHECK in 0047: verhoog je er één, verhoog dan de ander mee. */
export const MAX_PERSONAL_INSTRUCTION_CHARS = 4000;

const LOCAL_KEY = 'opl.personalInstruction';

/**
 * Zo lang onthoudt de chat de instructie. Zonder deze cache kost elke vraag een
 * extra databaseaanroep; met een korte duur komt een wijziging op een ander
 * apparaat toch snel door.
 */
const CACHE_MS = 60_000;

let cache: { userId: string; text: string; at: number } | null = null;

async function currentUserId(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

function readLocal(): string {
  try {
    return localStorage.getItem(LOCAL_KEY) ?? '';
  } catch {
    return '';
  }
}

function writeLocal(text: string): void {
  try {
    if (text) localStorage.setItem(LOCAL_KEY, text);
    else localStorage.removeItem(LOCAL_KEY);
  } catch {
    /* localStorage niet beschikbaar: er valt niets te bewaren */
  }
}

async function fetchRow(userId: string): Promise<string> {
  const { data, error } = await supabase!
    .from('user_chat_preferences')
    .select('personal_instruction')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.personal_instruction as string | undefined) ?? '';
}

/** De opgeslagen instructie voor de instellingenpagina. Gooit bij een fout. */
export async function loadPersonalInstruction(): Promise<string> {
  if (!isSupabaseConfigured || !supabase) return readLocal();
  const userId = await currentUserId();
  if (!userId) return '';
  const text = await fetchRow(userId);
  cache = { userId, text, at: Date.now() };
  return text;
}

/**
 * Bewaar de instructie. Een lege tekst verwijdert de rij, zodat er na
 * verwijderen ook echt niets meer op de server staat.
 */
export async function savePersonalInstruction(value: string): Promise<void> {
  const text = value.trim();
  if (text.length > MAX_PERSONAL_INSTRUCTION_CHARS) {
    throw new Error(`De instructie mag hoogstens ${MAX_PERSONAL_INSTRUCTION_CHARS} tekens lang zijn.`);
  }
  if (!isSupabaseConfigured || !supabase) {
    writeLocal(text);
    return;
  }
  const userId = await currentUserId();
  if (!userId) throw new Error('Log in om een eigen instructie op te slaan.');

  const { error } = text
    ? await supabase
        .from('user_chat_preferences')
        .upsert({ user_id: userId, personal_instruction: text })
    : await supabase.from('user_chat_preferences').delete().eq('user_id', userId);
  if (error) throw new Error(error.message);
  cache = { userId, text, at: Date.now() };
}

/**
 * De instructie voor een chatbeurt. Faalt nooit: lukt het ophalen niet, dan moet
 * de vraag toch beantwoord worden, alleen zonder persoonlijke wensen. Niet
 * ingelogd betekent geen instructie, ook als er op dit apparaat eerder iemand
 * was ingelogd: de cache hoort bij één gebruiker.
 */
export async function getPersonalInstructionForChat(): Promise<string> {
  if (!isSupabaseConfigured || !supabase) return readLocal();
  try {
    const userId = await currentUserId();
    if (!userId) return '';
    if (cache?.userId === userId && Date.now() - cache.at < CACHE_MS) return cache.text;
    const text = await fetchRow(userId);
    cache = { userId, text, at: Date.now() };
    return text;
  } catch (err) {
    console.warn('Persoonlijke instructie niet opgehaald', err);
    return '';
  }
}
