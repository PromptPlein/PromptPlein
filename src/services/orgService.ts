import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { localStore } from '@/services/localStore';
import type {
  AppRole,
  Organization,
  OrganizationModerator,
  OrganizationType,
  Profile,
} from '@/types';

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

// --- Logo-uploads (Supabase Storage) ---

const LOGO_BUCKET = 'org-logos';

/**
 * Upload een (al client-side geoptimaliseerd) logo naar de `org-logos`-bucket
 * en geef de publieke URL terug. Het bestand is vierkant en klein, zodat de
 * logo's in het organogram uniform getoond worden.
 *
 * @param blob   Het geoptimaliseerde beeld (PNG/WebP).
 * @param hint   Optionele naamhint (bijv. de organisatiecode) voor leesbaarheid.
 */
export async function uploadOrgLogo(blob: Blob, hint?: string): Promise<string> {
  const client = requireClient();
  const ext = blob.type === 'image/webp' ? 'webp' : 'png';
  const slug = (hint ?? 'logo')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32) || 'logo';
  // Unieke bestandsnaam → geen cache-problemen bij vervangen.
  const rand = Math.random().toString(36).slice(2, 10);
  const path = `${slug}-${Date.now()}-${rand}.${ext}`;

  const { error } = await client.storage.from(LOGO_BUCKET).upload(path, blob, {
    contentType: blob.type || 'image/png',
    upsert: false,
    cacheControl: '31536000',
  });
  if (error) throw error;

  const { data } = client.storage.from(LOGO_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

// --- Organisaties ---

export async function listOrganizations(includeInactive = false): Promise<Organization[]> {
  // Mock-modus: vaste demo-organisaties zodat de community/het organogram werkt.
  if (!isSupabaseConfigured || !supabase) return localStore.listOrganizations();
  let query = supabase.from('organizations').select('*').order('name');
  if (!includeInactive) query = query.eq('is_active', true);
  const { data, error } = await query;
  if (error) throw error;
  return (data as Organization[]) ?? [];
}

/**
 * Een afdeling onder een ministerie, door de gebruiker zelf en zonder
 * goedkeuring (migratie 0055). Bestaat de naam al onder dat ministerie, dan
 * komt die afdeling terug in plaats van een kopie.
 */
export async function createDepartment(ministryId: string, name: string): Promise<Organization> {
  const client = requireClient();
  const { data, error } = await client.rpc('create_department', {
    p_ministry: ministryId,
    p_name: name,
  });
  if (error) {
    // De database geeft zelf een leesbare melding; een ontbrekende functie niet.
    if (error.code === 'PGRST202') throw new Error('Afdelingen toevoegen kan nog niet. Probeer het later opnieuw.');
    throw new Error(error.message);
  }
  return data as Organization;
}

export interface OrganizationInput {
  name: string;
  code?: string | null;
  description?: string | null;
  logo_url?: string | null;
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

// --- Moderatoren (per organisatie/ministerie) ---

/** Alle moderator-koppelingen (admin-overzicht). */
export async function listOrganizationModerators(): Promise<OrganizationModerator[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  const { data, error } = await supabase
    .from('organization_moderators')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as OrganizationModerator[]) ?? [];
}

/** Wijs een gebruiker aan als moderator van een organisatie (admin). */
export async function addOrganizationModerator(
  userId: string,
  organizationId: string,
): Promise<OrganizationModerator> {
  const client = requireClient();
  const { data, error } = await client
    .from('organization_moderators')
    .insert({ user_id: userId, organization_id: organizationId })
    .select('*')
    .single();
  if (error) throw error;
  return data as OrganizationModerator;
}

/** Verwijder een moderator-koppeling (admin). */
export async function removeOrganizationModerator(id: string): Promise<void> {
  const client = requireClient();
  const { error } = await client.from('organization_moderators').delete().eq('id', id);
  if (error) throw error;
}

/**
 * De organisatie-id's waarvan de huidige gebruiker moderator is. Gebruikt om in
 * de UI te bepalen of iemand de goedkeuringswachtrij mag zien. RLS staat lezen
 * van organization_moderators toe voor elke ingelogde gebruiker.
 */
export async function fetchMyModeratorOrgIds(userId: string): Promise<string[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  const { data, error } = await supabase
    .from('organization_moderators')
    .select('organization_id')
    .eq('user_id', userId);
  if (error) throw error;
  return ((data as { organization_id: string }[]) ?? []).map((r) => r.organization_id);
}

export const APP_ROLE_LABELS: Record<AppRole, string> = {
  user: 'Gebruiker',
  admin: 'Beheerder',
  super_admin: 'Hoofdbeheerder',
};

export const ORG_TYPE_LABELS: Record<OrganizationType, string> = {
  government: 'Rijksoverheid',
  ministry: 'Ministerie',
  directorate_general: 'Directoraat-generaal',
  directorate: 'Directie',
  agency: 'Agentschap',
  department: 'Afdeling',
};
