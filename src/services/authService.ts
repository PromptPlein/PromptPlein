import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { Profile } from '@/types';

/**
 * Dunne wrapper rond Supabase Auth + het bijbehorende `profiles`-record.
 * Wanneer er geen Supabase-backend is geconfigureerd, gedragen alle functies
 * zich als no-op zodat de app blijft draaien op de lokale mock.
 */

export class AuthNotConfiguredError extends Error {
  constructor() {
    super('Authenticatie vereist een geconfigureerde Supabase-backend.');
    this.name = 'AuthNotConfiguredError';
  }
}

function requireClient() {
  if (!isSupabaseConfigured || !supabase) throw new AuthNotConfiguredError();
  return supabase;
}

export async function signUp(params: {
  email: string;
  password: string;
  fullName?: string;
  /** De gekozen organisatie/afdeling — komt via metadata mee naar het profiel. */
  organizationId?: string;
}): Promise<void> {
  const client = requireClient();
  // De DB-trigger handle_new_user leest full_name én organization_id uit de
  // metadata en valideert de organisatie voordat hij hem op het profiel zet.
  const data: Record<string, string> = {};
  if (params.fullName) data.full_name = params.fullName;
  if (params.organizationId) data.organization_id = params.organizationId;
  const { error } = await client.auth.signUp({
    email: params.email,
    password: params.password,
    options: {
      data: Object.keys(data).length ? data : undefined,
      emailRedirectTo: `${window.location.origin}/auth/login`,
    },
  });
  if (error) throw error;
}

export async function signIn(email: string, password: string): Promise<void> {
  const client = requireClient();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  const client = requireClient();
  const { error } = await client.auth.signOut();
  if (error) throw error;
}

export async function requestPasswordReset(email: string): Promise<void> {
  const client = requireClient();
  const { error } = await client.auth.resetPasswordForEmail(email, {
    // Verwijs naar de pagina die het recovery-token afhandelt en een
    // 'nieuw wachtwoord'-formulier toont.
    redirectTo: `${window.location.origin}/auth/nieuw-wachtwoord`,
  });
  if (error) throw error;
}

/**
 * Stel een nieuw wachtwoord in voor de huidige (recovery- of ingelogde) sessie.
 * Werkt nadat supabase-js het recovery-token uit de URL heeft opgepikt.
 */
export async function updatePassword(newPassword: string): Promise<void> {
  const client = requireClient();
  const { error } = await client.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

/** Haal het profiel (incl. rol & organisatie) op voor een Auth-gebruiker. */
export async function fetchProfile(userId: string): Promise<Profile | null> {
  if (!isSupabaseConfigured || !supabase) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return (data as Profile | null) ?? null;
}

/** Werk het eigen profiel bij (naam, organisatie, functie). Rolwijziging blokkeert RLS. */
export async function updateOwnProfile(
  userId: string,
  patch: Partial<Pick<Profile, 'full_name' | 'avatar_url' | 'organization_id' | 'function_id'>>,
): Promise<Profile> {
  const client = requireClient();
  const { data, error } = await client
    .from('profiles')
    .update(patch)
    .eq('id', userId)
    .select('*')
    .single();
  if (error) throw error;
  return data as Profile;
}
