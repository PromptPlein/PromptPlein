import { useEffect, useRef, useState } from 'react';
import { notify } from '@/lib/notify';
import { useNlddValue } from '@/lib/nldd';
import {
  listVisibility,
  decideVisibility,
  updatePromptVisibility,
} from '@/services/visibilityService';
import { VISIBILITY_STATUS_META } from '@/services/collaborationService';
import { visibilityMeta } from '@/lib/utils';
import { logAdminAction } from '@/services/adminService';
import VisibilityPicker from '@/components/prompts/VisibilityPicker';
import type { PromptVisibility, VisibilityLevel, VisibilityStatus } from '@/types';
import '@nldd/design-system/badge';
import '@nldd/design-system/box';
import '@nldd/design-system/button';
import '@nldd/design-system/button-group';
import '@nldd/design-system/card';
import '@nldd/design-system/container';
import '@nldd/design-system/form-field';
import '@nldd/design-system/multi-line-text-field';
import '@nldd/design-system/text';
import '@nldd/design-system/title';

const STATUS_COLOR: Record<VisibilityStatus, 'success' | 'warning' | 'critical'> = {
  approved: 'success',
  pending: 'warning',
  rejected: 'critical',
};

/**
 * Shows the sharing levels of a prompt with their approval status and, for
 * whoever may review a level, buttons to approve or reject it. Each level on
 * its own: the department can be approved while the ministry still waits. RLS
 * decides whether a decision succeeds; the buttons show for pending levels and
 * a refusal is caught.
 *
 * The owner (or an admin) can also change the visibility afterwards: share a
 * private prompt with the department or ministry later, or withdraw a shared
 * level. Newly chosen levels follow the same approval route as on creation.
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
  // Edit mode: the owner picks the wanted levels again.
  const [editing, setEditing] = useState(false);
  const [draftLevels, setDraftLevels] = useState<VisibilityLevel[]>([]);
  const [saving, setSaving] = useState(false);

  async function reload() {
    try {
      setRows(await listVisibility(promptId));
    } catch {
      /* not blocking */
    }
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promptId, refreshKey]);

  function startEditing() {
    // Start from the levels chosen now, in whatever status.
    setDraftLevels(rows.map((r) => r.level));
    setEditing(true);
  }

  async function saveLevels() {
    setSaving(true);
    try {
      await updatePromptVisibility(promptId, draftLevels, organizationId);
      notify.success('Zichtbaarheid bijgewerkt');
      setEditing(false);
      await reload();
      onChanged?.();
    } catch (err) {
      notify.error(
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
      notify.success(decision === 'approved' ? 'Niveau goedgekeurd' : 'Niveau afgewezen');
      await reload();
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Je hebt geen rechten om dit niveau te beoordelen.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <nldd-card>
      <nldd-container padding="20" gap="12">
        <nldd-title heading-level={2} size={5} text={`Deelniveaus${rows.length > 0 ? ` (${rows.length})` : ''}`}>
          {editing ? (
            <nldd-button
              slot="end"
              size="sm"
              appearance="neutral-transparent"
              start-icon="close"
              text="Annuleer"
              disabled={saving || undefined}
              onClick={() => setEditing(false)}
            ></nldd-button>
          ) : (
            canEdit && (
              <nldd-button
                slot="end"
                size="sm"
                appearance="neutral-transparent"
                start-icon="pencil"
                text="Pas aan"
                onClick={startEditing}
              ></nldd-button>
            )
          )}
        </nldd-title>

        {editing ? (
          <nldd-container layout="stack" gap="12">
            <VisibilityPicker idPrefix="edit-vis" value={draftLevels} onChange={setDraftLevels} />
            <nldd-text size="xs" color="secondary">
              Nieuw aangevinkte niveaus volgen de gebruikelijke route: de afdeling is direct
              beschikbaar, het ministerie en Rijksoverheid wachten op goedkeuring. Een niveau dat
              je uitvinkt, wordt weer ingetrokken.
            </nldd-text>
            <nldd-button-group>
              <nldd-button
                appearance="primary"
                start-icon="save"
                text="Bewaar"
                loading={saving || undefined}
                loading-text="Aan het bewaren"
                onClick={saveLevels}
              ></nldd-button>
            </nldd-button-group>
          </nldd-container>
        ) : rows.length === 0 ? (
          <nldd-text size="sm" color="secondary">
            Deze prompt is privé; er zijn geen deelniveaus.
            {canEdit && ' Kies “Pas aan” om hem met je afdeling of ministerie te delen.'}
          </nldd-text>
        ) : (
          <nldd-container layout="stack" gap="12">
            {rows.map((row) => {
              const meta = visibilityMeta(row.level);
              const statusMeta = VISIBILITY_STATUS_META[row.status];
              return (
                <nldd-box key={row.id}>
                  <nldd-container padding="12" gap="8">
                    <nldd-title
                      heading-level={3}
                      size={6}
                      text={meta?.label ?? row.level}
                      supporting-text={meta?.description}
                    >
                      <nldd-badge slot="end" color={STATUS_COLOR[row.status]} text={statusMeta.label}></nldd-badge>
                    </nldd-title>
                    {row.status === 'pending' && (
                      <Decision
                        note={notes[row.id] ?? ''}
                        onNote={(value) => setNotes((n) => ({ ...n, [row.id]: value }))}
                        busy={busyId === row.id}
                        onDecide={(decision) => decide(row, decision)}
                      />
                    )}
                  </nldd-container>
                </nldd-box>
              );
            })}
          </nldd-container>
        )}
      </nldd-container>
    </nldd-card>
  );
}

/** The note and the two buttons for a level that waits for a decision. */
function Decision({
  note,
  onNote,
  busy,
  onDecide,
}: {
  note: string;
  onNote: (value: string) => void;
  busy: boolean;
  onDecide: (decision: 'approved' | 'rejected') => void;
}) {
  const noteRef = useRef<HTMLElement & { value?: string }>(null);
  useNlddValue(noteRef, note, onNote);
  return (
    <nldd-container layout="stack" gap="8">
      <nldd-form-field label="Opmerking bij je beslissing" optional>
        <nldd-multi-line-text-field ref={noteRef} rows={2}></nldd-multi-line-text-field>
      </nldd-form-field>
      <nldd-button-group>
        <nldd-button
          appearance="critical-tinted"
          start-icon="close"
          text="Wijs af"
          disabled={busy || undefined}
          onClick={() => onDecide('rejected')}
        ></nldd-button>
        <nldd-button
          appearance="primary"
          start-icon="check-mark"
          text="Keur goed"
          disabled={busy || undefined}
          onClick={() => onDecide('approved')}
        ></nldd-button>
      </nldd-button-group>
    </nldd-container>
  );
}
