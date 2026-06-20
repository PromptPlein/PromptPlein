import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type {
  Profile,
  Prompt,
  PromptApproval,
  PromptComment,
  PromptVersion,
} from '@/types';

/**
 * Samenwerking & goedkeuring rond prompts: versies, reacties en de
 * draft→ingediend→goedgekeurd/afgewezen-workflow. RLS dwingt de rechten af.
 */

function requireClient() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Samenwerking vereist een geconfigureerde Supabase-backend.');
  }
  return supabase;
}

/** Haal de profielen (naam/e-mail) op voor een set gebruikers-id's. */
async function profilesByIds(
  ids: string[],
): Promise<Map<string, Pick<Profile, 'email' | 'full_name'>>> {
  const map = new Map<string, Pick<Profile, 'email' | 'full_name'>>();
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length || !isSupabaseConfigured || !supabase) return map;
  const { data } = await supabase.from('profiles').select('id, email, full_name').in('id', unique);
  for (const row of (data as (Profile & { id: string })[]) ?? []) {
    map.set(row.id, { email: row.email, full_name: row.full_name });
  }
  return map;
}

// --- Versies ---

export async function listVersions(promptId: string): Promise<PromptVersion[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  const { data, error } = await supabase
    .from('prompt_versions')
    .select('*')
    .eq('prompt_id', promptId)
    .order('version', { ascending: false });
  if (error) throw error;
  return (data as PromptVersion[]) ?? [];
}

// --- Reacties ---

export async function listComments(promptId: string): Promise<PromptComment[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  const { data, error } = await supabase
    .from('prompt_comments')
    .select('*')
    .eq('prompt_id', promptId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  const comments = (data as PromptComment[]) ?? [];
  const profiles = await profilesByIds(comments.map((c) => c.user_id));
  return comments.map((c) => ({ ...c, profile: profiles.get(c.user_id) ?? null }));
}

export async function addComment(
  promptId: string,
  userId: string,
  body: string,
): Promise<PromptComment> {
  const client = requireClient();
  const { data, error } = await client
    .from('prompt_comments')
    .insert({ prompt_id: promptId, user_id: userId, body: body.trim() })
    .select('*')
    .single();
  if (error) throw error;
  return data as PromptComment;
}

export async function deleteComment(id: string): Promise<void> {
  const client = requireClient();
  const { error } = await client.from('prompt_comments').delete().eq('id', id);
  if (error) throw error;
}

// --- Goedkeuringsworkflow ---

export async function submitForApproval(promptId: string): Promise<Prompt> {
  const client = requireClient();
  const { data, error } = await client
    .from('prompts')
    .update({ status: 'submitted', submitted_at: new Date().toISOString() })
    .eq('id', promptId)
    .select('*')
    .single();
  if (error) throw error;
  return data as Prompt;
}

export async function decide(
  promptId: string,
  decision: 'approved' | 'rejected',
  reviewerId: string,
  note?: string,
): Promise<Prompt> {
  const client = requireClient();
  const { error: logError } = await client.from('prompt_approvals').insert({
    prompt_id: promptId,
    status: decision,
    reviewer_id: reviewerId,
    note: note?.trim() || null,
  });
  if (logError) throw logError;

  const { data, error } = await client
    .from('prompts')
    .update({
      status: decision,
      reviewed_at: new Date().toISOString(),
      reviewed_by: reviewerId,
    })
    .eq('id', promptId)
    .select('*')
    .single();
  if (error) throw error;
  return data as Prompt;
}

export async function listApprovals(promptId: string): Promise<PromptApproval[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  const { data, error } = await supabase
    .from('prompt_approvals')
    .select('*')
    .eq('prompt_id', promptId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as PromptApproval[]) ?? [];
}

/** Alle ingediende prompts die op beoordeling wachten (admin-overzicht). */
export async function listSubmittedPrompts(): Promise<Prompt[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  const { data, error } = await supabase
    .from('prompts')
    .select('*')
    .eq('status', 'submitted')
    .order('submitted_at', { ascending: true });
  if (error) throw error;
  return (data as Prompt[]) ?? [];
}

export const PROMPT_STATUS_META: Record<
  NonNullable<Prompt['status']>,
  { label: string; classes: string }
> = {
  draft: { label: 'Concept', classes: 'bg-slate-100 text-slate-600' },
  submitted: { label: 'Ingediend', classes: 'bg-amber-100 text-amber-800' },
  approved: { label: 'Goedgekeurd', classes: 'bg-emerald-100 text-emerald-700' },
  rejected: { label: 'Afgewezen', classes: 'bg-red-100 text-rijksrood' },
  archived: { label: 'Gearchiveerd', classes: 'bg-slate-100 text-slate-400' },
};
