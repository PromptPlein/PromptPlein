import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { BehaviorAction, BehaviorLog } from '@/types';

const configured = isSupabaseConfigured && !!supabase;

/**
 * Fijnmazige gedragslog van de prompt-bouwer. Elke actie in een sessie (een run
 * van de plan-wizard) wordt als aparte regel gelogd, zodat het verloop later te
 * reconstrueren en te exporteren is voor analyse/AI-verbetering.
 *
 * Fire-and-forget: loggen mag de gebruiker nooit blokkeren of vertragen.
 */

/** Een lopende sessie: een gedeelde id + oplopende volgnummers. */
export interface BehaviorSession {
  id: string;
  next: () => number;
}

/** Maak een nieuwe sessie aan (bij de start van een plan-wizard-run). */
export function newBehaviorSession(): BehaviorSession {
  const id = `sess-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  let seq = 0;
  return { id, next: () => ++seq };
}

/**
 * Log één gedragsactie. `session` en `identifier` worden meegegeven door de
 * aanroeper (de wizard); zo blijft de service stateless en testbaar.
 */
export function logBehavior(args: {
  session: BehaviorSession;
  identifier?: string;
  action: BehaviorAction;
  stepIndex?: number | null;
  techniqueId?: string | null;
  metadata?: Record<string, unknown>;
}): void {
  if (!configured) return;
  const row = {
    session_id: args.session.id,
    sequence: args.session.next(),
    user_identifier: args.identifier || null,
    action: args.action,
    step_index: args.stepIndex ?? null,
    technique_id: args.techniqueId ?? null,
    metadata: args.metadata ?? {},
  };
  // Bewust niet awaiten: loggen mag de flow niet ophouden of laten falen.
  void supabase!
    .from('behavior_logs')
    .insert(row)
    .then(({ error }) => {
      if (error) console.debug('[behavior] log mislukt:', error.message);
    });
}

/** Haal de gedragslog op (beheerder; RLS beperkt dit tot admins). */
export async function listBehaviorLogs(limit = 5000): Promise<BehaviorLog[]> {
  if (!configured) return [];
  const { data, error } = await supabase!
    .from('behavior_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as BehaviorLog[];
}

// --- Export voor analyse (CSV met uitgeklapte metadata, en volledige JSON) ---

/** Vlak een genest metadata-object af tot "sleutel.pad" → waarde (voor CSV-kolommen). */
function flattenMeta(meta: Record<string, unknown> | undefined, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  if (!meta) return out;
  for (const [key, value] of Object.entries(meta)) {
    const col = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(out, flattenMeta(value as Record<string, unknown>, col));
    } else if (Array.isArray(value)) {
      out[col] = value.map((v) => String(v)).join('; ');
    } else {
      out[col] = value == null ? '' : String(value);
    }
  }
  return out;
}

function csvCell(v: string): string {
  return `"${v.replace(/"/g, '""')}"`;
}

/**
 * CSV van de gedragslog met alle metadata-velden als eigen kolommen. Elke
 * metadata-sleutel die ergens voorkomt wordt een kolom (leeg waar afwezig), zodat
 * de rijke details volledig in een spreadsheet of aan een AI beschikbaar zijn.
 */
export function behaviorLogsToCsv(logs: BehaviorLog[]): string {
  const flat = logs.map((l) => ({ log: l, meta: flattenMeta(l.metadata) }));
  // Verzamel alle voorkomende metadata-kolommen (gesorteerd voor stabiliteit).
  const metaCols = [...new Set(flat.flatMap((f) => Object.keys(f.meta)))].sort();
  const base = ['created_at', 'session_id', 'sequence', 'user_identifier', 'action', 'step_index', 'technique_id'];
  const header = [...base, ...metaCols.map((c) => `meta.${c}`)];
  const rows = flat.map(({ log, meta }) =>
    [
      log.created_at,
      log.session_id,
      String(log.sequence),
      log.user_identifier ?? '',
      log.action,
      log.step_index == null ? '' : String(log.step_index),
      log.technique_id ?? '',
      ...metaCols.map((c) => meta[c] ?? ''),
    ]
      .map(csvCell)
      .join(','),
  );
  return [header.map(csvCell).join(','), ...rows].join('\n');
}

/** Volledige, geneste JSON-export van de gedragslog (ideaal om aan een AI te voeden). */
export function behaviorLogsToJson(logs: BehaviorLog[]): string {
  return JSON.stringify(logs, null, 2);
}

// --- Aggregaties voor de analyse-weergave ---

export interface BehaviorStat {
  label: string;
  value: number;
}

/** Tel hoe vaak elke actie voorkomt (met leesbare NL-labels). */
export function actionCounts(logs: BehaviorLog[], label: (a: string) => string): BehaviorStat[] {
  const counts = new Map<string, number>();
  for (const l of logs) counts.set(l.action, (counts.get(l.action) ?? 0) + 1);
  return [...counts.entries()]
    .map(([a, value]) => ({ label: label(a), value }))
    .sort((a, b) => b.value - a.value);
}

/** Aantal unieke sessies (plan-wizard-runs). */
export function sessionCount(logs: BehaviorLog[]): number {
  return new Set(logs.map((l) => l.session_id)).size;
}

/**
 * Voltooiingsgraad: hoeveel sessies een eindtemplate samenstelden (`compose_run`)
 * t.o.v. het aantal gestarte sessies. Een kernsignaal voor "waar haken mensen af".
 */
export function completionRate(logs: BehaviorLog[]): { started: number; completed: number; rate: number } {
  const started = new Set(logs.filter((l) => l.action === 'session_started').map((l) => l.session_id));
  const completed = new Set(logs.filter((l) => l.action === 'compose_run').map((l) => l.session_id));
  const s = started.size;
  const c = [...completed].filter((id) => started.has(id)).length;
  return { started: s, completed: c, rate: s > 0 ? c / s : 0 };
}
