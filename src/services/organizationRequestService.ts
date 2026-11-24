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

/**
 * De eigen aanvragen die nog op een beheerder wachten, voor het profiel. Ook die
 * van een collega waar je bij aansloot (0067).
 */
export async function listOwnPendingOrganizationRequests(userId: string): Promise<OrganizationRequest[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  const { data, error } = await supabase
    .from('organization_requests')
    .select('*')
    .eq('requested_by', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  if (error) throw error;
  const own = (data ?? []) as OrganizationRequest[];

  // Zonder migratie 0067 bestaat de tabel nog niet: dan alleen de eigen.
  const { data: joined } = await supabase
    .from('organization_request_followers')
    .select('request_id')
    .eq('user_id', userId);
  const ids = ((joined ?? []) as { request_id: string }[])
    .map((j) => j.request_id)
    .filter((id) => !own.some((r) => r.id === id));
  if (ids.length === 0) return own;
  const { data: more } = await supabase
    .from('organization_requests')
    .select('*')
    .in('id', ids)
    .eq('status', 'pending');
  return [...own, ...((more ?? []) as OrganizationRequest[])];
}

/** Een aanvraag die nog wacht, zoals het formulier hem kan aanbieden. */
export interface PendingOrgRequest {
  id: string;
  parent_id: string;
  names: string[];
  codes: string[];
}

/**
 * De afdelingen die onder een ministerie al worden aangevraagd, zonder de
 * aanvrager. Werkt ook bij het registreren, zonder sessie. Leeg bij een fout:
 * het is een hulp bij het aanvragen, geen voorwaarde.
 */
export async function listPendingRequestsUnder(ministryId: string): Promise<PendingOrgRequest[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  const { data, error } = await supabase.rpc('pending_organization_requests', {
    p_ministry: ministryId,
  });
  if (error) return [];
  return (data ?? []) as PendingOrgRequest[];
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

  // Wie aansloot bij een aanvraag (0067); zonder die tabel blijft het bij de aanvrager.
  if (rows.length) {
    const { data: joined } = await client
      .from('organization_request_followers')
      .select('request_id')
      .in('request_id', rows.map((r) => r.id));
    for (const j of (joined ?? []) as { request_id: string }[]) {
      const r = rows.find((x) => x.id === j.request_id);
      if (r) r.followers = (r.followers ?? 0) + 1;
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
