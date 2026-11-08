import { useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNlddEvent } from '@/lib/nldd';

interface AdminSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Width of the side sheet from md up, as a CSS length. */
  width?: string;
}

/**
 * The work panel of the admin pages: an nldd-sheet at the document root with a
 * title bar that closes it. It stays mounted, so its fields keep their state
 * and the sheet animates in and out; `open` drives it.
 */
export default function AdminSheet({ open, onClose, title, children, width = '560px' }: AdminSheetProps) {
  const ref = useRef<HTMLElement>(null);
  useNlddEvent(ref, 'close', () => {
    if (open) onClose();
  });
  return createPortal(
    <nldd-sheet ref={ref} open={open || undefined} placement="right" width={width} accessible-label={title}>
      <nldd-page landmarks="region" accessible-label={title}>
        <nldd-top-title-bar slot="header" text={title} heading-level={2} dismiss-text="Sluit"></nldd-top-title-bar>
        <nldd-simple-section>{children}</nldd-simple-section>
      </nldd-page>
    </nldd-sheet>,
    document.body,
  );
}
