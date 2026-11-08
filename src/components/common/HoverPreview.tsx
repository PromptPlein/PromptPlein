import type { ReactNode } from 'react';

/**
 * Shows the full text behind a compact card on hover or keyboard focus: the
 * example prompt or goal description that does not fit on the card itself. An
 * nldd-tooltip, so it follows the design system and dark mode, and a screen
 * reader hears it as the description of the card.
 */
export default function HoverPreview({
  label,
  text,
  children,
}: {
  /** Heading above the text, e.g. "Voorbeeldprompt". */
  label: string;
  /** The full text. */
  text: string;
  children: ReactNode;
  /** Ignored: the design system sets the look. Kept so existing callers compile. */
  className?: string;
}) {
  return (
    <nldd-tooltip text={`${label}: ${text}`} placement="top">
      {children}
    </nldd-tooltip>
  );
}
