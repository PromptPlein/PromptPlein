import { useRef } from 'react';
import { useNlddEvent } from '@/lib/nldd';
import type { FieldLayout } from '@/lib/useFieldLayout';
import '@nldd/design-system/toggle-button-group';
import '@nldd/design-system/toggle-button';

interface FieldLayoutToggleProps {
  layout: FieldLayout;
  onChange: (layout: FieldLayout) => void;
}

/**
 * Small switch for how the fields appear: one question at a time (wizard) or all
 * fields at once in a grid (stacked). useFieldLayout keeps the choice per user.
 */
export default function FieldLayoutToggle({ layout, onChange }: FieldLayoutToggleProps) {
  const ref = useRef<HTMLElement>(null);
  useNlddEvent<CustomEvent<{ selected: boolean; value: string }>>(ref, 'change', (e) => {
    const value = e.detail?.value;
    if (e.detail?.selected && (value === 'wizard' || value === 'stacked')) onChange(value);
  });
  // A view setting, so the quietest control in its row: transparent, not filled.
  return (
    <nldd-toggle-button-group
      ref={ref}
      type="radio"
      size="sm"
      appearance="neutral-transparent"
      accessible-label="Indeling van de velden"
    >
      <nldd-toggle-button
        value="wizard"
        icon="list"
        selected-icon="check-mark"
        text="Per stap"
        selected={layout === 'wizard' || undefined}
      ></nldd-toggle-button>
      <nldd-toggle-button
        value="stacked"
        icon="rectangle-split-3x1"
        selected-icon="check-mark"
        text="Alles"
        selected={layout === 'stacked' || undefined}
      ></nldd-toggle-button>
    </nldd-toggle-button-group>
  );
}
