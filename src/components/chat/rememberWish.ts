// Onthouden vanuit de chat: een bericht met "voortaan", "onthoud dit" of "vanaf
// nu" gaat naar het geheugen van de gebruiker. Wat er gebeurt, meldt de chat
// direct boven het tekstvak (MemoryNoticeBar), en niet in een toast: daar kijkt
// wie typt, en de melding blijft staan tot hij hem sluit.

import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { detectPii } from '@/services/guardrails';
import { rememberFromMessage } from '@/services/memoryService';

/** Zo lang wacht het antwoord op het opslaan. Daarna loopt het opslaan op de achtergrond door. */
const REMEMBER_WAIT_MS = 10_000;

/** Wat de chat boven het tekstvak laat zien over het geheugen. */
export type MemoryNotice =
  | { kind: 'saving' }
  | { kind: 'saved'; saved: string[]; replaced: string[]; undo: () => Promise<void> }
  | { kind: 'message'; text: string; login?: boolean };

/**
 * Legt de vaste wens uit het bericht vast. Wacht hoogstens {@link REMEMBER_WAIT_MS},
 * zodat een vervangen wens niet meer meetelt in het antwoord op dit bericht.
 * Faalt nooit: het gesprek gaat altijd door.
 */
export async function rememberWish(
  args: {
    message: string;
    previousUser?: string;
    previousAssistant?: string;
    preferredProvider?: string;
    preferredModel?: string;
  },
  onNotice: (notice: MemoryNotice | null) => void,
): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;
  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    onNotice({ kind: 'message', text: 'Log in om dit in je geheugen op te slaan.', login: true });
    return;
  }
  // Het geheugen staat op de server en gaat bij elk gesprek mee: een
  // persoonsgegeven hoort daar niet in, ook niet als het in het bericht mocht.
  if (detectPii(args.message).length > 0) {
    onNotice({
      kind: 'message',
      text: 'Niet in geheugen opgeslagen: er lijkt een persoonsgegeven in je bericht te staan.',
    });
    return;
  }

  onNotice({ kind: 'saving' });
  const work = rememberFromMessage(args)
    .then((result) => {
      onNotice(
        result.saved.length > 0
          ? {
              kind: 'saved',
              saved: result.saved.map((m) => m.text),
              replaced: result.replaced.map((m) => m.text),
              undo: result.undo,
            }
          : null,
      );
    })
    .catch((err) => {
      console.warn('Onthouden mislukt', err);
      onNotice({ kind: 'message', text: 'Opslaan in geheugen lukte nu niet. Probeer het later nog eens.' });
    });
  await Promise.race([work, new Promise((resolve) => setTimeout(resolve, REMEMBER_WAIT_MS))]);
}
