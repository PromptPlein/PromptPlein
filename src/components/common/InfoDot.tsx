import { useEffect, useRef, useState } from 'react';
import { useNlddEvent } from '@/lib/nldd';

/**
 * The info dot: a small round button that shows one short explanation, so a
 * screen stays calm while the explanation is there for whoever looks for it.
 *
 * The explanation is an nldd-tooltip: it shows on hover and keyboard focus. A
 * click pins it, so it also works on a touch screen; another click, Escape or a
 * click beside it lets go again.
 */
export default function InfoDot({
  label,
  text,
}: {
  /** What the button explains, for screen readers. E.g. "Uitleg over categorieën". */
  label: string;
  /** The explanation itself: short, two sentences at most. */
  text: string;
  /** Ignored: the design system sets the look. Kept so existing callers compile. */
  className?: string;
}) {
  const [pinned, setPinned] = useState(false);
  const tipRef = useRef<HTMLElement>(null);
  const buttonRef = useRef<HTMLElement>(null);
  useNlddEvent(tipRef, 'nldd-tooltip-dismiss', () => setPinned(false));

  useEffect(() => {
    if (!pinned) return;
    function onPointer(e: PointerEvent) {
      if (buttonRef.current?.contains(e.target as Node)) return;
      setPinned(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setPinned(false);
    }
    const onScroll = () => setPinned(false);
    window.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [pinned]);

  return (
    <nldd-tooltip ref={tipRef} text={text} open={pinned || undefined} timing="instant">
      <nldd-icon-button
        ref={buttonRef}
        icon="info-circle"
        appearance="neutral-transparent"
        size="xs"
        accessible-label={label}
        tooltip-timing="never"
        expanded={pinned || undefined}
        onClick={(e) => {
          // The dot also sits on clickable cards: the click is for the
          // explanation and must not open the card underneath.
          e.preventDefault();
          e.stopPropagation();
          setPinned((v) => !v);
        }}
      ></nldd-icon-button>
    </nldd-tooltip>
  );
}
