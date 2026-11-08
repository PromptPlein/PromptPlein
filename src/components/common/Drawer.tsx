import { useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNlddEvent } from '@/lib/nldd';

type SheetElement = HTMLElement & { show?: () => void };

/**
 * A panel that slides in from the left, for what sits beside the content as a
 * sidebar on a large screen. An nldd-sheet at the document root: it closes with
 * its dismiss button, Escape and a tap beside it. The content mounts while the
 * sheet is open and unmounts once it has closed.
 */
export default function Drawer({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const ref = useRef<SheetElement>(null);
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
    <nldd-sheet ref={ref} open={open || undefined} placement="left" width="22rem">
      <nldd-page>
        <nldd-top-title-bar slot="header" text={title} heading-level={2} dismiss-text="Sluiten"></nldd-top-title-bar>
        {mounted && children}
      </nldd-page>
    </nldd-sheet>,
    document.body,
  );
}
