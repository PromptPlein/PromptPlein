import { Fragment } from 'react';
import '@nldd/design-system/button';
import '@nldd/design-system/button-group';
import '@nldd/design-system/card';
import '@nldd/design-system/container';
import '@nldd/design-system/icon';
import '@nldd/design-system/icon-cell';
import '@nldd/design-system/list';
import '@nldd/design-system/list-item';
import '@nldd/design-system/text';
import '@nldd/design-system/text-cell';

interface ExpandProposalProps {
  /** Naam van het veld waar dit voorstel bij hoort; staat in de koptekst. */
  fieldLabel?: string;
  /** Het door de AI verbeterde voorstel voor dit veld. */
  proposed: string;
  /** Korte punten die benoemen wat de AI verbeterde (kan leeg zijn). */
  improvements: string[];
  /** Neem het voorstel over (vervangt de veldwaarde). */
  onAccept: () => void;
  /** Verwerp het voorstel (veld blijft ongewijzigd). */
  onReject: () => void;
  /** Eigen koptekst, bijvoorbeeld voor een aanvulling in plaats van een herschrijving. */
  title?: string;
  /** Eigen tekst op de overneem-knop. */
  acceptLabel?: string;
  /** Korte regel onder het voorstel, bijvoorbeeld wat overnemen met je tekst doet. */
  hint?: string;
}

/**
 * Shows the AI proposal for a field as clean, readable text (no diff colors),
 * with a short list of what improved below it. The user sees the result and why
 * it is better, and takes it over or rejects it.
 */
export default function ExpandProposal({
  fieldLabel,
  proposed,
  improvements,
  onAccept,
  onReject,
  title,
  acceptLabel,
  hint,
}: ExpandProposalProps) {
  // Field names are often long ("EXAMPLES: geef voorbeelden van ..."); the part
  // before the explanation is enough to recognize the field.
  const shortLabel = fieldLabel?.split(/\s+[—–:-]\s+/)[0]?.trim();
  const lines = proposed.split('\n');
  return (
    <nldd-card background="tinted">
      <nldd-container slot="header" padding-inline="12" padding-top="12" layout="row" gap="8" vertical-alignment="center">
        <nldd-icon icon="sparkles" size="16" color="oranje"></nldd-icon>
        <nldd-text size="xs" weight="bold">
          {title ?? (shortLabel ? `AI-voorstel voor ${shortLabel}` : 'AI-voorstel')}
        </nldd-text>
      </nldd-container>

      <nldd-container padding="12" gap="12">
        <nldd-text size="sm" line-height="loose">
          {lines.map((line, i) => (
            <Fragment key={i}>
              {i > 0 && <br />}
              {line}
            </Fragment>
          ))}
        </nldd-text>

        {hint && (
          <nldd-text size="xs" color="secondary">
            {hint}
          </nldd-text>
        )}

        {improvements.length > 0 && (
          <nldd-container gap="4">
            <nldd-text size="xs" weight="bold" color="secondary">
              Wat is verbeterd
            </nldd-text>
            <nldd-list accessible-label="Wat is verbeterd" dividers="never">
              {improvements.map((item, i) => (
                <nldd-list-item key={i} size="sm">
                  <nldd-icon-cell icon="check-mark" size="16" color="success" vertical-alignment="top"></nldd-icon-cell>
                  <nldd-text-cell size="sm" text={item} vertical-alignment="top"></nldd-text-cell>
                </nldd-list-item>
              ))}
            </nldd-list>
          </nldd-container>
        )}
      </nldd-container>

      <nldd-container slot="footer" padding="12" horizontal-alignment="right">
        <nldd-button-group size="sm">
          <nldd-button appearance="neutral-transparent" size="sm" start-icon="dismiss" text="Verwerpen" onClick={onReject}></nldd-button>
          <nldd-button appearance="primary" size="sm" start-icon="check-mark" text={acceptLabel ?? 'Overnemen'} onClick={onAccept}></nldd-button>
        </nldd-button-group>
      </nldd-container>
    </nldd-card>
  );
}
