import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { Organization, OrganizationRequest, Profile } from '@/types';

/**
 * Aanvragen voor een nieuwe afdeling, zo nodig met de directie of dienst erboven
 * (migraties 0056 tot 0058). Een gebruiker vraagt een of meer lagen aan, een beheerder keurt ze goed en dan
 * ontstaat de hele keten. RLS en de database-functies dwingen af wie wat mag.
 */

function requireClient() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Afdelingen aanvragen vereist een geconfigureerde Supabase-backend.');
  }
  return supabase;
}

/** Vertaal een databasefout naar een zin die de gebruiker kan lezen. */
function readableError(error: { code?: string; message: string }): Error {
  // De database geeft zelf een leesbare melding; een ontbrekende functie niet.
  if (error.code === 'PGRST202') {
    return new Error('Een afdeling aanvragen kan nog niet. Probeer het later opnieuw.');
  }
  return new Error(error.message);
}

/** Een nieuwe laag: de naam voluit, met de afkorting als die er is. */
export interface NewOrgLayer {
  name: string;
  code?: string | null;
}

/**
 * Vraag een of meer nieuwe lagen aan onder een bestaande plek, van boven naar
 * beneden. Bestaat een deel al, dan hangt de aanvraag onder het diepste bestaande
 * onderdeel.
 */
export async function requestOrganization(
  parentId: string,
  layers: NewOrgLayer[],
  motivation?: string,
): Promise<OrganizationRequest> {
  const client = requireClient();
  const { data, error } = await client.rpc('request_organization', {
    p_parent: parentId,
    p_names: layers.map((l) => l.name.trim()),
    p_codes: layers.map((l) => l.code?.trim() ?? ''),
    p_motivation: motivation?.trim() || null,
  });
  if (error) throw readableError(error);
  return data as OrganizationRequest;
}

/** De nieuwe lagen van een aanvraag als tekst, bijvoorbeeld "Organisatie Digitale Infrastructuur (ODI)". */
export function requestLayerLabels(request: OrganizationRequest): string[] {
  return request.names.map((name, i) => {
    const code = request.codes?.[i]?.trim();
    return code ? `${name} (${code})` : name;
  });
}

/** De eigen aanvragen die nog op een beheerder wachten, voor het profiel. */
export async function listOwnPendingOrganizationRequests(userId: string): Promise<OrganizationRequest[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  const { data, error } = await supabase
    .from('organization_requests')
    .select('*')
    .eq('requested_by', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as OrganizationRequest[];
}

/** Aantal openstaande aanvragen, voor een teller in het beheermenu. */
export async function countPendingOrganizationRequests(): Promise<number> {
  if (!isSupabaseConfigured || !supabase) return 0;
  const { count, error } = await supabase
    .from('organization_requests')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending');
  if (error) throw error;
  return count ?? 0;
}

/** De openstaande aanvragen, met de naam van de aanvrager erbij. */
export async function listPendingOrganizationRequests(): Promise<OrganizationRequest[]> {
  const client = requireClient();
  const { data, error } = await client
    .from('organization_requests')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  if (error) throw error;
  const rows = (data ?? []) as OrganizationRequest[];

  const ids = [...new Set(rows.map((r) => r.requested_by).filter(Boolean))] as string[];
  if (ids.length) {
    const { data: profs } = await client.from('profiles').select('id, email, full_name').in('id', ids);
    const byId = new Map<string, Pick<Profile, 'email' | 'full_name'>>();
    for (const p of (profs as (Profile & { id: string })[]) ?? []) {
      byId.set(p.id, { email: p.email, full_name: p.full_name });
    }
    for (const r of rows) {
      r.requester = r.requested_by ? byId.get(r.requested_by) ?? null : null;
    }
  }
  return rows;
}

/**
 * Keur een aanvraag goed. De database maakt de keten aan (of schuift aan bij wat er
 * al staat) en zet het profiel van de aanvrager op het nieuwe onderdeel.
 */
export async function approveOrganizationRequest(requestId: string, note?: string): Promise<Organization> {
  const client = requireClient();
  const { data, error } = await client.rpc('approve_organization_request', {
    p_id: requestId,
    p_note: note?.trim() || null,
  });
  if (error) throw readableError(error);
  return data as Organization;
}

/** Wijs een aanvraag af; er wordt niets aangemaakt. */
export async function rejectOrganizationRequest(
  requestId: string,
  reviewerId: string,
  note?: string,
): Promise<void> {
  const client = requireClient();
  const { error } = await client
    .from('organization_requests')
    .update({
      status: 'rejected',
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
      review_note: note?.trim() || null,
    })
    .eq('id', requestId)
    .eq('status', 'pending');
  if (error) throw error;
}
