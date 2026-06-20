import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { localStore } from '@/services/localStore';
import type { CommunityMember, Prompt, PublicProfile } from '@/types';

/**
 * Community: publiek zichtbare auteursgegevens (naam + ministerie), een
 * ranglijst van actieve makers en de prompts per auteur. Stimuleert collega's
 * om prompts te delen en maakt kwaliteit zichtbaar via likes.
 *
 * Privacy: alleen niet-gevoelige velden (naam + organisatie) zijn publiek,
 * via de `public_profiles`-view. E-mail e.d. blijven achter de strikte RLS
 * op de `profiles`-tabel.
 */

const local = !isSupabaseConfigured || !supabase;

/** Haal de publieke profielen op voor een set gebruikers-id's (auteurslabels). */
export async function getPublicProfiles(userIds: string[]): Promise<Record<string, PublicProfile>> {
  const result: Record<string, PublicProfile> = {};
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) return result;

  if (local) {
    for (const id of ids) {
      const p = localStore.getProfile(id);
      if (p) result[id] = p;
    }
    return result;
  }

  const { data, error } = await supabase!
    .from('public_profiles')
    .select('id, full_name, organization_id')
    .in('id', ids);
  if (error) throw error;
  for (const row of (data ?? []) as PublicProfile[]) result[row.id] = row;
  return result;
}

export async function getPublicProfile(userId: string): Promise<PublicProfile | null> {
  const map = await getPublicProfiles([userId]);
  return map[userId] ?? null;
}

/** Alle (openbare) prompts van één auteur, nieuwste eerst. */
export async function listPromptsByAuthor(userId: string): Promise<Prompt[]> {
  if (local) {
    return localStore
      .listPrompts({})
      .filter((p) => p.created_by_user === userId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  const { data, error } = await supabase!
    .from('prompts')
    .select('*')
    .eq('created_by_user', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Prompt[];
}

/**
 * Ranglijst van community-leden: per auteur het aantal prompts en het totaal
 * aantal ontvangen likes. Gesorteerd op likes, dan op aantal prompts.
 */
export async function listCommunityMembers(): Promise<CommunityMember[]> {
  if (local) {
    const prompts = localStore.listPrompts({});
    const likes = localStore.listLikes();
    const profiles = localStore.listProfiles();
    return buildMembers(prompts, profiles, (promptId) =>
      likes.filter((l) => l.prompt_id === promptId).length,
    );
  }

  // Auteurs + hun prompts.
  const { data: prompts, error: pErr } = await supabase!
    .from('prompts')
    .select('id, created_by_user');
  if (pErr) throw pErr;
  const rows = (prompts ?? []) as { id: string; created_by_user: string | null }[];

  const authorIds = [...new Set(rows.map((r) => r.created_by_user).filter(Boolean) as string[])];
  if (authorIds.length === 0) return [];

  const [profilesMap, likeCounts] = await Promise.all([
    getPublicProfiles(authorIds),
    fetchLikeCounts(rows.map((r) => r.id)),
  ]);

  const profiles = Object.values(profilesMap);
  const promptShape = rows.map((r) => ({
    id: r.id,
    created_by_user: r.created_by_user,
  })) as Prompt[];
  return buildMembers(promptShape, profiles, (promptId) => likeCounts[promptId] ?? 0);
}

async function fetchLikeCounts(promptIds: string[]): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  if (promptIds.length === 0 || local) return result;
  const { data, error } = await supabase!
    .from('prompt_like_counts')
    .select('prompt_id, like_count')
    .in('prompt_id', promptIds);
  if (error) throw error;
  for (const row of (data ?? []) as { prompt_id: string; like_count: number }[]) {
    result[row.prompt_id] = row.like_count;
  }
  return result;
}

/** Bouw de ledenlijst met afgeleide statistieken en sorteer op invloed. */
function buildMembers(
  prompts: Pick<Prompt, 'id' | 'created_by_user'>[],
  profiles: PublicProfile[],
  likesFor: (promptId: string) => number,
): CommunityMember[] {
  const byAuthor = new Map<string, { prompt_count: number; total_likes: number }>();
  for (const p of prompts) {
    const author = p.created_by_user;
    if (!author) continue;
    const agg = byAuthor.get(author) ?? { prompt_count: 0, total_likes: 0 };
    agg.prompt_count += 1;
    agg.total_likes += likesFor(p.id);
    byAuthor.set(author, agg);
  }

  const profileById = new Map(profiles.map((p) => [p.id, p]));
  const members: CommunityMember[] = [];
  for (const [authorId, agg] of byAuthor) {
    const profile = profileById.get(authorId);
    members.push({
      id: authorId,
      full_name: profile?.full_name ?? null,
      organization_id: profile?.organization_id ?? null,
      prompt_count: agg.prompt_count,
      total_likes: agg.total_likes,
    });
  }

  return members.sort(
    (a, b) => b.total_likes - a.total_likes || b.prompt_count - a.prompt_count,
  );
}

/** Eerste woord van de volledige naam → privacyvriendelijke voornaam. */
export function firstName(fullName?: string | null): string {
  const name = (fullName ?? '').trim();
  if (!name) return 'Anoniem';
  return name.split(/\s+/)[0];
}
