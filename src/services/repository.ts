import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { localStore } from '@/services/localStore';
import type {
  AdvancedPromptFilters,
  Category,
  NewPromptInput,
  Optimization,
  Prompt,
  PromptFilters,
  Role,
  Technique,
} from '@/types';

const local = !isSupabaseConfigured || !supabase;

// --- Reference data (mutable in Phase 2) ---

export async function getRoles(): Promise<Role[]> {
  if (local) return localStore.listRoles();
  const { data, error } = await supabase!.from('roles').select('*').order('sort_order');
  if (error) throw error;
  return (data ?? []) as Role[];
}

export async function getCategories(): Promise<Category[]> {
  if (local) return localStore.listCategories();
  const { data, error } = await supabase!.from('categories').select('*').order('sort_order');
  if (error) throw error;
  return (data ?? []) as Category[];
}

export async function getTechniques(includeInactive = false): Promise<Technique[]> {
  if (local) return localStore.listTechniques(includeInactive);
  let query = supabase!.from('techniques').select('*').order('sort_order');
  if (!includeInactive) query = query.neq('is_active', false);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Technique[];
}

export async function getTechnique(id: string): Promise<Technique | null> {
  const all = await getTechniques(true);
  return all.find((t) => t.id === id) ?? null;
}

// --- Reference data CRUD (admin) ---

export async function createRole(input: Omit<Role, 'id' | 'created_at'>): Promise<Role> {
  if (local) return localStore.createRole(input);
  const { data, error } = await supabase!.from('roles').insert(input).select('*').single();
  if (error) throw error;
  return data as Role;
}
export async function updateRole(id: string, patch: Partial<Role>): Promise<Role> {
  if (local) return localStore.updateRole(id, patch);
  const { data, error } = await supabase!.from('roles').update(patch).eq('id', id).select('*').single();
  if (error) throw error;
  return data as Role;
}
export async function deleteRole(id: string): Promise<void> {
  if (local) return localStore.deleteRole(id);
  const { error } = await supabase!.from('roles').delete().eq('id', id);
  if (error) throw error;
}

export async function createCategory(input: Omit<Category, 'id' | 'created_at'>): Promise<Category> {
  if (local) return localStore.createCategory(input);
  const { data, error } = await supabase!.from('categories').insert(input).select('*').single();
  if (error) throw error;
  return data as Category;
}
export async function updateCategory(id: string, patch: Partial<Category>): Promise<Category> {
  if (local) return localStore.updateCategory(id, patch);
  const { data, error } = await supabase!
    .from('categories')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data as Category;
}
export async function deleteCategory(id: string): Promise<void> {
  if (local) return localStore.deleteCategory(id);
  const { error } = await supabase!.from('categories').delete().eq('id', id);
  if (error) throw error;
}

export async function createTechnique(
  input: Omit<Technique, 'id' | 'created_at'>,
): Promise<Technique> {
  if (local) return localStore.createTechnique(input);
  const { data, error } = await supabase!.from('techniques').insert(input).select('*').single();
  if (error) throw error;
  return data as Technique;
}
export async function updateTechnique(id: string, patch: Partial<Technique>): Promise<Technique> {
  if (local) return localStore.updateTechnique(id, patch);
  const { data, error } = await supabase!
    .from('techniques')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data as Technique;
}
export async function deleteTechnique(id: string): Promise<void> {
  if (local) return localStore.deleteTechnique(id);
  const { error } = await supabase!.from('techniques').delete().eq('id', id);
  if (error) throw error;
}

// --- Prompts ---

