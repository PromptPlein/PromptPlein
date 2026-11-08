import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BookmarkCheck, Loader2, LogIn, X } from '@/components/common/icons';
import type { MemoryNotice } from './rememberWish';

const LINK_CLASS =
  'opl-raak font-medium text-rijksblauw-700 underline hover:no-underline dark:text-rijksblauw-200';

/**
 * Wat het geheugen deed, direct boven het tekstvak: daar kijkt wie typt. Blijft
 * staan tot de gebruiker hem sluit of een nieuw bericht verstuurt, zodat er geen
 * tijdslimiet aan het lezen zit (WCAG 2.2.1).
 *
 * Een eigen role="status", los van de berichtenlijst: zo leest een schermlezer
 * deze ene regel voor zonder het streamende antwoord op te pikken.
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

  // Nieuwe melding: de stand van een eerdere Ongedaan maken geldt niet meer.
  if (shownFor !== notice) {
    setShownFor(notice);
    setUndone(null);
    setUndoing(false);
  }

  return (
    <div role="status">
      {notice && (
        <div className="mb-2 flex items-start gap-2.5 rounded-xl border border-rijksblauw-200 bg-rijksblauw-50 px-3.5 py-2.5 text-sm text-slate-800 dark:border-rijksblauw-500/40 dark:bg-rijksblauw-500/10 dark:text-slate-100">
          {notice.kind === 'saving' ? (
            <Loader2 size={16} aria-hidden="true" className="mt-0.5 shrink-0 animate-spin text-rijksblauw-600 dark:text-rijksblauw-300" />
          ) : (
            <BookmarkCheck size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-rijksblauw-600 dark:text-rijksblauw-300" />
          )}

          <div className="min-w-0 flex-1 space-y-1">
            {notice.kind === 'saving' && <p>Wordt in geheugen opgeslagen…</p>}

            {notice.kind === 'message' && (
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span>{notice.text}</span>
                {notice.login && (
                  <button type="button" className={`${LINK_CLASS} inline-flex items-center gap-1`} onClick={onLogin}>
                    <LogIn size={14} aria-hidden="true" /> Inloggen
                  </button>
                )}
              </p>
            )}

            {notice.kind === 'saved' &&
              (undone === 'ok' ? (
                <p>Niet in geheugen opgeslagen.</p>
              ) : (
                <>
                  <p>
                    <span className="font-semibold">In geheugen opgeslagen:</span> {notice.saved.join(' ')}
                  </p>
                  {notice.replaced.length > 0 && (
                    <p className="text-slate-600 dark:text-slate-300">
                      Vervangt: {notice.replaced.join(' ')}
                    </p>
                  )}
                  {undone === 'failed' && (
                    <p>Ongedaan maken lukte niet. Verwijder het bij Instellingen.</p>
                  )}
                  <p className="flex flex-wrap gap-x-4">
                    <button
                      type="button"
                      className={LINK_CLASS}
                      disabled={undoing}
                      onClick={() => {
                        setUndoing(true);
                        notice
                          .undo()
                          .then(() => setUndone('ok'))
                          .catch(() => setUndone('failed'))
                          .finally(() => setUndoing(false));
                      }}
                    >
                      {undoing ? 'Bezig…' : 'Ongedaan maken'}
                    </button>
                    <Link to="/instellingen/chat" className={LINK_CLASS}>
                      Bekijk geheugen
                    </Link>
                  </p>
                </>
              ))}
          </div>

          {notice.kind !== 'saving' && (
            <button
              type="button"
              className="-m-1 shrink-0 rounded-md p-1 text-slate-500 hover:bg-rijksblauw-100 hover:text-slate-800 dark:hover:bg-rijksblauw-500/20 dark:hover:text-slate-100"
              onClick={onDismiss}
              aria-label="Melding over het geheugen sluiten"
            >
              <X size={14} aria-hidden="true" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
