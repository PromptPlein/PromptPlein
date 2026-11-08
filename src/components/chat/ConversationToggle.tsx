import { useAccessibility } from '@/context/AccessibilityContext';
import { ariaShortcut, shortcutKeys, SHORTCUTS } from '@/lib/shortcuts';
import type { ConversationPhase } from './useChatVoice';
import '@nldd/design-system/toggle-button';
import '@nldd/design-system/tooltip';
import '@nldd/design-system/visually-hidden';

const PHASE_LABEL: Record<ConversationPhase, string> = {
  luistert: 'Ik luister',
  uitschrijven: 'Even schrijven',
  denkt: 'Ik denk na',
  leest: 'Ik lees voor',
  wacht: 'Even wachten',
};

/**
 * De knop voor de gespreksmodus. Aan laat hij zien wat er gebeurt, zodat ook wie
 * slecht ziet weet of de microfoon open staat. Die stand staat bewust niet in de
 * meldingenregio: een schermlezer zou hem uitspreken terwijl de microfoon aangaat,
 * en dan neemt die hem op. Tijdens een gesprek zeggen de toon en de stem genoeg.
 *
 * De knop verschijnt pas als iemand Gesprek zonder handen aanzet bij Toegankelijkheid.
 */
export default function ConversationToggle({
  active,
  phase,
  announcement,
  onToggle,
}: {
  active: boolean;
  phase: ConversationPhase | null;
  announcement: string;
  onToggle: () => void;
}) {
  const { settings } = useAccessibility();
  const keys = shortcutKeys(SHORTCUTS.gesprek).join(' + ');
  return (
    <>
      {settings.conversationMode && (
        <nldd-tooltip
          text={active ? `Stop het gesprek (Esc of ${keys})` : `Start een gesprek met je stem (${keys})`}
        >
          <nldd-toggle-button
            size="sm"
            appearance="neutral-transparent"
            icon="ear"
            text={phase ? PHASE_LABEL[phase] : 'Gesprek'}
            selected={active || undefined}
            aria-keyshortcuts={ariaShortcut(SHORTCUTS.gesprek)}
            onClick={onToggle}
          ></nldd-toggle-button>
        </nldd-tooltip>
      )}
      {/* A status for screen readers only: the tones and the voice say it to everyone else. */}
      <nldd-visually-hidden role="status">{announcement}</nldd-visually-hidden>
    </>
  );
}
