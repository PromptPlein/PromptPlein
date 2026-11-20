import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { localStore } from '@/services/localStore';
import type { AnalyticsEvent, AnalyticsEventType } from '@/types';

const local = !isSupabaseConfigured || !supabase;

// --- Bezoekers per dag ---
//
// Elke browser krijgt per dag een willekeurig id, dat de volgende dag weer nieuw
// is. Zo telt Beheer hoeveel mensen er op een dag waren, ingelogd of niet,
// zonder iemand over dagen heen te kunnen volgen. Het id gaat mee met elke
// gebeurtenis, zodat ook te zien is hoeveel verschillende mensen chatten.

const VISITOR_KEY = 'opl.bezoeker';

interface VisitorState {
  dag: string;
  id: string;
  /** Al gemeld vandaag: 'anoniem' en/of 'ingelogd'. */
  gemeld: string[];
}

function today(): string {
  // De dag van de gebruiker, niet die van UTC: om 00:30 in Nederland is het al morgen.
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

/** Zonder opslag (privévenster met blokkade) een id voor deze pagina, niet bewaard. */
let memoryVisitor: VisitorState | null = null;

function visitorState(): VisitorState {
  const dag = today();
  try {
    const raw = localStorage.getItem(VISITOR_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<VisitorState>) : null;
    if (parsed && parsed.dag === dag && typeof parsed.id === 'string') {
      return { dag, id: parsed.id, gemeld: Array.isArray(parsed.gemeld) ? parsed.gemeld : [] };
    }
    const fresh: VisitorState = { dag, id: newId(), gemeld: [] };
    localStorage.setItem(VISITOR_KEY, JSON.stringify(fresh));
    return fresh;
  } catch {
    if (!memoryVisitor || memoryVisitor.dag !== dag) memoryVisitor = { dag, id: newId(), gemeld: [] };
    return memoryVisitor;
  }
}

function saveVisitor(state: VisitorState): void {
  try {
    localStorage.setItem(VISITOR_KEY, JSON.stringify(state));
  } catch {
    memoryVisitor = state;
  }
}

/** Meld een bezoek, één keer per dag per browser en per stand ingelogd of anoniem. */
export function trackVisit(ingelogd: boolean): void {
  const state = visitorState();
  const stand = ingelogd ? 'ingelogd' : 'anoniem';
  if (state.gemeld.includes(stand)) return;
  saveVisitor({ ...state, gemeld: [...state.gemeld, stand] });
  void trackEvent({ event_type: 'visit', metadata: { ingelogd } });
}

/** Log een gebeurtenis. Fire-and-forget: faalt nooit de UX. */
export async function trackEvent(input: {
  event_type: AnalyticsEventType;
  user_identifier?: string;
  prompt_id?: string | null;
  technique_id?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    input = { ...input, metadata: { ...(input.metadata ?? {}), bezoeker: visitorState().id } };
    if (local) {
      localStore.trackEvent(input);
      return;
    }
    await supabase!.from('analytics_events').insert(input);
  } catch {
    /* analytics mag nooit de gebruiker blokkeren */
  }
}

/**
 * Bezoeken, chatberichten en downloads zijn veel talrijker dan de rest en worden
 * in de database geteld (getUsageReport). Ze blijven uit deze lijst, anders
 * verdringen ze binnen de grens van 2000 alle andere gebeurtenissen.
 */
const USAGE_ONLY_EVENTS: AnalyticsEventType[] = ['visit', 'chat_message', 'export_word', 'export_excel', 'export_file'];

export async function listEvents(): Promise<AnalyticsEvent[]> {
  if (local) return localStore.listEvents().filter((e) => !USAGE_ONLY_EVENTS.includes(e.event_type));
  const { data, error } = await supabase!
    .from('analytics_events')
    .select('*')
    .not('event_type', 'in', `(${USAGE_ONLY_EVENTS.join(',')})`)
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
    visit: 0,
    chat_message: 0,
    export_word: 0,
    export_excel: 0,
    export_file: 0,
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

/** Exporteer events naar een CSV-string, inclusief de metadata als JSON-kolom. */
export function eventsToCsv(events: AnalyticsEvent[]): string {
  const header = ['created_at', 'event_type', 'user_identifier', 'prompt_id', 'technique_id', 'metadata'];
  const rows = events.map((e) =>
    [
      e.created_at,
      e.event_type,
      e.user_identifier ?? '',
      e.prompt_id ?? '',
      e.technique_id ?? '',
      e.metadata ? JSON.stringify(e.metadata) : '',
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(','),
  );
  return [header.join(','), ...rows].join('\n');
}

// --- Gebruik per dag (Beheer, Analytics) ---

export interface UsageDay {
  dag: string;
  bezoekers: number;
  ingelogd: number;
  anoniem: number;
  aanmeldingen: number;
  chatberichten: number;
  chatters: number;
  prompts_gemaakt: number;
  prompts_opgeslagen: number;
  word: number;
  excel: number;
  projecten: number;
  zoekopdrachten: number;
  ai_aanroepen: number;
  ai_mislukt: number;
}

export interface UsageReport {
  dagen: UsageDay[];
  ai_per_mode: { mode: string; aantal: number }[];
  ai_per_model: { provider: string; model: string | null; soort: string; aantal: number; mislukt: number }[];
  ai_ingelogd: number;
  ai_anoniem: number;
  gebruikers_totaal: number;
}

/**
 * Telt in de database (admin_usage_daily, 0066), niet in de browser: zo telt
 * alles mee en niet alleen de laatste paar duizend regels.
 */
export async function getUsageReport(days: number): Promise<UsageReport | null> {
  if (local) return null;
  const { data, error } = await supabase!.rpc('admin_usage_daily', { p_days: days });
  if (error) throw error;
  return data as UsageReport;
}
