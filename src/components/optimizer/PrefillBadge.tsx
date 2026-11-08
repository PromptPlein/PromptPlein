import type { PrefillSource } from '@/types';
import '@nldd/design-system/tag';
import '@nldd/design-system/tooltip';

interface PrefillBadgeProps {
  source: PrefillSource;
  /** Optionele korte toelichting (bijv. "Afgeleid uit je prompt"). */
  note?: string;
}

/**
 * Small origin label next to a prefilled field. It shows at a glance whether the
 * content comes from the user's own input (success, high confidence), from an
 * internet source (accent, with a globe), or is an AI suggestion that asks for
 * a check (warning).
 */
export default function PrefillBadge({ source, note }: PrefillBadgeProps) {
  if (source === 'bron') {
    return (
      <nldd-tooltip text={note || 'Aangevuld met een feit uit een internetbron; de URL staat in het veld'}>
        <nldd-tag size="sm" color="accent" icon="globe" text="Aangevuld van internet"></nldd-tag>
      </nldd-tooltip>
    );
  }
  const fromPrompt = source === 'prompt';
  return (
    <nldd-tooltip text={note || (fromPrompt ? 'Afgeleid uit je eigen input' : 'AI-suggestie; controleer of dit klopt')}>
      <nldd-tag
        size="sm"
        color={fromPrompt ? 'success' : 'warning'}
        icon={fromPrompt ? 'sparkles' : 'magic'}
        text={fromPrompt ? 'Uit jouw tekst' : 'Controleren'}
      ></nldd-tag>
    </nldd-tooltip>
  );
}
