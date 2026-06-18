import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { AppNotification } from '@/types';

/** In-app notificaties: ophalen, markeren als gelezen en live-updates. */

export async function listNotifications(limit = 30): Promise<AppNotification[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as AppNotification[]) ?? [];
}

export async function markRead(id: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;
  const { error } = await supabase.from('notifications').update({ read: true }).eq('id', id);
  if (error) throw error;
}

export async function markAllRead(): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('read', false);
  if (error) throw error;
}

/**
 * Abonneer op nieuwe notificaties voor de gegeven gebruiker via Supabase
 * Realtime. Retourneert een opzeg-functie.
 */
export function subscribeToNotifications(userId: string, onInsert: () => void): () => void {
  if (!isSupabaseConfigured || !supabase) return () => {};
  const client = supabase;
  const channel = client
    .channel(`notifications:${userId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
      () => onInsert(),
    )
    .subscribe();

  return () => {
    void client.removeChannel(channel);
  };
}
