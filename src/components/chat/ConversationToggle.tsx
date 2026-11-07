import clsx from 'clsx';
import { Headphones } from '@/components/common/icons';
import { ariaShortcut, shortcutKeys, SHORTCUTS } from '@/lib/shortcuts';
import type { ConversationPhase } from './useChatVoice';

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
  const keys = shortcutKeys(SHORTCUTS.gesprek).join(' + ');
  return (
    <>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={active}
        aria-keyshortcuts={ariaShortcut(SHORTCUTS.gesprek)}
        title={active ? `Stop het gesprek (Esc of ${keys})` : `Start een gesprek met je stem (${keys})`}
        className={clsx(
          'flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-rijksblauw-500/40',
          active
            ? 'bg-rijksblauw-700 text-white dark:bg-rijksblauw-500'
            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-100',
        )}
      >
        <Headphones size={16} className="shrink-0" aria-hidden="true" />
        {phase ? PHASE_LABEL[phase] : 'Gesprek'}
      </button>
      <span role="status" className="sr-only">
        {announcement}
      </span>
    </>
  );
}
