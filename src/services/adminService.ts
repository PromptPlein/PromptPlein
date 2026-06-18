import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { localStore } from '@/services/localStore';
import type { AuditLogEntry } from '@/types';

const local = !isSupabaseConfigured || !supabase;

// Token-gebaseerde admin-toegang (Phase 2, lichtgewicht).
// In demo-modus is de standaardtoken 'admin'; in productie via VITE_ADMIN_TOKEN.
const ADMIN_TOKEN = (import.meta.env.VITE_ADMIN_TOKEN as string | undefined) || 'admin';
const SESSION_KEY = 'opl.adminToken';

export function adminLogin(token: string): boolean {
  if (token.trim() === ADMIN_TOKEN) {
    localStorage.setItem(SESSION_KEY, token.trim());
    return true;
  }
  return false;
}

export function adminLogout(): void {
  localStorage.removeItem(SESSION_KEY);
}

export function isAdminAuthenticated(): boolean {
  return localStorage.getItem(SESSION_KEY) === ADMIN_TOKEN;
}

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
