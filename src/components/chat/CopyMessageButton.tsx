import { useEffect, useState } from 'react';
import { copyToClipboard } from '@/lib/utils';

interface CopyMessageButtonProps {
  /** De tekst die naar het klembord gaat. */
  text: string;
  /** Opschrift naast het icoon; leeg = alleen het icoon (met aria-label). */
  label?: string;
  /** Kept for callers that still pass it; the design system sets the look. */
  className?: string;
}

/**
 * Kopieerknop voor één chatbericht. Bevestigt in de knop zelf ("Gekopieerd")
 * in plaats van met een melding: je kopieert hier vaak meerdere berichten achter
 * elkaar, en dan is een stapel meldingen meer ruis dan bevestiging.
 */
export default function CopyMessageButton({ text, label = 'Kopiëren' }: CopyMessageButtonProps) {
  const [copied, setCopied] = useState(false);

  // Bevestiging vanzelf laten vervallen; opruimen zodat een bericht dat
  // tussentijds verdwijnt geen timer laat staan.
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(timer);
  }, [copied]);

  async function handleCopy() {
    try {
      await copyToClipboard(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  const icon = copied ? 'check-mark' : 'copy';

  // Zonder opschrift blijft alleen het icoon over; de naam staat dan in `text`.
  if (!label) {
    return (
      <nldd-icon-button
        size="xs"
        appearance="neutral-transparent"
        icon={icon}
        text={copied ? 'Gekopieerd' : 'Bericht kopiëren'}
        onClick={() => void handleCopy()}
      ></nldd-icon-button>
    );
  }

  return (
    <nldd-button
      size="xs"
      appearance="neutral-transparent"
      start-icon={icon}
      text={copied ? 'Gekopieerd' : label}
      onClick={() => void handleCopy()}
    ></nldd-button>
  );
}
