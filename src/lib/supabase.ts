import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * Is een echte Supabase-backend geconfigureerd?
 * Zo niet, dan valt de app terug op een lokale (localStorage) mock-database,
 * zodat de app altijd direct te draaien is.
 */
export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, anonKey!)
  : null;

/** Basis-URL voor Supabase Edge Functions. */
export function getFunctionUrl(name: string): string | null {
  const explicit = import.meta.env.VITE_OPTIMIZE_FUNCTION_URL as string | undefined;
  if (name === 'optimize-prompt' && explicit) return explicit;
  if (!url) return null;
  return `${url.replace(/\/$/, '')}/functions/v1/${name}`;
}

export function getAnonKey(): string | undefined {
  return anonKey;
}
