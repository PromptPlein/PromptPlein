import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { Prompt, PromptVisibility, VisibilityLevel } from '@/types';
import { VISIBILITY_LEVELS } from '@/lib/utils';

/**
 * Beheer van de deelniveaus (prompt_visibility) van een prompt: het klaarzetten
 * van de gekozen niveaus bij het aanmaken, het ophalen ervan, en het
 * goedkeuren/afwijzen per niveau. RLS dwingt af wie wat mag.
 *
 * Statuslogica bij aanmaken:
 *   - Afdeling      → direct 'approved' (geen wachttijd, niemand hoeft te wachten).
 *   - Ministerie    → 'pending' (een moderator van het ministerie beoordeelt).
 *   - Rijksoverheid → 'pending' (een beheerder beoordeelt).
 */

function requireClient() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Delen vereist een geconfigureerde Supabase-backend.');
  }
  return supabase;
}

/** De ministerie-wortel van een organisatie (eerste niveau onder Rijksoverheid). */
async function ministryRootId(orgId: string | null | undefined): Promise<string | null> {
  if (!orgId || !isSupabaseConfigured || !supabase) return null;
  let currentId: string | null = orgId;
  // Loop de boom omhoog tot de ouder de 'government'-root is.
  for (let i = 0; i < 12 && currentId; i++) {
    const { data } = await supabase
      .from('organizations')
      .select('parent_id, parent:parent_id(organization_type)')
      .eq('id', currentId)
      .maybeSingle();
    const row = data as { parent_id: string | null; parent: { organization_type: string } | null } | null;
    if (!row || !row.parent_id) return currentId;
    if (row.parent?.organization_type === 'government') return currentId;
    currentId = row.parent_id;
  }
  return currentId;
}

const AUTO_APPROVED = new Set(VISIBILITY_LEVELS.filter((v) => v.autoApproved).map((v) => v.value));

/**
 * Zet de gekozen deelniveaus klaar voor een net aangemaakte prompt. De afdeling
 * is direct goedgekeurd; hogere niveaus komen 'pending' en wachten op de juiste
 * beoordelaar. Leeg = privé, dan wordt er niets aangemaakt.
 */
export async function setInitialVisibility(
  promptId: string,
  levels: VisibilityLevel[],
  organizationId: string | null | undefined,
): Promise<void> {
  if (!levels.length) return;
  const client = requireClient();
  const ministryRoot = levels.includes('ministry') ? await ministryRootId(organizationId) : null;

  const rows = levels.map((level) => ({
    prompt_id: promptId,
    level,
    org_id:
      level === 'department' ? organizationId ?? null : level === 'ministry' ? ministryRoot : null,
    status: AUTO_APPROVED.has(level) ? 'approved' : 'pending',
    reviewed_at: AUTO_APPROVED.has(level) ? new Date().toISOString() : null,
  }));

  const { error } = await client.from('prompt_visibility').insert(rows);
  if (error) throw error;
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
 * De deelniveaus die op beoordeling wachten en die de huidige gebruiker mag
 * afhandelen (moderator: ministerie van zijn tak; admin: alles). RLS filtert dit
 * automatisch — pending-rijen zijn alleen leesbaar voor wie ze mag modereren.
 * We verrijken elke rij met de bijbehorende prompt voor weergave in de wachtrij.
 */
export async function listPendingForModeration(): Promise<(PromptVisibility & { prompt: Prompt | null })[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  const { data, error } = await supabase
    .from('prompt_visibility')
    .select('*, prompt:prompt_id(*)')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data as (PromptVisibility & { prompt: Prompt | null })[]) ?? [];
}
