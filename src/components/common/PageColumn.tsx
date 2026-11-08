import type { ReactNode } from 'react';
import '@nldd/design-system/card';
import '@nldd/design-system/container';
import '@nldd/design-system/icon';
import '@nldd/design-system/simple-section';
import '@nldd/design-system/spacer';
import '@nldd/design-system/title';

/**
 * Een pagina als één kolom in het midden van een grijze ondergrond: de titel,
 * eventueel met een icoon in een vlak ervoor, en daaronder de inhoud. Zet de
 * inhoud zelf in een of meer `Panel`s, dan staat hij op een witte kaart.
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
    <nldd-simple-section background="tinted" horizontal-alignment="center">
      <nldd-container max-width={width}>
        <nldd-container layout="row" gap="16" vertical-alignment="center">
          {icon && <nldd-icon icon={icon} size="48" color="accent" box></nldd-icon>}
          <nldd-title heading-level={1} size={2} text={title} supporting-text={supporting}></nldd-title>
          {header}
        </nldd-container>
        <nldd-spacer size="24"></nldd-spacer>
        {children}
      </nldd-container>
    </nldd-simple-section>
  );
}

/** Een witte kaart met ruimte eromheen, voor een blok inhoud in een `PageColumn`. */
export function Panel({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <nldd-card accessible-label={label}>
      <nldd-container padding="24" sm-padding="16">
        {children}
      </nldd-container>
    </nldd-card>
  );
}

/** Ruimte tussen twee `Panel`s. */
export function PanelGap() {
  return <nldd-spacer size="16"></nldd-spacer>;
}
