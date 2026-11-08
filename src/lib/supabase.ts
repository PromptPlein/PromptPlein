import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * Is een echte Supabase-backend geconfigureerd?
 * Zo niet, dan valt de app terug op een lokale (localStorage) mock-database,
 * zodat de app altijd direct te draaien is.
 */
export const isSupabaseConfigured = Boolean(url && anonKey);

/**
 * Onder welke sleutel de sessie in localStorage staat. Dit heette tot
 * 2026-08-12 'promptgo-auth', naar de oude naam van de app.
 */
const AUTH_STORAGE_KEY = 'promptplein-auth';
const LEGACY_AUTH_STORAGE_KEY = 'promptgo-auth';

/**
 * Verhuis een bestaande sessie eenmalig naar de nieuwe sleutel. Zonder deze stap
 * ziet Supabase op de nieuwe sleutel niets staan en is iedereen die op het moment
 * van uitrollen ingelogd was zijn sessie kwijt. Draait vóór `createClient`, zodat
 * de client de verhuisde sessie meteen vindt.
 */
function migrateAuthStorageKey(): void {
  try {
    const legacy = localStorage.getItem(LEGACY_AUTH_STORAGE_KEY);
    if (legacy !== null && localStorage.getItem(AUTH_STORAGE_KEY) === null) {
      localStorage.setItem(AUTH_STORAGE_KEY, legacy);
    }
    // Weg met de oude kopie: daar staat een geldig refresh-token in.
    if (legacy !== null) localStorage.removeItem(LEGACY_AUTH_STORAGE_KEY);
  } catch {
    /* localStorage niet beschikbaar; de gebruiker logt dan gewoon opnieuw in */
  }
}

if (isSupabaseConfigured) migrateAuthStorageKey();

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, anonKey!, {
      auth: {
        // Sessie onthouden tussen herlaadbeurten en tabs, en het access-token
        // automatisch verversen vóór het verloopt. Zonder deze expliciete
        // instellingen liep de sessie soms uit de pas (verlopen/ingetrokken
        // refresh-token), waardoor opslaan een 403 gaf terwijl de UI de
        // gebruiker nog als ingelogd toonde.
        persistSession: true,
        autoRefreshToken: true,
        // Detecteer een sessie in de URL-hash (na e-mailbevestiging/magic link).
        detectSessionInUrl: true,
        // Vaste opslagsleutel zodat de sessie herkenbaar en stabiel blijft.
        storageKey: AUTH_STORAGE_KEY,
      },
    })
  : null;

/** Basis-URL voor Supabase Edge Functions. */
/**
 * De regio waar de edge functions draaien: Ierland, naast de database. Zonder
 * deze keuze draait Supabase een function in de regio die het dichtst bij de
 * gebruiker ligt, en wie buiten Europa werkt, stuurt zijn tekst dan door een
 * server daar. Een query-parameter en geen header `x-region`, want die zou
 * een CORS-preflight met een extra toegestane header vragen.
 *
 * Let op: bij een storing in deze regio leidt Supabase niet om. Wissel dan
 * tijdelijk naar een andere regio in de EU, zoals `eu-central-1`.
 */
const FUNCTION_REGION = 'eu-west-1';

function withRegion(address: string): string {
  try {
    const parsed = new URL(address);
    if (!parsed.searchParams.has('forceFunctionRegion')) {
      parsed.searchParams.set('forceFunctionRegion', FUNCTION_REGION);
    }
    return parsed.toString();
  } catch {
    return address;
  }
}

export function getFunctionUrl(name: string): string | null {
  const explicit = import.meta.env.VITE_OPTIMIZE_FUNCTION_URL as string | undefined;
  if (name === 'optimize-prompt' && explicit) return withRegion(explicit);
  if (!url) return null;
  return withRegion(`${url.replace(/\/$/, '')}/functions/v1/${name}`);
}

export function getAnonKey(): string | undefined {
  return anonKey;
}
