import { useEffect, useState } from 'react';
import { Check, X, Globe2, Pencil, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import {
  listVisibility,
  decideVisibility,
  updatePromptVisibility,
} from '@/services/visibilityService';
import { VISIBILITY_STATUS_META } from '@/services/collaborationService';
import { visibilityMeta } from '@/lib/utils';
import { logAdminAction } from '@/services/adminService';
import VisibilityPicker from '@/components/prompts/VisibilityPicker';
import type { PromptVisibility, VisibilityLevel } from '@/types';

/**
 * Toont de deelniveaus van een prompt met hun goedkeuringsstatus, en — voor wie
 * een niveau mag beoordelen — knoppen om dat niveau goed te keuren of af te
 * wijzen. Per niveau apart: de afdeling kan al goedgekeurd zijn terwijl het
 * ministerie nog wacht. RLS bepaalt of een beslissing slaagt; we tonen de
 * knoppen voor nog-openstaande niveaus en vangen een weigering netjes op.
 *
 * Daarnaast kan de eigenaar (of een admin) de zichtbaarheid achteraf aanpassen:
 * een privé-prompt later alsnog met de afdeling of het ministerie delen, of een
 * gedeeld niveau weer intrekken. Nieuw gekozen niveaus volgen dezelfde
 * goedkeuringsroute als bij het aanmaken.
 */
export default function VisibilityApprovalPanel({
  promptId,
  refreshKey,
  /** Mag de huidige gebruiker de deelniveaus aanpassen (eigenaar/admin)? */
  canEdit = false,
  /** De organisatie van de prompt — nodig om afdeling/ministerie te koppelen. */
  organizationId = null,
  /** Aangeroepen na een wijziging, zodat de pagina de badge kan verversen. */
  onChanged,
}: {
  promptId: string;
  refreshKey?: number;
  canEdit?: boolean;
  organizationId?: string | null;
  onChanged?: () => void;
}) {
  const [rows, setRows] = useState<PromptVisibility[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  // Aanpassen-modus: de eigenaar kiest de gewenste niveaus opnieuw.
  const [editing, setEditing] = useState(false);
  const [draftLevels, setDraftLevels] = useState<VisibilityLevel[]>([]);
  const [saving, setSaving] = useState(false);

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

  function startEditing() {
    // Begin met de niveaus die nu (in welke status dan ook) gekozen zijn.
    setDraftLevels(rows.map((r) => r.level));
    setEditing(true);
  }

  async function saveLevels() {
    setSaving(true);
    try {
      await updatePromptVisibility(promptId, draftLevels, organizationId);
      toast.success('Zichtbaarheid bijgewerkt');
      setEditing(false);
      await reload();
      onChanged?.();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Aanpassen van de zichtbaarheid mislukt.',
      );
    } finally {
      setSaving(false);
    }
  }

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

  return (
    <div className="opl-card p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
          <Globe2 size={18} className="text-rijksblauw-500" /> Deelniveaus
          {rows.length > 0 && ` (${rows.length})`}
        </h2>
        {canEdit && !editing && (
          <button
            onClick={startEditing}
            className="inline-flex items-center gap-1 text-sm text-rijksblauw-600 hover:text-rijksblauw-800 dark:text-rijksblauw-300 dark:hover:text-rijksblauw-200"
          >
            <Pencil size={14} /> Aanpassen
          </button>
        )}
      </div>

      {/* Aanpassen-modus: de eigenaar/admin kiest de gewenste niveaus opnieuw. */}
      {editing ? (
        <div className="space-y-3">
          <VisibilityPicker idPrefix="edit-vis" value={draftLevels} onChange={setDraftLevels} />
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Nieuw aangevinkte niveaus volgen de gebruikelijke route: de afdeling is direct
            beschikbaar, het ministerie en Rijksoverheid wachten op goedkeuring. Een niveau dat
            je uitvinkt, wordt weer ingetrokken.
          </p>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setEditing(false)}
              disabled={saving}
              className="opl-btn-secondary"
            >
              <X size={16} /> Annuleren
            </button>
            <button onClick={saveLevels} disabled={saving} className="opl-btn-primary">
              <Save size={16} /> {saving ? 'Opslaan…' : 'Opslaan'}
            </button>
          </div>
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-400 dark:text-slate-500">
          Deze prompt is privé — er zijn geen deelniveaus.
          {canEdit && ' Klik op “Aanpassen” om hem met je afdeling of ministerie te delen.'}
        </p>
      ) : (
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
      )}
    </div>
  );
}
