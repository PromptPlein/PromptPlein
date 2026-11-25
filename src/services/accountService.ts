// Het eigen account verwijderen.
//
// Het echte werk doet de edge function `delete-account`: die haalt het contact
// uit Brevo en wist daarna alles in de database met `delete_user_account`
// (migratie 0068). De browser mag die databasefunctie niet zelf aanroepen,
// anders bleef het Brevo-contact staan.
//
// In de lokale modus is er geen account op een server; dan valt er niets te
// verwijderen en geeft `accountOverview` null.

import { getAnonKey, getFunctionUrl, isSupabaseConfigured, supabase } from '@/lib/supabase';

export interface AccountOverview {
  prompts: number;
  projects: number;
}

/** Hoeveel er mee verdwijnt, voor de tekst bij de bevestiging. */
export async function accountOverview(): Promise<AccountOverview | null> {
  if (!isSupabaseConfigured || !supabase) return null;
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) return null;
  const [prompts, projects] = await Promise.all([
    supabase.from('prompts').select('id', { count: 'exact', head: true }).eq('created_by_user', userId),
    supabase.from('chat_projects').select('id', { count: 'exact', head: true }).eq('user_id', userId),
  ]);
  return { prompts: prompts.count ?? 0, projects: projects.count ?? 0 };
}

/**
 * Verwijdert het account van wie nu is ingelogd en logt daarna uit in deze
 * browser. Gooit met een Nederlandse melding als het niet lukt; dan is er niets
 * verwijderd.
 */
export async function deleteOwnAccount(confirmEmail: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) throw new Error('Er is geen account om te verwijderen.');
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Log opnieuw in en probeer het nog eens.');

  const functionUrl = getFunctionUrl('delete-account');
  if (!functionUrl) throw new Error('Verwijderen is nu niet mogelijk.');
  const anonKey = getAnonKey();

  let response: Response;
  try {
    response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(anonKey ? { apikey: anonKey } : {}),
      },
      body: JSON.stringify({ confirmEmail }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new Error('Geen verbinding. Je account is niet verwijderd.');
  }
  const result = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string };
  if (!response.ok || !result.success) {
    throw new Error(result.error ?? 'Je account is niet verwijderd. Probeer het later opnieuw.');
  }

  // Het account bestaat niet meer, dus uitloggen bij de server kan niet meer.
  // Alleen de sessie in deze browser opruimen; AuthContext hoort SIGNED_OUT.
  await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
}
