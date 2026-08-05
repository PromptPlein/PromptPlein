import { useEffect, useState } from 'react';
import { Check, ClipboardCopy } from 'lucide-react';
import clsx from 'clsx';
import { copyToClipboard } from '@/lib/utils';

interface CopyMessageButtonProps {
  /** De tekst die naar het klembord gaat. */
  text: string;
  /** Opschrift naast het icoon; leeg = alleen het icoon (met aria-label). */
  label?: string;
  className?: string;
}

/**
 * Kopieerknop voor één chatbericht. Bevestigt in de knop zelf ("Gekopieerd")
 * in plaats van met een toast: je kopieert hier vaak meerdere berichten achter
 * elkaar, en dan is een stapel meldingen meer ruis dan bevestiging.
 */
export default function CopyMessageButton({
  text,
  label = 'Kopiëren',
  className,
}: CopyMessageButtonProps) {
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

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      // Zonder opschrift blijft alleen het icoon over; dan moet de naam via aria.
      aria-label={label ? undefined : copied ? 'Gekopieerd' : 'Bericht kopiëren'}
      title={copied ? 'Gekopieerd' : 'Kopieer deze tekst'}
      className={clsx(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium transition-colors',
        copied
          ? 'text-emerald-600 dark:text-emerald-400'
          : 'text-slate-400 hover:bg-slate-100 hover:text-rijksblauw-600 dark:text-slate-500 dark:hover:bg-slate-700 dark:hover:text-rijksblauw-300',
        className,
      )}
    >
      {copied ? <Check size={12} /> : <ClipboardCopy size={12} />}
      {label ? (copied ? 'Gekopieerd' : label) : null}
    </button>
  );
}
