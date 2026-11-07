import { useState } from 'react';
import { Brain } from '@/components/common/icons';
import clsx from 'clsx';
import ConfirmDialog from './ConfirmDialog';
import MenuSwitchRow from './MenuSwitchRow';

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
  /** Extra klassen, zodat de knop in de werkbalk past waar hij staat. */
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
  className,
  variant = 'bar',
}: ThinkingToggleProps) {
  const [confirming, setConfirming] = useState(false);
  const unavailable = Boolean(unavailableReason);
  const on = value && !unavailable;
  return (
    <>
      {variant === 'menu' ? (
        <MenuSwitchRow
          icon={Brain}
          label="Denken"
          hint={unavailableReason ?? 'Bij een complexe vraag'}
          on={on}
          disabled={disabled || unavailable}
          onClick={() => (on ? onChange(false) : setConfirming(true))}
        />
      ) : (
        <button
          type="button"
          className={clsx(
            'flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2 transition-colors focus:outline-none focus:ring-2 focus:ring-rijksblauw-500/40 disabled:cursor-not-allowed disabled:opacity-40',
            on
              ? 'bg-rijksblauw-50 text-rijksblauw-700 hover:bg-rijksblauw-100 dark:bg-rijksblauw-500/15 dark:text-rijksblauw-200'
              : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200',
            className,
          )}
          onClick={() => (on ? onChange(false) : setConfirming(true))}
          disabled={disabled || unavailable}
          title={
            unavailable
              ? unavailableReason
              : on
              ? 'Denken staat aan: het model redeneert eerst en schrijft daarna. Dat levert bij een complexe vraag een beter antwoord op, maar je wacht langer op de eerste regel.'
              : 'Laat het model eerst nadenken voordat het schrijft. Alleen nuttig bij een complexe vraag; bij een eenvoudige vraag werkt het averechts.'
          }
          aria-pressed={on}
          aria-label="Denken aan of uit"
        >
          <Brain size={16} className="shrink-0" />
          <span className="text-xs font-medium">Denken</span>
        </button>
      )}

      <ConfirmDialog
        open={confirming}
        title="Denken aanzetten?"
        warning
        message={
          <>
            <p>
              Met denken aan redeneert het model eerst en schrijft het daarna pas. Bij een complexe
              vraag, zoals een afweging met meerdere belangen of een redenering in stappen, levert
              dat een beter antwoord op.
            </p>
            <p>
              Bij een eenvoudige vraag werkt denken vaak averechts: het model gaat dan overdenken,
              en het antwoord wordt er slechter en trager van. Gebruik denken daarom alleen bij
              complexe vragen.
            </p>
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
