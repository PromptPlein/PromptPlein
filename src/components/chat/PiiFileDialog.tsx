import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNlddEvent } from '@/lib/nldd';
import type { PiiCount } from '@/services/guardrails';

export type PiiFileChoice = 'redact' | 'keep' | 'skip';

/**
 * Vraagt vóór het toevoegen van een bronbestand wat er met gevonden
 * persoonsgegevens moet gebeuren. Vervangen gebeurt in de browser, dus de
 * oorspronkelijke gegevens komen niet in de database en niet bij Mistral.
 *
 * The parent mounts this only while a choice is pending, so the dialog is open
 * from its first render. Escape or the backdrop counts as "Niet toevoegen".
 */
export default function PiiFileDialog({
  fileName,
  found,
  onChoose,
}: {
  fileName: string;
  found: PiiCount[];
  onChoose: (choice: PiiFileChoice) => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const chosen = useRef(false);
  const choose = (choice: PiiFileChoice) => {
    if (chosen.current) return;
    chosen.current = true;
    onChoose(choice);
  };
  useNlddEvent(ref, 'close', () => choose('skip'));

  return createPortal(
    <nldd-modal-dialog
      ref={ref}
      open
      icon="shield"
      text="Persoonsgegevens gevonden"
      horizontal-alignment="left"
    >
      <nldd-container gap="12">
        <nldd-text>
          In <strong>{fileName}</strong> staat mogelijk:
        </nldd-text>
        <nldd-container gap="2">
          {found.map((f) => (
            <nldd-text key={f.label} weight="medium">
              {f.label} ({f.count.toLocaleString('nl-NL')})
            </nldd-text>
          ))}
        </nldd-container>
        <nldd-text>
          Vervang je ze, dan staat er bijvoorbeeld [BSN] of [naam] in de tekst. Dat gebeurt op dit
          apparaat, voordat er iets wordt verstuurd.
        </nldd-text>
        <nldd-text color="secondary">Een naam zonder aanhef of veldnaam vindt deze controle niet.</nldd-text>
      </nldd-container>
      <nldd-button slot="actions" appearance="primary" text="Vervangen en toevoegen" onClick={() => choose('redact')}></nldd-button>
      <nldd-button slot="actions" appearance="secondary" text="Toevoegen zoals het is" onClick={() => choose('keep')}></nldd-button>
      <nldd-button slot="actions" appearance="secondary" text="Niet toevoegen" onClick={() => choose('skip')}></nldd-button>
    </nldd-modal-dialog>,
    document.body,
  );
}
