import { useRef, useState } from 'react';
import { useNlddEvent } from '@/lib/nldd';
import ConfirmDialog from './ConfirmDialog';
import MenuSwitchRow from './MenuSwitchRow';
import '@nldd/design-system/text';
import '@nldd/design-system/toggle-button';
import '@nldd/design-system/tooltip';

interface ThinkingToggleProps {
  /** Staat denken aan? */
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  /**
   * Staat er iets, dan kan het ingestelde model niet denken en is de knop uit:
   * grijs, niet aan te zetten, en deze tekst als uitleg in de tooltip. Een
   * eerder aangezette stand wordt dan ook niet als aan getoond.
   */
  unavailableReason?: string;
  /** Ignored: the design system sets the look. Kept so existing callers compile. */
  className?: string;
  /** 'menu' is een regel in het plusmenu van de chat, met dezelfde bevestiging. */
  variant?: 'bar' | 'menu';
}

/**
 * De knop "Denken": laat het model eerst redeneren en pas daarna antwoorden.
 *
 * Staat zowel in de invoerbalk van de chat als boven de bouwer, en is bewust
 * één component: de uitleg in de tooltip en in de bevestiging is de enige plek
 * waar staat wat de knop kost en wat hij oplevert, en die tekst hoort op beide
 * plekken hetzelfde te zijn.
 *
 * Aanzetten vraagt eerst om een bevestiging. Denken klinkt als "altijd beter",
 * maar dat is het niet: bij een eenvoudige vraag gaat het model overdenken en
 * wordt het antwoord er slechter en trager van. Wie de knop aanzet, moet dat
 * één keer gelezen hebben. Uitzetten kan meteen, daar hoeft niemand voor
 * gewaarschuwd te worden.
 */
export default function ThinkingToggle({
  value,
  onChange,
  disabled = false,
  unavailableReason,
  variant = 'bar',
}: ThinkingToggleProps) {
  const [confirming, setConfirming] = useState(false);
  const unavailable = Boolean(unavailableReason);
  const on = value && !unavailable;
  const toggleRef = useRef<HTMLElement & { selected?: boolean }>(null);
  const onRef = useRef(on);
  onRef.current = on;
  // The toggle flips itself on a click; the state belongs to the parent, and
  // turning it on waits for the confirmation.
  useNlddEvent(toggleRef, 'change', () => {
    if (toggleRef.current) toggleRef.current.selected = onRef.current;
    if (onRef.current) onChange(false);
    else setConfirming(true);
  });
  return (
    <>
      {variant === 'menu' ? (
        <MenuSwitchRow
          icon="brain"
          label="Denken"
          on={on}
          disabled={disabled || unavailable}
          onClick={() => (on ? onChange(false) : setConfirming(true))}
        />
      ) : (
        <nldd-tooltip
          text={
            unavailable
              ? unavailableReason
              : on
              ? 'Denken staat aan: het model redeneert eerst en schrijft daarna. Dat levert bij een complexe vraag een beter antwoord op, maar je wacht langer op de eerste regel.'
              : 'Laat het model eerst nadenken voordat het schrijft. Alleen nuttig bij een complexe vraag; bij een eenvoudige vraag werkt het averechts.'
          }
        >
          <nldd-toggle-button
            ref={toggleRef}
            appearance="neutral-transparent"
            size="sm"
            icon="brain"
            text="Denken"
            accessible-label="Denken"
            selected={on || undefined}
            disabled={disabled || unavailable || undefined}
          ></nldd-toggle-button>
        </nldd-tooltip>
      )}

      <ConfirmDialog
        open={confirming}
        title="Denken aanzetten?"
        warning
        message={
          <>
            <nldd-text>
              Met denken aan redeneert het model eerst en schrijft het daarna pas. Bij een complexe
              vraag, zoals een afweging met meerdere belangen of een redenering in stappen, levert
              dat een beter antwoord op.
            </nldd-text>
            <nldd-text>
              Bij een eenvoudige vraag werkt denken vaak averechts: het model gaat dan overdenken,
              en het antwoord wordt er slechter en trager van. Gebruik denken daarom alleen bij
              complexe vragen.
            </nldd-text>
          </>
        }
        confirmLabel="Denken aanzetten"
        cancelLabel="Niet aanzetten"
        onConfirm={() => onChange(true)}
        onClose={() => setConfirming(false)}
      />
    </>
  );
}
