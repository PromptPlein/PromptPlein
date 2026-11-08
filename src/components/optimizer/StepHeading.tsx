import { type ReactNode } from 'react';
import InfoDot from '@/components/common/InfoDot';
import '@nldd/design-system/container';
import '@nldd/design-system/form-field';
import '@nldd/design-system/spacer';
import '@nldd/design-system/title';

/**
 * Kop van één genummerde stap in "Prompt maken": het nummer boven een korte
 * vraag en de uitleg achter een infobolletje. Rechts is plek voor de knoppen die
 * bij de stap horen (voorbeelden, opschonen).
 */
export default function StepHeading({
  step,
  title,
  info,
  children,
}: {
  /** Nummer boven de kop; zonder nummer is het een gewone kop. */
  step?: number;
  title: string;
  /**
   * Kept for callers. An nldd field takes its accessible name from its own
   * nldd-form-field or accessible-label, so the heading is no longer a label.
   */
  htmlFor?: string;
  /** Korte uitleg achter het infobolletje. */
  info?: string;
  children?: ReactNode;
}) {
  return (
    <nldd-container layout="wrap" gap="4" vertical-alignment="bottom">
      <nldd-title
        heading-level={2}
        size={4}
        text={title}
        overline={step !== undefined ? `Stap ${step}` : undefined}
      ></nldd-title>
      {info && <InfoDot label={`Uitleg bij: ${title}`} text={info} />}
      {children && (
        <>
          <nldd-spacer size="flexible" direction="horizontal"></nldd-spacer>
          <nldd-container layout="wrap" width="fit-content" gap="4" vertical-alignment="center">
            {children}
          </nldd-container>
        </>
      )}
    </nldd-container>
  );
}
