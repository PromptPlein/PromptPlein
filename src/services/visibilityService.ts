import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { Prompt, PromptVisibility, VisibilityLevel } from '@/types';
import { representativeSharingLevel } from '@/lib/utils';

/**
 * Beheer van de deelniveaus (prompt_visibility) van een prompt: het klaarzetten
 * bij het aanmaken, het ophalen, en het goedkeuren of afwijzen. RLS en de
 * triggers in de database dwingen af wie wat mag.
 *
 * Deze app kent alleen Privé (geen rij) en Publiek (niveau 'public', 'pending'
 * tot een beheerder het goedkeurt). Oude niveaus van vóór 25-11-2026 (afdeling,
 * directie, ministerie) blijven in de database staan voor de stand op branch
 * stand-25-11-2026; ze worden hier alleen opgeruimd als de eigenaar de prompt
 * weer privé maakt.
 */

function requireClient() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Delen vereist een geconfigureerde Supabase-backend.');
  }
  return supabase;
}

/** Alleen het niveau Publiek wordt nog aangemaakt. */
function publicRows(promptId: string, levels: VisibilityLevel[]) {
  return levels
    .filter((level) => level === 'public')
    .map((level) => ({ prompt_id: promptId, level, org_id: null, status: 'pending' as const }));
}

/**
 * Zet Publiek klaar voor een net aangemaakte prompt. Leeg = privé, dan wordt er
 * niets aangemaakt.
 */
export async function setInitialVisibility(promptId: string, levels: VisibilityLevel[]): Promise<void> {
  const rows = publicRows(promptId, levels);
  if (!rows.length) return;
  const client = requireClient();
  const { error } = await client.from('prompt_visibility').insert(rows);
  if (error) throw error;
}

/**
 * Werk de zichtbaarheid van een bestaande prompt bij (eigenaar of beheerder).
 *   - Privé: alle niveaus gaan weg, ook oude afdelings- of ministerieniveaus.
 *   - Publiek: staat er al een publieke rij, dan blijft die staan (een
 *     goedgekeurde prompt valt niet terug naar 'pending'); anders komt hij erbij.
 *     Oude niveaus blijven dan ongemoeid.
 * Het representatieve `sharing_level` op de prompt-rij werkt mee voor badge en filters.
 */
export async function updatePromptVisibility(promptId: string, nextLevels: VisibilityLevel[]): Promise<void> {
  const client = requireClient();
  const current = await listVisibility(promptId);
  const wantsPublic = nextLevels.includes('public');

  if (!wantsPublic && current.length) {
    const { error } = await client
      .from('prompt_visibility')
      .delete()
      .in('id', current.map((r) => r.id));
    if (error) throw error;
  }

  if (wantsPublic && !current.some((r) => r.level === 'public')) {
    const { error } = await client.from('prompt_visibility').insert(publicRows(promptId, ['public']));
    if (error) throw error;
  }

  const { error: promptErr } = await client
    .from('prompts')
    .update({ sharing_level: representativeSharingLevel(wantsPublic ? ['public'] : []) })
    .eq('id', promptId);
  if (promptErr) throw promptErr;
}

/** Alle deelniveaus van een prompt (voor de detailweergave/het deelpaneel). */
export async function listVisibility(promptId: string): Promise<PromptVisibility[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  const { data, error } = await supabase
    .from('prompt_visibility')
    .select('*')
    .eq('prompt_id', promptId)
    .order('level', { ascending: true });
  if (error) throw error;
  return (data as PromptVisibility[]) ?? [];
}

/** Keur één deelniveau goed of wijs het af. RLS bepaalt of je dit mag. */
export async function decideVisibility(
  visibilityId: string,
  decision: 'approved' | 'rejected',
  note?: string,
): Promise<PromptVisibility> {
  const client = requireClient();
  const { data, error } = await client
    .from('prompt_visibility')
    .update({ status: decision, note: note?.trim() || null })
    .eq('id', visibilityId)
    .select('*')
    .single();
  if (error) throw error;
  return data as PromptVisibility;
}

/**
 * De publieke prompts die op een beheerder wachten. RLS filtert dit: pending-rijen
 * zijn alleen leesbaar voor wie ze mag beoordelen.
 * We verrijken elke rij met de bijbehorende prompt voor weergave in de wachtrij.
 */
export async function listPendingForModeration(): Promise<(PromptVisibility & { prompt: Prompt | null })[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  const { data, error } = await supabase
    .from('prompt_visibility')
    .select('*, prompt:prompt_id(*)')
    .eq('status', 'pending')
    .eq('level', 'public')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data as (PromptVisibility & { prompt: Prompt | null })[]) ?? [];
}
