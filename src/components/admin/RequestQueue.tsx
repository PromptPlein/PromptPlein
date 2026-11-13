import { formatDate } from '@/lib/utils';
import { BoundMultiLine } from '@/components/admin/AdminFields';
import '@nldd/design-system/activity-indicator';
import '@nldd/design-system/button';
import '@nldd/design-system/button-group';
import '@nldd/design-system/card';
import '@nldd/design-system/container';
import '@nldd/design-system/form-field';
import '@nldd/design-system/icon';
import '@nldd/design-system/inline-dialog';
import '@nldd/design-system/text';
import '@nldd/design-system/title';

interface QueueRequest {
  id: string;
  name: string;
  motivation?: string | null;
  created_at: string;
  requester?: { full_name?: string | null; email?: string | null } | null;
}

interface RequestQueueProps<R extends QueueRequest> {
  title: string;
  /** Icon in front of the name of each request. */
  icon: string;
  requests: R[];
  loading: boolean;
  notes: Record<string, string>;
  onNote: (id: string, note: string) => void;
  busyId: string | null;
  onApprove: (req: R) => void;
  onReject: (req: R) => void;
}

/** The page of a queue of requests for a new category or function, with a decision per request. */
export default function RequestQueue<R extends QueueRequest>({
  title,
  icon,
  requests,
  loading,
  notes,
  onNote,
  busyId,
  onApprove,
  onReject,
}: RequestQueueProps<R>) {
  return (
    <nldd-container layout="stack" gap="24">
      <nldd-title
        heading-level={1}
        size={3}
        text={title}
        supporting-text={`${requests.length} ${requests.length === 1 ? 'aanvraag wacht' : 'aanvragen wachten'} op beoordeling`}
      ></nldd-title>

      {loading ? (
        <nldd-container min-height="10rem">
          <nldd-activity-indicator></nldd-activity-indicator>
        </nldd-container>
      ) : requests.length === 0 ? (
        <nldd-card>
          <nldd-container padding="32">
            <nldd-inline-dialog icon="inbox" text="Geen openstaande aanvragen."></nldd-inline-dialog>
          </nldd-container>
        </nldd-card>
      ) : (
        <nldd-container layout="stack" gap="16">
          {requests.map((req) => (
            <nldd-card key={req.id}>
              <nldd-container padding="20" sm-padding="16" layout="stack" gap="12">
                <nldd-container layout="row" gap="12" vertical-alignment="top">
                  <nldd-icon icon={icon} size="24" color="accent"></nldd-icon>
                  <nldd-container layout="stack" gap="4">
                    <nldd-title heading-level={2} size={5} text={req.name}></nldd-title>
                    {req.motivation && <nldd-text size="sm">{req.motivation}</nldd-text>}
                    <nldd-text size="xs" color="secondary">
                      Aangevraagd {formatDate(req.created_at)} · door{' '}
                      {req.requester?.full_name || req.requester?.email || 'onbekend'}
                    </nldd-text>
                  </nldd-container>
                </nldd-container>

                <nldd-form-field label="Opmerking bij je beslissing" optional>
                  <BoundMultiLine
                    rows={2}
                    value={notes[req.id] ?? ''}
                    onValue={(note) => onNote(req.id, note)}
                  ></BoundMultiLine>
                </nldd-form-field>

                <nldd-button-group>
                    <nldd-button
                      appearance="critical-tinted"
                      start-icon="dismiss"
                      text="Wijs af"
                      loading={busyId === req.id || undefined}
                      onClick={() => onReject(req)}
                    ></nldd-button>
                    <nldd-button
                      appearance="primary"
                      start-icon="check-mark"
                      text="Keur goed en voeg toe"
                      loading={busyId === req.id || undefined}
                      onClick={() => onApprove(req)}
                    ></nldd-button>
                </nldd-button-group>
              </nldd-container>
            </nldd-card>
          ))}
        </nldd-container>
      )}
    </nldd-container>
  );
}
