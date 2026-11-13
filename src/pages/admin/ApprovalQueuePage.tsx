import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { notify } from '@/lib/notify';
import { BoundMultiLine } from '@/components/admin/AdminFields';
import { formatDate, visibilityMeta } from '@/lib/utils';
import { listPendingForModeration, decideVisibility } from '@/services/visibilityService';
import { VISIBILITY_STATUS_META } from '@/services/collaborationService';
import { logAdminAction } from '@/services/adminService';
import type { Prompt, PromptVisibility, VisibilityStatus } from '@/types';
import '@nldd/design-system/activity-indicator';
import '@nldd/design-system/badge';
import '@nldd/design-system/button';
import '@nldd/design-system/button-group';
import '@nldd/design-system/card';
import '@nldd/design-system/code-viewer';
import '@nldd/design-system/container';
import '@nldd/design-system/form-field';
import '@nldd/design-system/inline-dialog';
import '@nldd/design-system/link';
import '@nldd/design-system/simple-section';
import '@nldd/design-system/tag';
import '@nldd/design-system/text';
import '@nldd/design-system/title';

type PendingRow = PromptVisibility & { prompt: Prompt | null };

const STATUS_COLOR: Record<VisibilityStatus, 'success' | 'warning' | 'critical'> = {
  approved: 'success',
  pending: 'warning',
  rejected: 'critical',
};

export default function ApprovalQueuePage() {
  const [rows, setRows] = useState<PendingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const inAdmin = useLocation().pathname.startsWith('/admin');

  async function load() {
    setLoading(true);
    try {
      // RLS levert alleen de pending-niveaus die jíj mag beoordelen
      // (moderator: het ministerie van je tak; beheerder: alles).
      setRows(await listPendingForModeration());
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Laden mislukt');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function handleDecision(row: PendingRow, decision: 'approved' | 'rejected') {
    setBusyId(row.id);
    try {
      await decideVisibility(row.id, decision, notes[row.id]);
      await logAdminAction({
        action: decision === 'approved' ? 'approve_visibility' : 'reject_visibility',
        entity_type: 'prompt_visibility',
        entity_id: row.id,
        changes: { prompt_id: row.prompt_id, level: row.level, note: notes[row.id] || null },
      });
      notify.success(decision === 'approved' ? 'Goedgekeurd' : 'Afgewezen');
      setRows((prev) => prev.filter((x) => x.id !== row.id));
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Beslissing mislukt');
    } finally {
      setBusyId(null);
    }
  }

  const content = (
    <nldd-container layout="stack" gap="24">
      <nldd-title
        heading-level={1}
        size={3}
        text="Goedkeuringen"
        supporting-text={`${rows.length} deelniveau${rows.length === 1 ? '' : 's'} wacht${rows.length === 1 ? '' : 'en'} op jouw beoordeling`}
      ></nldd-title>

      {loading ? (
        <nldd-container min-height="10rem">
          <nldd-activity-indicator></nldd-activity-indicator>
        </nldd-container>
      ) : rows.length === 0 ? (
        <nldd-card>
          <nldd-container padding="32">
            <nldd-inline-dialog icon="inbox" text="Geen openstaande aanvragen. Mooi werk!"></nldd-inline-dialog>
          </nldd-container>
        </nldd-card>
      ) : (
        <nldd-container layout="stack" gap="16">
          {rows.map((row) => {
            const p = row.prompt;
            const meta = visibilityMeta(row.level);
            const statusMeta = VISIBILITY_STATUS_META[row.status];
            return (
              <nldd-card key={row.id}>
                <nldd-container padding="20" sm-padding="16" layout="stack" gap="12">
                  <nldd-title heading-level={2} size={5} text={p?.title ?? 'Onbekende prompt'}>
                    {p && (
                      <nldd-link slot="end" size="sm" href={`/prompt/${p.id}`} end-icon="external-link" text="Bekijk"></nldd-link>
                    )}
                  </nldd-title>
                  <nldd-container layout="wrap" gap="4">
                    <nldd-tag size="sm" color="lintblauw" text={`Niveau: ${meta?.label ?? row.level}`}></nldd-tag>
                    <nldd-badge size="sm" color={STATUS_COLOR[row.status]} text={statusMeta.label}></nldd-badge>
                  </nldd-container>
                  {p?.description && (
                    <nldd-text size="sm" color="secondary">
                      {p.description}
                    </nldd-text>
                  )}
                  <nldd-text size="xs" color="secondary">
                    Aangevraagd {row.created_at ? formatDate(row.created_at) : 'onbekend'} · door {p?.created_by ?? 'onbekend'}
                  </nldd-text>

                  {p?.content && (
                    <nldd-code-viewer wrap no-copy max-height="8rem">
                      {p.content}
                    </nldd-code-viewer>
                  )}

                  <nldd-form-field label="Opmerking" optional>
                    <BoundMultiLine
                      rows={2}
                      value={notes[row.id] ?? ''}
                      onValue={(note) => setNotes((n) => ({ ...n, [row.id]: note }))}
                    ></BoundMultiLine>
                  </nldd-form-field>

                  <nldd-button-group>
                    <nldd-button
                      appearance="critical-tinted"
                      start-icon="dismiss"
                      text="Wijs af"
                      loading={busyId === row.id || undefined}
                      onClick={() => handleDecision(row, 'rejected')}
                    ></nldd-button>
                    <nldd-button
                      appearance="primary"
                      start-icon="check-mark"
                      text="Keur goed"
                      loading={busyId === row.id || undefined}
                      onClick={() => handleDecision(row, 'approved')}
                    ></nldd-button>
                  </nldd-button-group>
                </nldd-container>
              </nldd-card>
            );
          })}
        </nldd-container>
      )}
    </nldd-container>
  );

  // Under /admin the page sits in the admin layout; at /goedkeuringen it is a page of its own.
  return inAdmin ? content : <nldd-simple-section>{content}</nldd-simple-section>;
}
