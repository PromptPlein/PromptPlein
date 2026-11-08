import { useRef, useState } from 'react';
import { useNlddEvent } from '@/lib/nldd';
import ConfirmDialog from './ConfirmDialog';
import MenuSwitchRow from './MenuSwitchRow';

interface WebSearchToggleProps {
  /** Staat zoeken op internet aan? */
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  /** Ignored: the design system sets the look. Kept so existing callers compile. */
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
  variant = 'bar',
}: WebSearchToggleProps) {
  const [confirming, setConfirming] = useState(false);
  const toggleRef = useRef<HTMLElement & { selected?: boolean }>(null);
  const valueRef = useRef(value);
  valueRef.current = value;
  // The toggle flips itself on a click; the state belongs to the parent, and
  // turning it on waits for the confirmation.
  useNlddEvent(toggleRef, 'change', () => {
    if (toggleRef.current) toggleRef.current.selected = valueRef.current;
    if (valueRef.current) onChange(false);
    else setConfirming(true);
  });
  return (
    <>
      {variant === 'menu' ? (
        <MenuSwitchRow
          icon="globe"
          label="Internet"
          on={value}
          disabled={disabled}
          onClick={() => (value ? onChange(false) : setConfirming(true))}
        />
      ) : (
        <nldd-tooltip
          text={
            value
              ? 'Internet staat aan: je vraag gaat naar een externe zoekdienst en de AI antwoordt met wat hij vindt, met de bronnen erbij. Zet geen vertrouwelijke informatie in je vraag.'
              : 'Laat de AI eerst op internet zoeken. Handig bij iets actueels of iets wat de AI zelf niet kan weten; je vraag gaat dan wel naar een externe zoekdienst.'
          }
        >
          <nldd-toggle-button
            ref={toggleRef}
            appearance="neutral-transparent"
            size="sm"
            icon="globe"
            text="Internet"
            accessible-label="Zoeken op internet"
            selected={value || undefined}
            disabled={disabled || undefined}
          ></nldd-toggle-button>
        </nldd-tooltip>
      )}

      <ConfirmDialog
        open={confirming}
        title="Zoeken op internet aanzetten?"
        warning
        message={
          <>
            <nldd-text>
              Met zoeken aan gaat je vraag naar een externe zoekdienst. PromptPlein gebruikt daarvoor
              Tavily, een Amerikaans bedrijf. Je zoekvraag en de gevonden resultaten worden daar
              verwerkt en bewaard, buiten de Europese Unie en buiten het beheer van de rijksoverheid.
            </nldd-text>
            <nldd-text>
              Zet daarom geen persoonsgegevens, vertrouwelijke informatie of niet-openbare
              beleidsinformatie in een vraag terwijl zoeken aanstaat. Gebruik deze functie alleen
              voor vragen over openbare informatie.
            </nldd-text>
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
