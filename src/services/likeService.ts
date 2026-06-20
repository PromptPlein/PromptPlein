import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { localStore } from '@/services/localStore';

/**
 * Likes ("duimpjes") op prompts. Iedereen ziet de telling; alleen ingelogde
 * gebruikers kunnen liken (één keer per prompt) en hun like weer intrekken.
 *
 * Zonder Supabase valt alles terug op de lokale mock-store.
 */

const local = !isSupabaseConfigured || !supabase;

export interface LikeState {
  like_count: number;
  liked_by_me: boolean;
}

/**
 * Haal voor een set prompts de like-telling op én of de huidige gebruiker
 * geliket heeft. `userId` mag undefined zijn (niet ingelogd) → liked_by_me=false.
 */
export async function getLikeInfo(
  promptIds: string[],
  userId?: string | null,
): Promise<Record<string, LikeState>> {
  const empty: Record<string, LikeState> = {};
  if (promptIds.length === 0) return empty;
  if (local) return localStore.likeInfo(promptIds);

  // Tellingen via de publieke view.
  const { data: counts, error: countErr } = await supabase!
    .from('prompt_like_counts')
    .select('prompt_id, like_count')
    .in('prompt_id', promptIds);
  if (countErr) throw countErr;

  const result: Record<string, LikeState> = {};
  for (const id of promptIds) result[id] = { like_count: 0, liked_by_me: false };
  for (const row of counts ?? []) {
    const r = row as { prompt_id: string; like_count: number };
    result[r.prompt_id] = { like_count: r.like_count, liked_by_me: false };
  }

  // Welke van deze prompts heeft de huidige gebruiker zelf geliket?
  if (userId) {
    const { data: mine, error: mineErr } = await supabase!
      .from('prompt_likes')
      .select('prompt_id')
      .eq('user_id', userId)
      .in('prompt_id', promptIds);
    if (mineErr) throw mineErr;
    for (const row of mine ?? []) {
      const pid = (row as { prompt_id: string }).prompt_id;
      if (result[pid]) result[pid].liked_by_me = true;
    }
  }

  return result;
}

/**
 * Toggle de like van de gebruiker op een prompt. Geeft de nieuwe staat terug
 * (telling + of de gebruiker nu wel/niet geliket heeft).
 */
export async function toggleLike(promptId: string, userId: string): Promise<LikeState> {
  if (local) return localStore.toggleLike(promptId);

  // Bestaat de like al?
  const { data: existing, error: exErr } = await supabase!
    .from('prompt_likes')
    .select('id')
    .eq('prompt_id', promptId)
    .eq('user_id', userId)
    .maybeSingle();
  if (exErr) throw exErr;

  if (existing) {
    const { error } = await supabase!
      .from('prompt_likes')
      .delete()
      .eq('id', (existing as { id: string }).id);
    if (error) throw error;
  } else {
    const { error } = await supabase!
      .from('prompt_likes')
      .insert({ prompt_id: promptId, user_id: userId });
    if (error) throw error;
  }

  // Verse telling ophalen zodat de UI nooit divergeert.
  const info = await getLikeInfo([promptId], userId);
  return info[promptId] ?? { like_count: 0, liked_by_me: false };
}
