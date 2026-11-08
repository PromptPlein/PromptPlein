import { useRef } from 'react';
import { useNlddEvent } from '@/lib/nldd';
import type { FieldLayout } from '@/lib/useFieldLayout';
import '@nldd/design-system/segmented-control';

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
  useNlddEvent<CustomEvent<{ value: string }>>(ref, 'change', (e) => {
    const value = e.detail?.value;
    if (value === 'wizard' || value === 'stacked') onChange(value);
  });
  return (
    <nldd-segmented-control
      ref={ref}
      size="sm"
      variant="icon-and-text"
      value={layout}
      accessible-label="Indeling van de velden"
    >
      <nldd-segmented-control-item
        value="wizard"
        icon="list"
        text="Per stap"
        selected={layout === 'wizard' || undefined}
      ></nldd-segmented-control-item>
      <nldd-segmented-control-item
        value="stacked"
        icon="rectangle-split-3x1"
        text="Alles"
        selected={layout === 'stacked' || undefined}
      ></nldd-segmented-control-item>
    </nldd-segmented-control>
  );
}
