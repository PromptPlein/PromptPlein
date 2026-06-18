import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { AppRole, Organization, OrganizationType, Profile } from '@/types';

/**
 * Beheer van organisaties (ministeries/afdelingen) en gebruikersprofielen.
 * Vereist een geconfigureerde Supabase-backend; RLS dwingt af dat alleen
 * admins mogen schrijven.
 */

function requireClient() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Organisatiebeheer vereist een geconfigureerde Supabase-backend.');
  }
  return supabase;
}

// --- Organisaties ---

export async function listOrganizations(includeInactive = false): Promise<Organization[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  let query = supabase.from('organizations').select('*').order('name');
  if (!includeInactive) query = query.eq('is_active', true);
  const { data, error } = await query;
  if (error) throw error;
  return (data as Organization[]) ?? [];
}

export interface OrganizationInput {
  name: string;
  code?: string | null;
  description?: string | null;
  parent_id?: string | null;
  organization_type: OrganizationType;
  contact_email?: string | null;
  is_active?: boolean;
}

export async function createOrganization(input: OrganizationInput): Promise<Organization> {
  const client = requireClient();
  const { data, error } = await client.from('organizations').insert(input).select('*').single();
  if (error) throw error;
  return data as Organization;
}

export async function updateOrganization(
  id: string,
  patch: Partial<OrganizationInput>,
): Promise<Organization> {
  const client = requireClient();
  const { data, error } = await client
    .from('organizations')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data as Organization;
}

export async function deleteOrganization(id: string): Promise<void> {
  const client = requireClient();
  const { error } = await client.from('organizations').delete().eq('id', id);
  if (error) throw error;
}

// --- Gebruikersprofielen (adminbeheer) ---

export async function listProfiles(): Promise<Profile[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as Profile[]) ?? [];
}

export async function adminUpdateProfile(
  id: string,
  patch: Partial<Pick<Profile, 'role' | 'organization_id' | 'is_active' | 'full_name'>>,
): Promise<Profile> {
  const client = requireClient();
  const { data, error } = await client
    .from('profiles')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data as Profile;
}

export const APP_ROLE_LABELS: Record<AppRole, string> = {
  user: 'Gebruiker',
  admin: 'Beheerder',
  super_admin: 'Hoofdbeheerder',
};

export const ORG_TYPE_LABELS: Record<OrganizationType, string> = {
  ministry: 'Ministerie',
  department: 'Afdeling',
  agency: 'Agentschap',
};
