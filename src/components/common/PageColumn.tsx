import type { ReactNode } from 'react';
import '@nldd/design-system/container';
import '@nldd/design-system/hero';
import '@nldd/design-system/icon';
import '@nldd/design-system/spacer';
import '@nldd/design-system/title';

/**
 * Een pagina om iets in te vullen of te lezen, zoals Maken: het lijnenbeeld
 * bovenaan en een witte kaart die eroverheen valt, met de titel (eventueel met
 * een icoon in een vlak ervoor) en daaronder de inhoud. Zet blokken inhoud elk
 * in een `Panel`.
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
    <nldd-hero
      width="full"
      background="tinted"
      layout="overlap"
      main-background="base"
      main-position="bottom-center"
      main-width={width}
      media-height="clamp(120px, 24vw, 300px)"
      overlap-size="clamp(64px, 17vw, 220px)"
      media-src="/lijnen.jpg"
      media-alt=""
    >
      <nldd-container>
        <nldd-container layout="row" gap="16" vertical-alignment="center">
          {icon && <nldd-icon icon={icon} size="48" color="accent" box></nldd-icon>}
          <nldd-title heading-level={1} size={2} text={title} supporting-text={supporting}></nldd-title>
          {header}
        </nldd-container>
        <nldd-spacer size="24"></nldd-spacer>
        {children}
      </nldd-container>
    </nldd-hero>
  );
}

/** Eén blok inhoud op de kaart van een `PageColumn`. */
export function Panel({ children }: { children: ReactNode }) {
  return <nldd-container>{children}</nldd-container>;
}
