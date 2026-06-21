import { useEffect, useState } from 'react';
import { Check, X, Globe2 } from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { listVisibility, decideVisibility } from '@/services/visibilityService';
import { VISIBILITY_STATUS_META } from '@/services/collaborationService';
import { visibilityMeta } from '@/lib/utils';
import { logAdminAction } from '@/services/adminService';
import type { PromptVisibility } from '@/types';

/**
 * Toont de deelniveaus van een prompt met hun goedkeuringsstatus, en — voor wie
 * een niveau mag beoordelen — knoppen om dat niveau goed te keuren of af te
 * wijzen. Per niveau apart: de afdeling kan al goedgekeurd zijn terwijl het
 * ministerie nog wacht. RLS bepaalt of een beslissing slaagt; we tonen de
 * knoppen voor nog-openstaande niveaus en vangen een weigering netjes op.
 */
export default function VisibilityApprovalPanel({
  promptId,
  refreshKey,
}: {
  promptId: string;
  refreshKey?: number;
}) {
  const [rows, setRows] = useState<PromptVisibility[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  async function reload() {
    try {
      setRows(await listVisibility(promptId));
    } catch {
      /* niet-blokkerend */
    }
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promptId, refreshKey]);

  async function decide(row: PromptVisibility, decision: 'approved' | 'rejected') {
    setBusyId(row.id);
    try {
      await decideVisibility(row.id, decision, notes[row.id]);
      void logAdminAction({
        action: decision === 'approved' ? 'approve_visibility' : 'reject_visibility',
        entity_type: 'prompt_visibility',
        entity_id: row.id,
        changes: { prompt_id: promptId, level: row.level, note: notes[row.id] || null },
      });
      toast.success(decision === 'approved' ? 'Niveau goedgekeurd' : 'Niveau afgewezen');
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Je hebt geen rechten om dit niveau te beoordelen.');
    } finally {
      setBusyId(null);
    }
  }

  if (rows.length === 0) {
    return (
      <div className="opl-card p-5">
        <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
          <Globe2 size={18} className="text-rijksblauw-500" /> Deelniveaus
        </h2>
        <p className="text-sm text-slate-400 dark:text-slate-500">
          Deze prompt is privé — er zijn geen deelniveaus.
        </p>
      </div>
    );
  }

  return (
    <div className="opl-card p-5">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
        <Globe2 size={18} className="text-rijksblauw-500" /> Deelniveaus ({rows.length})
      </h2>
      <ul className="space-y-3">
        {rows.map((row) => {
          const meta = visibilityMeta(row.level);
          const statusMeta = VISIBILITY_STATUS_META[row.status];
          const canDecide = row.status === 'pending';
          return (
            <li
              key={row.id}
              className="rounded-xl border border-slate-200 p-3 dark:border-slate-700"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-slate-800 dark:text-slate-100">
                  {meta?.label ?? row.level}
                </span>
                <span className={clsx('opl-badge', statusMeta.classes)}>{statusMeta.label}</span>
              </div>
              {meta && (
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{meta.description}</p>
              )}

              {canDecide && (
                <div className="mt-2 space-y-2">
                  <textarea
                    className="opl-input"
                    rows={2}
                    placeholder="Optionele opmerking bij je beslissing…"
                    value={notes[row.id] ?? ''}
                    onChange={(e) => setNotes((n) => ({ ...n, [row.id]: e.target.value }))}
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => decide(row, 'rejected')}
                      disabled={busyId === row.id}
                      className="opl-btn-secondary text-rijksrood"
                    >
                      <X size={16} /> Afwijzen
                    </button>
                    <button
                      onClick={() => decide(row, 'approved')}
                      disabled={busyId === row.id}
                      className="opl-btn-primary bg-emerald-600 hover:bg-emerald-700"
                    >
                      <Check size={16} /> Goedkeuren
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
