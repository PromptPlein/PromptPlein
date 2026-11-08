import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { FunctionRequest, Profile, Role } from '@/types';

/**
 * Functie-aanvragen: een gebruiker vraagt een ontbrekende functie aan, een
 * admin keurt die goed (waarna de functie in de roles-tabel verschijnt) of af.
 * RLS dwingt af wie wat mag; deze laag verzorgt de samengestelde acties.
 */

function requireClient() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Functie-aanvragen vereisen een geconfigureerde Supabase-backend.');
  }
  return supabase;
}

/** Dien een aanvraag in voor een nieuwe functie (namens de ingelogde gebruiker). */
export async function requestFunction(params: {
  name: string;
  requestedBy: string;
  motivation?: string;
}): Promise<FunctionRequest> {
  const client = requireClient();
  const { data, error } = await client
    .from('function_requests')
    .insert({
      name: params.name.trim(),
      motivation: params.motivation?.trim() || null,
      requested_by: params.requestedBy,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as FunctionRequest;
}

/** Haal de openstaande aanvragen op, verrijkt met de naam van de aanvrager. */
export async function listPendingFunctionRequests(): Promise<FunctionRequest[]> {
  const client = requireClient();
  const { data, error } = await client
    .from('function_requests')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  if (error) throw error;
  const rows = (data ?? []) as FunctionRequest[];

  // Verrijk met aanvrager-profiel (naam/e-mail) in één extra query.
  const ids = [...new Set(rows.map((r) => r.requested_by).filter(Boolean))] as string[];
  if (ids.length) {
    const { data: profs } = await client
      .from('profiles')
      .select('id, email, full_name')
      .in('id', ids);
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
 * Keur een aanvraag goed: maak de functie aan in de roles-tabel en markeer de
 * aanvraag als 'approved' met een verwijzing naar de nieuwe functie.
 */
export async function approveFunctionRequest(
  request: FunctionRequest,
  reviewerId: string,
  note?: string,
): Promise<Role> {
  const client = requireClient();

  // 1. Functie aanmaken (admin-RLS staat dit toe voor ingelogde admins).
  const { data: roleData, error: roleError } = await client
    .from('roles')
    .insert({ name: request.name.trim(), description: request.motivation?.trim() || null })
    .select('*')
    .single();
  if (roleError) throw roleError;
  const role = roleData as Role;

  // 2. Aanvraag afronden.
  const { error: updErr } = await client
    .from('function_requests')
    .update({
      status: 'approved',
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
      review_note: note?.trim() || null,
      created_role_id: role.id,
    })
    .eq('id', request.id);
  if (updErr) throw updErr;

  return role;
}

/** Wijs een aanvraag af (geen functie aangemaakt). */
export async function rejectFunctionRequest(
  requestId: string,
  reviewerId: string,
  note?: string,
): Promise<void> {
  const client = requireClient();
  const { error } = await client
    .from('function_requests')
    .update({
      status: 'rejected',
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
      review_note: note?.trim() || null,
    })
    .eq('id', requestId);
  if (error) throw error;
}
