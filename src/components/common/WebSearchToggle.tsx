import { Globe } from 'lucide-react';
import clsx from 'clsx';

interface WebSearchToggleProps {
  /** Staat zoeken op internet aan? */
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  /** Extra klassen, zodat de knop in de werkbalk past waar hij staat. */
  className?: string;
}

/**
 * De knop "Zoeken": de AI zoekt eerst op internet en beantwoordt de vraag met
 * wat hij vindt, met de bronnen erbij.
 *
 * Dezelfde vorm als {@link ThinkingToggle} ernaast, want het is dezelfde soort
 * keuze: je levert wachttijd in voor een beter antwoord. De tooltip is de enige
 * plek waar staat wat de knop kost en wat hij oplevert.
 */
export default function WebSearchToggle({
  value,
  onChange,
  disabled = false,
  className,
}: WebSearchToggleProps) {
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
          ? 'Zoeken staat aan: je vraag gaat naar een zoekmachine en de AI antwoordt met wat hij vindt, met de bronnen erbij. Handig bij iets actueels, wel iets trager.'
          : 'Laat de AI eerst op internet zoeken. Handig bij iets actueels of iets wat de AI zelf niet kan weten; je vraag gaat dan wel naar een zoekmachine.'
      }
      aria-pressed={value}
      aria-label="Zoeken op internet aan of uit"
    >
      <Globe size={16} className="shrink-0" />
      <span className="text-xs font-medium">Zoeken</span>
    </button>
  );
}
