import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { useNlddEvent } from '@/lib/nldd';
import type { MemoryNotice } from './rememberWish';

/** Zo lang blijft een melding staan als niemand er iets mee doet. */
const NOTICE_MS = 5000;

/**
 * Wat het geheugen deed, direct boven het tekstvak: daar kijkt wie typt. Verdwijnt
 * na vijf seconden vanzelf, op verzoek van de eigenaar. Voor WCAG 2.2.1 pauzeert
 * die tijd zolang de muis erop staat of de focus erin zit, en begint hij daarna
 * opnieuw. Wie de melding mist, vindt het geheugen en Ongedaan maken ook bij
 * Instellingen, Chat.
 *
 * The banner is its own role="status", apart from the message list, so a screen
 * reader reads this one line without picking up the streaming answer.
 */
export default function MemoryNoticeBar({
  notice,
  onDismiss,
  onLogin,
}: {
  notice: MemoryNotice | null;
  onDismiss: () => void;
  onLogin: () => void;
}) {
  const [undoing, setUndoing] = useState(false);
  const [undone, setUndone] = useState<'ok' | 'failed' | null>(null);
  const [shownFor, setShownFor] = useState<MemoryNotice | null>(null);

  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);

  // Nieuwe melding: de stand van een eerdere Ongedaan maken geldt niet meer.
  if (shownFor !== notice) {
    setShownFor(notice);
    setUndone(null);
    setUndoing(false);
  }

  // Opslaan loopt nog of Ongedaan maken is bezig: dan nog niet weg.
  const waiting = !notice || notice.kind === 'saving' || undoing || hovered || focused;
  useEffect(() => {
    if (waiting) return;
    const timer = window.setTimeout(onDismiss, NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [waiting, notice, undone, onDismiss]);

  let text = '';
  let supporting: string | undefined;
  if (notice?.kind === 'saving') text = 'Wordt in geheugen opgeslagen…';
  else if (notice?.kind === 'message') text = notice.text;
  else if (notice?.kind === 'saved') {
    if (undone === 'ok') text = 'Niet in geheugen opgeslagen.';
    else {
      text = `In geheugen opgeslagen: ${notice.saved.join(' ')}`;
      const lines = [];
      if (notice.replaced.length > 0) lines.push(`Vervangt: ${notice.replaced.join(' ')}`);
      if (undone === 'failed') lines.push('Ongedaan maken lukte niet. Verwijder het bij Instellingen.');
      supporting = lines.join(' ') || undefined;
    }
  }

  if (!notice) return null;
  return (
    <DismissibleBanner
      onDismiss={onDismiss}
      size="sm"
      variant="accent"
      icon="bookmark"
      text={text}
      supporting-text={supporting}
      dismissible={notice.kind !== 'saving' || undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
      }}
    >
      {notice.kind === 'message' && notice.login && (
        <nldd-button slot="actions" appearance="secondary" start-icon="login" text="Inloggen" onClick={onLogin}></nldd-button>
      )}
      {notice.kind === 'saved' && undone !== 'ok' && (
        <>
          <nldd-button
            slot="actions"
            appearance="secondary"
            text="Ongedaan maken"
            loading={undoing || undefined}
            loading-text="Bezig"
            onClick={() => {
              if (undoing) return;
              setUndoing(true);
              notice
                .undo()
                .then(() => setUndone('ok'))
                .catch(() => setUndone('failed'))
                .finally(() => setUndoing(false));
            }}
          ></nldd-button>
          <nldd-button slot="actions" appearance="neutral-transparent" text="Bekijk geheugen" href="/instellingen/chat"></nldd-button>
        </>
      )}
    </DismissibleBanner>
  );
}

/** Mounts with the banner, so the dismiss listener binds to the element that exists. */
function DismissibleBanner({ onDismiss, ...rest }: ComponentProps<'nldd-banner'> & { onDismiss: () => void }) {
  const ref = useRef<HTMLElement>(null);
  useNlddEvent(ref, 'dismiss', () => onDismiss());
  return <nldd-banner ref={ref} {...rest}></nldd-banner>;
}