export async function listPrompts(filters: PromptFilters = {}): Promise<Prompt[]> {
  if (local) return localStore.listPrompts(filters);

  let query = supabase!.from('prompts').select('*').order('created_at', { ascending: false });
  if (filters.favorites_only) query = query.eq('is_favorite', true);
  if (filters.category_id) query = query.eq('category_id', filters.category_id);
  if (filters.role_id) query = query.eq('role_id', filters.role_id);
  if (filters.sharing_level) query = query.eq('sharing_level', filters.sharing_level);
  if (filters.query) {
    const q = filters.query.replace(/[%,]/g, ' ');
    query = query.or(`title.ilike.%${q}%,description.ilike.%${q}%,content.ilike.%${q}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  let prompts = (data ?? []) as Prompt[];

  if (filters.technique_id) {
    const { data: opts, error: optErr } = await supabase!
      .from('optimizations')
      .select('prompt_id')
      .eq('technique_id', filters.technique_id);
    if (optErr) throw optErr;
    const ids = new Set((opts ?? []).map((o: { prompt_id: string }) => o.prompt_id));
    prompts = prompts.filter((p) => ids.has(p.id));
  }
  return prompts;
}

export async function searchPrompts(filters: AdvancedPromptFilters = {}): Promise<Prompt[]> {
  if (local) return localStore.searchPrompts(filters);

  let query = supabase!.from('prompts').select('*');
  if (filters.favorites_only) query = query.eq('is_favorite', true);
  if (filters.category_ids?.length) query = query.in('category_id', filters.category_ids);
  if (filters.role_ids?.length) query = query.in('role_id', filters.role_ids);
  if (filters.sharing_levels?.length) query = query.in('sharing_level', filters.sharing_levels);
  if (filters.date_from) query = query.gte('created_at', filters.date_from);
  if (filters.date_to) query = query.lte('created_at', `${filters.date_to}T23:59:59`);
  if (filters.query) {
    const q = filters.query.replace(/[%,]/g, ' ');
    query = query.or(`title.ilike.%${q}%,description.ilike.%${q}%,content.ilike.%${q}%`);
  }

  switch (filters.sort) {
    case 'oldest':
      query = query.order('created_at', { ascending: true });
      break;
    case 'title':
      query = query.order('title', { ascending: true });
      break;
    default:
      query = query.order('created_at', { ascending: false });
  }

  const { data, error } = await query;
  if (error) throw error;
  let prompts = (data ?? []) as Prompt[];

  if (filters.technique_ids?.length) {
    const { data: opts, error: optErr } = await supabase!
      .from('optimizations')
      .select('prompt_id')
      .in('technique_id', filters.technique_ids);
    if (optErr) throw optErr;
    const ids = new Set((opts ?? []).map((o: { prompt_id: string }) => o.prompt_id));
    prompts = prompts.filter((p) => ids.has(p.id));
  }
  return prompts;
}

export async function getPrompt(id: string): Promise<Prompt | null> {
  if (local) return localStore.getPrompt(id);
  const { data, error } = await supabase!.from('prompts').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return (data as Prompt) ?? null;
}

export async function createPrompt(input: NewPromptInput): Promise<Prompt> {
  if (local) return localStore.createPrompt(input);
  const { data, error } = await supabase!.from('prompts').insert(input).select('*').single();
  if (error) throw error;
  return data as Prompt;
}

export async function toggleFavorite(prompt: Prompt): Promise<Prompt> {
  const next = !prompt.is_favorite;
  if (local) return localStore.updatePrompt(prompt.id, { is_favorite: next });
  const { data, error } = await supabase!
    .from('prompts')
    .update({ is_favorite: next })
    .eq('id', prompt.id)
    .select('*')
    .single();
  if (error) throw error;
  return data as Prompt;
}

export async function deletePrompt(id: string): Promise<void> {
  if (local) return localStore.deletePrompt(id);
  const { error } = await supabase!.from('prompts').delete().eq('id', id);
  if (error) throw error;
}

// --- Optimizations ---

export async function listOptimizations(promptId: string): Promise<Optimization[]> {
  if (local) return localStore.listOptimizations(promptId);
  const { data, error } = await supabase!
    .from('optimizations')
    .select('*')
    .eq('prompt_id', promptId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Optimization[];
}

export async function saveOptimization(
  input: Omit<Optimization, 'id' | 'created_at'>,
): Promise<Optimization> {
  if (local) return localStore.createOptimization(input);
  const { data, error } = await supabase!.from('optimizations').insert(input).select('*').single();
  if (error) throw error;
  return data as Optimization;
}
