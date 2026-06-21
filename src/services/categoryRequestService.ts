import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { Category, CategoryRequest, Profile } from '@/types';

/**
 * Categorie-aanvragen: een gebruiker vraagt een ontbrekende categorie aan, een
 * admin keurt die goed (waarna de categorie in de categories-tabel verschijnt)
 * of af. RLS dwingt af wie wat mag; deze laag verzorgt de samengestelde acties.
 * Spiegelt functionRequestService.
 */

function requireClient() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Categorie-aanvragen vereisen een geconfigureerde Supabase-backend.');
  }
  return supabase;
}

/** Dien een aanvraag in voor een nieuwe categorie (namens de ingelogde gebruiker). */
export async function requestCategory(params: {
  name: string;
  requestedBy: string;
  motivation?: string;
}): Promise<CategoryRequest> {
  const client = requireClient();
  const { data, error } = await client
    .from('category_requests')
    .insert({
      name: params.name.trim(),
      motivation: params.motivation?.trim() || null,
      requested_by: params.requestedBy,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as CategoryRequest;
}

/** Aantal openstaande (pending) aanvragen — voor een badge in het admin-menu. */
export async function countPendingCategoryRequests(): Promise<number> {
  if (!isSupabaseConfigured || !supabase) return 0;
  const { count, error } = await supabase
    .from('category_requests')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending');
  if (error) throw error;
  return count ?? 0;
}

/** Haal de openstaande aanvragen op, verrijkt met de naam van de aanvrager. */
export async function listPendingCategoryRequests(): Promise<CategoryRequest[]> {
  const client = requireClient();
  const { data, error } = await client
    .from('category_requests')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  if (error) throw error;
  const rows = (data ?? []) as CategoryRequest[];

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
 * Keur een aanvraag goed: maak de categorie aan in de categories-tabel en
 * markeer de aanvraag als 'approved' met een verwijzing naar de nieuwe categorie.
 */
export async function approveCategoryRequest(
  request: CategoryRequest,
  reviewerId: string,
  note?: string,
): Promise<Category> {
  const client = requireClient();

  // 1. Categorie aanmaken (admin-RLS staat dit toe voor ingelogde admins).
  const { data: catData, error: catError } = await client
    .from('categories')
    .insert({ name: request.name.trim(), description: request.motivation?.trim() || null })
    .select('*')
    .single();
  if (catError) throw catError;
  const category = catData as Category;

  // 2. Aanvraag afronden.
  const { error: updErr } = await client
    .from('category_requests')
    .update({
      status: 'approved',
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
      review_note: note?.trim() || null,
      created_category_id: category.id,
    })
    .eq('id', request.id);
  if (updErr) throw updErr;

  return category;
}

/** Wijs een aanvraag af (geen categorie aangemaakt). */
export async function rejectCategoryRequest(
  requestId: string,
  reviewerId: string,
  note?: string,
): Promise<void> {
  const client = requireClient();
  const { error } = await client
    .from('category_requests')
    .update({
      status: 'rejected',
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
      review_note: note?.trim() || null,
    })
    .eq('id', requestId);
  if (error) throw error;
}
