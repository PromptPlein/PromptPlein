import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { localStore } from '@/services/localStore';
import type { AnalyticsEvent, AnalyticsEventType } from '@/types';

const local = !isSupabaseConfigured || !supabase;

/** Log een gebeurtenis. Fire-and-forget: faalt nooit de UX. */
export async function trackEvent(input: {
  event_type: AnalyticsEventType;
  user_identifier?: string;
  prompt_id?: string | null;
  technique_id?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    if (local) {
      localStore.trackEvent(input);
      return;
    }
    await supabase!.from('analytics_events').insert(input);
  } catch {
    /* analytics mag nooit de gebruiker blokkeren */
  }
}

export async function listEvents(): Promise<AnalyticsEvent[]> {
  if (local) return localStore.listEvents();
  const { data, error } = await supabase!
    .from('analytics_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(2000);
  if (error) throw error;
  return (data ?? []) as AnalyticsEvent[];
}

// --- Aggregaties voor dashboards ---

export interface CountByLabel {
  label: string;
  value: number;
}

export function countByEventType(events: AnalyticsEvent[]): Record<AnalyticsEventType, number> {
  const base: Record<AnalyticsEventType, number> = {
    prompt_created: 0,
    search: 0,
    optimization_run: 0,
    share_created: 0,
    share_viewed: 0,
    favorite_toggled: 0,
  };
  for (const e of events) base[e.event_type] = (base[e.event_type] ?? 0) + 1;
  return base;
}

export function uniqueUsers(events: AnalyticsEvent[]): number {
  return new Set(events.map((e) => e.user_identifier).filter(Boolean)).size;
}

/** Tel hoe vaak elke techniek gebruikt is, met leesbare labels. */
export function topTechniques(
  events: AnalyticsEvent[],
  techniqueName: (id: string) => string,
  limit = 8,
): CountByLabel[] {
  const counts = new Map<string, number>();
  for (const e of events) {
    if (e.event_type === 'optimization_run' && e.technique_id) {
      counts.set(e.technique_id, (counts.get(e.technique_id) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([id, value]) => ({ label: techniqueName(id), value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

/** Aantal events per dag (laatste N dagen) voor een trendlijn. */
export function eventsPerDay(events: AnalyticsEvent[], days = 14): CountByLabel[] {
  const buckets = new Map<string, number>();
  for (const e of events) {
    const day = e.created_at.slice(0, 10);
    buckets.set(day, (buckets.get(day) ?? 0) + 1);
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-days)
    .map(([label, value]) => ({ label, value }));
}

/** Exporteer events naar een CSV-string. */
export function eventsToCsv(events: AnalyticsEvent[]): string {
  const header = ['created_at', 'event_type', 'user_identifier', 'prompt_id', 'technique_id'];
  const rows = events.map((e) =>
    [
      e.created_at,
      e.event_type,
      e.user_identifier ?? '',
      e.prompt_id ?? '',
      e.technique_id ?? '',
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(','),
  );
  return [header.join(','), ...rows].join('\n');
}
