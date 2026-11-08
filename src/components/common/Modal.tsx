import { useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNlddEvent } from '@/lib/nldd';
import '@nldd/design-system/page';
import '@nldd/design-system/sheet';
import '@nldd/design-system/simple-section';
import '@nldd/design-system/title';
import '@nldd/design-system/top-title-bar';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Width as a Tailwind max-width name, e.g. 'max-w-2xl'. Mapped to the sheet width. */
  size?: string;
}

const WIDTHS: Record<string, string> = {
  'max-w-sm': '24rem',
  'max-w-md': '28rem',
  'max-w-lg': '32rem',
  'max-w-xl': '36rem',
  'max-w-2xl': '42rem',
  'max-w-3xl': '48rem',
  'max-w-4xl': '56rem',
  'max-w-5xl': '64rem',
};

type SheetElement = HTMLElement & { show?: () => void };

/**
 * A window for work: an nldd-sheet with a title bar, rendered at the document
 * root. The sheet stays mounted so it animates; its content mounts when it opens
 * and unmounts once it has closed, so every opening starts fresh as before.
 *
 * The sheet closes with its dismiss button, Escape and a click on the backdrop.
 * When the parent keeps `open` after `onClose` (to ask first, for instance), the
 * sheet opens again.
 */
export default function Modal({ open, onClose, title, children, size = 'max-w-2xl' }: ModalProps) {
  const ref = useRef<SheetElement>(null);
  const headingId = `modal-${useId().replace(/:/g, '')}`;
  const openRef = useRef(open);
  openRef.current = open;
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);

  useNlddEvent(ref, 'close', () => {
    if (openRef.current) onClose();
    window.setTimeout(() => {
      if (openRef.current) ref.current?.show?.();
      else setMounted(false);
    }, 0);
  });

  return createPortal(
    <nldd-sheet ref={ref} open={open || undefined} width={WIDTHS[size] ?? '42rem'}>
      <nldd-page>
        <nldd-top-title-bar
          slot="header"
          text={title}
          heading-level={2}
          dismiss-text="Sluiten"
          collapse-anchor={headingId}
        ></nldd-top-title-bar>
        <nldd-simple-section>
          <nldd-title id={headingId} slot="header" size={3} heading-level={2} text={title}></nldd-title>
          {mounted && children}
        </nldd-simple-section>
      </nldd-page>
    </nldd-sheet>,
    document.body,
  );
}
