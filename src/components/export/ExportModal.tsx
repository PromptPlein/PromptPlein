import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { notify } from '@/lib/notify';
import { useNlddEvent } from '@/lib/nldd';
import { exportPrompt, type ExportFormat, type ExportMeta } from '@/services/exportService';
import type { Prompt } from '@/types';
import '@nldd/design-system/icon-cell';
import '@nldd/design-system/list';
import '@nldd/design-system/list-item';
import '@nldd/design-system/page';
import '@nldd/design-system/sheet';
import '@nldd/design-system/simple-section';
import '@nldd/design-system/spacer';
import '@nldd/design-system/spacer-cell';
import '@nldd/design-system/text';
import '@nldd/design-system/text-cell';
import '@nldd/design-system/top-title-bar';

const FORMATS: {
  id: ExportFormat;
  label: string;
  hint: string;
  icon: string;
}[] = [
  { id: 'pdf', label: 'PDF', hint: 'Opent printvenster; opslaan als PDF', icon: 'file-pdf' },
  { id: 'word', label: 'Word (.doc)', hint: 'Opent in Microsoft Word', icon: 'file-text' },
  { id: 'html', label: 'HTML', hint: 'Opgemaakt webdocument', icon: 'code' },
  { id: 'markdown', label: 'Markdown', hint: 'Platte tekst met opmaak', icon: 'file-markdown' },
  { id: 'json', label: 'JSON', hint: 'Ruwe gegevens', icon: 'code-block' },
];

const TITLE = 'Exporteren';

/** A sheet that exports one prompt in the format the user picks. */
export default function ExportModal({
  open,
  onClose,
  prompt,
  meta,
}: {
  open: boolean;
  onClose: () => void;
  prompt: Prompt;
  meta?: ExportMeta;
}) {
  const sheetRef = useRef<HTMLElement>(null);
  useNlddEvent(sheetRef, 'close', () => {
    if (open) onClose();
  });

  function handle(format: ExportFormat) {
    try {
      exportPrompt(prompt, format, meta);
      if (format !== 'pdf') notify.success('Export gestart');
      onClose();
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Export mislukt');
    }
  }

  return createPortal(
    <nldd-sheet ref={sheetRef} open={open || undefined} placement="right" width="480px">
      <nldd-page landmarks="region" accessible-label={TITLE}>
        <nldd-top-title-bar slot="header" text={TITLE} heading-level={2} dismiss-text="Sluit"></nldd-top-title-bar>
        <nldd-simple-section>
          <nldd-text color="secondary">
            Kies een formaat. Het document krijgt een overheidsconforme kop met rubricering.
          </nldd-text>
          <nldd-spacer size="16"></nldd-spacer>
          <nldd-list appearance="box-base" accessible-label="Formaten">
            {FORMATS.map(({ id, label, hint, icon }) => (
              <nldd-list-item key={id} button onClick={() => handle(id)}>
                <nldd-icon-cell icon={icon} size="24" color="accent"></nldd-icon-cell>
                <nldd-spacer-cell size="12"></nldd-spacer-cell>
                <nldd-text-cell text={label} supporting-text={hint}></nldd-text-cell>
              </nldd-list-item>
            ))}
          </nldd-list>
        </nldd-simple-section>
      </nldd-page>
    </nldd-sheet>,
    document.body,
  );
}
