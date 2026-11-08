import { useState } from 'react';
import InfoDot from '@/components/common/InfoDot';
import type { Technique } from '@/types';
import { techniekKaart } from '@/lib/techniekDoelen';

export interface AanpakOptie {
  id: string;
  naam: string;
  waarom: string;
}

/**
 * Which approach the AI chose and why. On Prompt maken nobody picks a framework,
 * but the name stays visible, so you see where the fields come from. "Andere
 * aanpak" shows the alternatives the AI already gave, for when the choice is off.
 * Switching fills in the fields again.
 */
export default function AanpakKaart({
  technique,
  titel = 'De AI heeft je prompt alvast ingevuld',
  reden,
  opties = [],
  onKies,
  disabled,
}: {
  technique: Technique;
  titel?: string;
  /** Waarom deze aanpak past; leeg als hij uit de soortkeuze volgt. */
  reden?: string;
  opties?: AanpakOptie[];
  onKies?: (id: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const kaart = techniekKaart(technique);

  return (
    <nldd-card accessible-label="Gekozen aanpak">
      <nldd-container padding="16" gap="12">
        <nldd-container layout="wrap" gap="12" vertical-alignment="center">
          <nldd-icon icon="sparkles" size="24" color="lintblauw" box></nldd-icon>
          <nldd-container width="18rem" gap="2">
            <nldd-text size="lg" weight="bold" color="accent">
              {titel}
            </nldd-text>
            <nldd-container layout="row" gap="4" vertical-alignment="center">
              <nldd-text>
                Aanpak: <strong>{technique.name}</strong>
                {reden ? `. ${reden}` : ''}
              </nldd-text>
              {kaart.info && <InfoDot label={`Uitleg over ${technique.name}`} text={kaart.info} />}
            </nldd-container>
          </nldd-container>
          {opties.length > 0 && onKies && (
            <nldd-button
              appearance="neutral-transparent"
              text="Andere aanpak"
              end-icon={open ? 'chevron-up' : 'chevron-down'}
              onClick={() => setOpen((v) => !v)}
            ></nldd-button>
          )}
        </nldd-container>

        {open && onKies && (
          <nldd-container gap="8">
            <nldd-divider></nldd-divider>
            <nldd-text size="sm" color="secondary">
              Kies je een andere aanpak, dan vult de AI de velden opnieuw in.
            </nldd-text>
            <nldd-list appearance="box-tinted" accessible-label="Andere aanpak">
              {opties.map((o) => (
                <nldd-list-item
                  key={o.id}
                  button
                  disabled={disabled || undefined}
                  onClick={() => {
                    if (disabled) return;
                    setOpen(false);
                    onKies(o.id);
                  }}
                >
                  <nldd-text-cell text={o.naam} supporting-text={o.waarom || undefined}></nldd-text-cell>
                  <nldd-icon-cell icon="chevron-right" size="20"></nldd-icon-cell>
                </nldd-list-item>
              ))}
            </nldd-list>
          </nldd-container>
        )}
      </nldd-container>
    </nldd-card>
  );
}
