import { useState } from 'react';
import { Globe } from '@/components/common/icons';
import clsx from 'clsx';
import ConfirmDialog from './ConfirmDialog';
import MenuSwitchRow from './MenuSwitchRow';

interface WebSearchToggleProps {
  /** Staat zoeken op internet aan? */
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  /** Extra klassen, zodat de knop in de werkbalk past waar hij staat. */
  className?: string;
  /** 'menu' is een regel in het plusmenu van de chat, met dezelfde bevestiging. */
  variant?: 'bar' | 'menu';
}

/**
 * De knop "Internet": de AI zoekt eerst op internet en beantwoordt de vraag met
 * wat hij vindt, met de bronnen erbij.
 *
 * Dezelfde vorm als {@link ThinkingToggle} ernaast, want het is dezelfde soort
 * keuze: je levert wachttijd in voor een beter antwoord.
 *
 * Aanzetten vraagt eerst om een bevestiging, en die gaat over privacy. De
 * zoekvraag verlaat PromptPlein: zolang er geen eigen SearXNG-server staat,
 * gaat hij naar Tavily, een Amerikaans bedrijf dat de vragen bewaart. Wie de
 * knop aanzet, moet dat gelezen hebben vóórdat de eerste vraag vertrekt.
 * Uitzetten kan meteen.
 */
export default function WebSearchToggle({
  value,
  onChange,
  disabled = false,
  className,
  variant = 'bar',
}: WebSearchToggleProps) {
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      {variant === 'menu' ? (
        <MenuSwitchRow
          icon={Globe}
          label="Internet"
          hint="Zoek actuele bronnen"
          on={value}
          disabled={disabled}
          onClick={() => (value ? onChange(false) : setConfirming(true))}
        />
      ) : (
        <button
          type="button"
          className={clsx(
            'flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2 transition-colors focus:outline-none focus:ring-2 focus:ring-rijksblauw-500/40 disabled:cursor-not-allowed disabled:opacity-40',
            value
              ? 'bg-rijksblauw-50 text-rijksblauw-700 hover:bg-rijksblauw-100 dark:bg-rijksblauw-500/15 dark:text-rijksblauw-200'
              : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200',
            className,
          )}
          onClick={() => (value ? onChange(false) : setConfirming(true))}
          disabled={disabled}
          title={
            value
              ? 'Internet staat aan: je vraag gaat naar een externe zoekdienst en de AI antwoordt met wat hij vindt, met de bronnen erbij. Zet geen vertrouwelijke informatie in je vraag.'
              : 'Laat de AI eerst op internet zoeken. Handig bij iets actueels of iets wat de AI zelf niet kan weten; je vraag gaat dan wel naar een externe zoekdienst.'
          }
          aria-pressed={value}
          aria-label="Zoeken op internet aan of uit"
        >
          <Globe size={16} className="shrink-0" />
          <span className="text-xs font-medium">Internet</span>
        </button>
      )}

      <ConfirmDialog
        open={confirming}
        title="Zoeken op internet aanzetten?"
        warning
        message={
          <>
            <p>
              Met zoeken aan gaat je vraag naar een externe zoekdienst. PromptPlein gebruikt daarvoor
              Tavily, een Amerikaans bedrijf. Je zoekvraag en de gevonden resultaten worden daar
              verwerkt en bewaard, buiten de Europese Unie en buiten het beheer van de rijksoverheid.
            </p>
            <p>
              Zet daarom geen persoonsgegevens, vertrouwelijke informatie of niet-openbare
              beleidsinformatie in een vraag terwijl zoeken aanstaat. Gebruik deze functie alleen
              voor vragen over openbare informatie.
            </p>
          </>
        }
        confirmLabel="Ik begrijp het, zoeken aanzetten"
        cancelLabel="Niet aanzetten"
        onConfirm={() => onChange(true)}
        onClose={() => setConfirming(false)}
      />
    </>
  );
}
