import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { localStore } from '@/services/localStore';
import type { AuditLogEntry } from '@/types';

const local = !isSupabaseConfigured || !supabase;

/** Log een admin-actie in het audit-log (best-effort). */
export async function logAdminAction(input: {
  action: string;
  entity_type: string;
  entity_id?: string | null;
  changes?: Record<string, unknown>;
  admin_email?: string;
}): Promise<void> {
  try {
    if (local) {
      localStore.addAuditEntry(input);
      return;
    }
    await supabase!.from('admin_audit_log').insert(input);
  } catch {
    /* audit mag de actie niet blokkeren */
  }
}

export async function listAuditEntries(): Promise<AuditLogEntry[]> {
  if (local) return localStore.listAuditEntries();
  const { data, error } = await supabase!
    .from('admin_audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data ?? []) as AuditLogEntry[];
}
