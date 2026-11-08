import { type ReactNode } from 'react';
import InfoDot from '@/components/common/InfoDot';
import '@nldd/design-system/container';
import '@nldd/design-system/icon';
import '@nldd/design-system/text';

/**
 * Korte kop boven een techniekbouwer: wat je hier doet in een paar woorden, de
 * uitleg achter het infobolletje. Zo begint elke bouwer gelijk en staat er geen
 * lap tekst boven de velden.
 */
export default function BuilderIntro({
  icon,
  title,
  text,
}: {
  /** An nldd icon name, or a ready element. */
  icon?: ReactNode;
  title: string;
  /** Hooguit twee korte zinnen. */
  text: string;
}) {
  return (
    <nldd-container layout="row" gap="8" vertical-alignment="center">
      {typeof icon === 'string' ? <nldd-icon icon={icon} size="20" color="accent"></nldd-icon> : icon}
      <nldd-text weight="bold">{title}</nldd-text>
      <InfoDot label={`Uitleg bij: ${title}`} text={text} />
    </nldd-container>
  );
}
