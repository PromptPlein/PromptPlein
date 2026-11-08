// Onthouden vanuit de chat: een bericht met "voortaan", "onthoud dit" of "vanaf
// nu" gaat naar het geheugen van de gebruiker, en de chat meldt wat er is
// vastgelegd, met Ongedaan maken ernaast.

import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { detectPii } from '@/services/guardrails';
import { rememberFromMessage } from '@/services/memoryService';

/** Zo lang wacht het antwoord op het opslaan. Daarna loopt het opslaan op de achtergrond door. */
const REMEMBER_WAIT_MS = 10_000;

/** Wie niet is ingelogd, hoort één keer per bezoek dat onthouden een account vraagt. */
let loginHintShown = false;

const LINK_CLASS = 'font-medium text-rijksblauw-700 underline dark:text-rijksblauw-200';

function showSaved(saved: string[], replaced: string[], undo: () => Promise<void>) {
  toast(
    (t) => (
      <div className="space-y-1">
        <p>
          <span className="font-semibold">Onthouden:</span> {saved.join(' ')}
        </p>
        {replaced.length > 0 && (
          <p className="text-slate-600 dark:text-slate-300">Vervangt: {replaced.join(' ')}</p>
        )}
        <p className="flex flex-wrap gap-x-4">
          <button
            type="button"
            className={LINK_CLASS}
            onClick={() => {
              toast.dismiss(t.id);
              undo()
                .then(() => toast('Niet onthouden.'))
                .catch(() => toast.error('Ongedaan maken lukte niet. Verwijder het bij Instellingen.'));
            }}
          >
            Ongedaan maken
          </button>
          <Link to="/instellingen/chat" className={LINK_CLASS} onClick={() => toast.dismiss(t.id)}>
            Bekijk geheugen
          </Link>
        </p>
      </div>
    ),
    { duration: 10_000 },
  );
}

/**
 * Legt de vaste wens uit het bericht vast. Wacht hoogstens {@link REMEMBER_WAIT_MS},
 * zodat een vervangen wens niet meer meetelt in het antwoord op dit bericht.
 * Faalt nooit: het gesprek gaat altijd door.
 */
export async function rememberWish(args: {
  message: string;
  previousUser?: string;
  previousAssistant?: string;
  preferredProvider?: string;
  preferredModel?: string;
}): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;
  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    if (!loginHintShown) {
      loginHintShown = true;
      toast('Log in om de chat dit te laten onthouden.');
    }
    return;
  }
  // Het geheugen staat op de server en gaat bij elk gesprek mee: een
  // persoonsgegeven hoort daar niet in, ook niet als het in het bericht mocht.
  if (detectPii(args.message).length > 0) {
    toast('Niet onthouden: er lijkt een persoonsgegeven in je bericht te staan.');
    return;
  }

  const work = rememberFromMessage(args)
    .then((result) => {
      if (result.saved.length > 0) {
        showSaved(
          result.saved.map((m) => m.text),
          result.replaced.map((m) => m.text),
          result.undo,
        );
      }
    })
    .catch((err) => {
      console.warn('Onthouden mislukt', err);
      toast.error('Onthouden lukte nu niet. Probeer het later nog eens.');
    });
  await Promise.race([work, new Promise((resolve) => setTimeout(resolve, REMEMBER_WAIT_MS))]);
}
