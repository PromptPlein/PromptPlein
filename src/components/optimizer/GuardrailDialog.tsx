import { useRef } from 'react';
import { useNlddEvent } from '@/lib/nldd';
import type { GuardrailFinding } from '@/services/guardrails';
import '@nldd/design-system/button';
import '@nldd/design-system/container';
import '@nldd/design-system/modal-dialog';
import '@nldd/design-system/text';

interface GuardrailDialogProps {
  findings: GuardrailFinding[];
  piiWarning: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** Wat er na bevestiging gebeurt; standaard genereren, in de chat versturen. */
  action?: 'genereren' | 'versturen';
}

/**
 * Asks before sending text with personal data or a forbidden topic. Closing the
 * dialog (Escape) counts as going back; only the second button goes on.
 */
export default function GuardrailDialog({
  findings,
  piiWarning,
  onConfirm,
  onCancel,
  action = 'genereren',
}: GuardrailDialogProps) {
  const pii = findings.filter((f) => f.kind === 'pii');
  const topics = findings.filter((f) => f.kind === 'topic');
  const ref = useRef<HTMLElement>(null);
  const decided = useRef(false);
  useNlddEvent(ref, 'close', () => {
    if (decided.current) return;
    decided.current = true;
    onCancel();
  });

  function decide(fn: () => void) {
    if (decided.current) return;
    decided.current = true;
    fn();
  }

  return (
    <nldd-modal-dialog
      ref={ref}
      open
      variant="alert"
      icon="shield"
      text={`Controle vóór ${action}`}
      horizontal-alignment="left"
    >
      <nldd-container gap="12">
        {pii.length > 0 && (
          <>
            <nldd-text size="sm">{piiWarning}</nldd-text>
            <nldd-text size="sm">
              Gevonden: <strong>{pii.map((f) => f.label).join(', ')}</strong>
            </nldd-text>
          </>
        )}
        {topics.length > 0 && (
          <nldd-text size="sm">
            Je prompt bevat mogelijk een verboden onderwerp: <strong>{topics.map((f) => f.label).join(', ')}</strong>.
          </nldd-text>
        )}
        <nldd-text size="sm" color="secondary">
          Wil je toch doorgaan met {action}?
        </nldd-text>
      </nldd-container>
      <nldd-button
        slot="actions"
        appearance="primary"
        text={action === 'versturen' ? 'Terug, ik pas het bericht aan' : 'Terug, ik pas de prompt aan'}
        onClick={() => decide(onCancel)}
      ></nldd-button>
      <nldd-button
        slot="actions"
        appearance="secondary"
        text="Ik begrijp het, ga door"
        onClick={() => decide(onConfirm)}
      ></nldd-button>
    </nldd-modal-dialog>
  );
}
