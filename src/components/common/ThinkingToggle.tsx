import { Brain } from 'lucide-react';
import clsx from 'clsx';

interface ThinkingToggleProps {
  /** Staat denken aan? */
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  /** Extra klassen, zodat de knop in de werkbalk past waar hij staat. */
  className?: string;
}

/**
 * De knop "Denken": laat het model eerst redeneren en pas daarna antwoorden.
 *
 * Staat zowel in de invoerbalk van de chat als boven de bouwer, en is bewust
 * één component: de uitleg in de tooltip is de enige plek waar staat wat de
 * knop kost (langer wachten) en wat hij oplevert, en die tekst hoort op beide
 * plekken hetzelfde te zijn.
 */
export default function ThinkingToggle({
  value,
  onChange,
  disabled = false,
  className,
}: ThinkingToggleProps) {
  return (
    <button
      type="button"
      className={clsx(
        'flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2 transition-colors focus:outline-none focus:ring-2 focus:ring-rijksblauw-500/40 disabled:cursor-not-allowed disabled:opacity-40',
        value
          ? 'bg-rijksblauw-50 text-rijksblauw-700 hover:bg-rijksblauw-100 dark:bg-rijksblauw-500/15 dark:text-rijksblauw-200'
          : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200',
        className,
      )}
      onClick={() => onChange(!value)}
      disabled={disabled}
      title={
        value
          ? 'Denken staat aan: het model redeneert eerst en schrijft daarna. Dat levert bij een lastige vraag een beter antwoord op, maar je wacht langer op de eerste regel.'
          : 'Laat het model eerst nadenken voordat het schrijft. Beter bij een lastige vraag, wel trager.'
      }
      aria-pressed={value}
      aria-label="Denken aan of uit"
    >
      <Brain size={16} className="shrink-0" />
      <span className="text-xs font-medium">Denken</span>
    </button>
  );
}
