import type { ReactNode } from 'react';
import '@nldd/design-system/card';
import '@nldd/design-system/container';
import '@nldd/design-system/icon';
import '@nldd/design-system/simple-section';
import '@nldd/design-system/title';

/**
 * Een pagina om iets in te vullen of te lezen, zoals Contact en Instellingen op
 * main: een smalle kolom in het midden van de grijze ondergrond, met bovenaan de
 * titel (eventueel met een icoon in een vlak ervoor) en daaronder de inhoud. Zet
 * blokken inhoud elk in een `Panel`: dat is de witte kaart.
 */
export default function PageColumn({
  title,
  supporting,
  icon,
  width = '42rem',
  header,
  children,
}: {
  title: string;
  supporting?: string;
  /** Icoon in een vlak voor de titel, zoals bij Contact en Instellingen. */
  icon?: string;
  width?: string;
  /** Iets naast de titel, zoals een infobolletje. */
  header?: ReactNode;
  children: ReactNode;
}) {
  return (
    <nldd-simple-section background="tinted" horizontal-alignment="center" grow>
      <nldd-container width="100%" max-width={width} gap="24">
        <nldd-container layout="row" gap="16" vertical-alignment="center">
          {icon && <nldd-icon icon={icon} size="48" color="accent" box></nldd-icon>}
          <nldd-title heading-level={1} size={3} text={title} supporting-text={supporting}></nldd-title>
          {header}
        </nldd-container>
        {children}
      </nldd-container>
    </nldd-simple-section>
  );
}

/** Eén blok inhoud van een `PageColumn`: een witte kaart op de grijze ondergrond. */
export function Panel({ children }: { children: ReactNode }) {
  return (
    <nldd-card>
      <nldd-container padding="24" sm-padding="16">
        {children}
      </nldd-container>
    </nldd-card>
  );
}
