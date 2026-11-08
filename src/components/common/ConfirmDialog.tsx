import { useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNlddEvent } from '@/lib/nldd';
import '@nldd/design-system/button';
import '@nldd/design-system/container';
import '@nldd/design-system/modal-dialog';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** One sentence, or several paragraphs as a ReactNode. */
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** The action cannot be undone (delete): the way out becomes the primary button. */
  destructive?: boolean;
  /**
   * The action can be undone, but the user has to know something before turning
   * it on (privacy, quality). Shows a warning icon.
   */
  warning?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/** A decision in an nldd-modal-dialog at the document root. */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Bevestigen',
  cancelLabel = 'Annuleren',
  destructive = false,
  warning = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const ref = useRef<HTMLElement>(null);
  const openRef = useRef(open);
  openRef.current = open;
  useNlddEvent(ref, 'close', () => {
    if (openRef.current) onClose();
  });

  const confirm = () => {
    onConfirm();
    onClose();
  };
  const isText = typeof message === 'string';

  return createPortal(
    <nldd-modal-dialog
      ref={ref}
      open={open || undefined}
      text={title}
      supporting-text={isText ? message : undefined}
      variant={destructive ? 'alert' : undefined}
      icon={warning && !destructive ? 'warning' : undefined}
      horizontal-alignment="left"
    >
      {!isText && <nldd-container gap="12">{message}</nldd-container>}
      {destructive ? (
        <>
          <nldd-button slot="actions" appearance="primary" text={cancelLabel} onClick={onClose}></nldd-button>
          <nldd-button slot="actions" appearance="destructive" text={confirmLabel} onClick={confirm}></nldd-button>
        </>
      ) : (
        <>
          <nldd-button slot="actions" appearance="primary" text={confirmLabel} onClick={confirm}></nldd-button>
          <nldd-button slot="actions" appearance="secondary" text={cancelLabel} onClick={onClose}></nldd-button>
        </>
      )}
    </nldd-modal-dialog>,
    document.body,
  );
}
