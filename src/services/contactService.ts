import { getAnonKey, getFunctionUrl, isSupabaseConfigured } from '@/lib/supabase';

/** Soort melding dat het contactformulier kan versturen. */
export type ContactKind = 'bug' | 'feature' | 'other';

export interface ContactMessage {
  kind: ContactKind;
  subject: string;
  message: string;
  /** Optioneel antwoordadres van de melder. */
  replyTo?: string;
  /** Optioneel: naam van de melder. */
  name?: string;
}

/** Vast beheeradres waar contactmails naartoe gaan (server kan dit overschrijven). */
export const CONTACT_EMAIL = 'royvsichem@gmail.com';

const KIND_LABELS: Record<ContactKind, string> = {
  bug: 'Bug-melding',
  feature: 'Feature-verzoek',
  other: 'Algemeen bericht',
};

/**
 * Bouw een mailto-fallback zodat het bericht ook verzonden kan worden als de
 * Edge Function (nog) niet beschikbaar is, of in lokale mock-modus.
 */
export function buildContactMailto(msg: ContactMessage): string {
  const label = KIND_LABELS[msg.kind];
  const subject = msg.subject ? `[PromptGo] ${label}: ${msg.subject}` : `[PromptGo] ${label}`;
  const body = [
    label,
    msg.name ? `Van: ${msg.name}` : '',
    msg.replyTo ? `Antwoord naar: ${msg.replyTo}` : '',
    '',
    msg.message,
  ]
    .filter(Boolean)
    .join('\n');
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export interface SendContactResult {
  /** Is het bericht daadwerkelijk via de server verstuurd? */
  sent: boolean;
  /** Mailto-link als terugval wanneer server-verzending niet kan. */
  mailto?: string;
}

/**
 * Verstuur een contactbericht. Roept de Supabase Edge Function `send-contact`
 * aan (Brevo) wanneer geconfigureerd; lukt dat niet, dan geeft de functie een
 * mailto-terugval terug zodat de gebruiker het alsnog via de eigen mailclient
 * kan versturen.
 */
export async function sendContactMessage(msg: ContactMessage): Promise<SendContactResult> {
  const trimmed: ContactMessage = {
    kind: msg.kind,
    subject: msg.subject.trim(),
    message: msg.message.trim(),
    replyTo: msg.replyTo?.trim() || undefined,
    name: msg.name?.trim() || undefined,
  };

  const functionUrl = getFunctionUrl('send-contact');

  if (isSupabaseConfigured && functionUrl) {
    try {
      const anonKey = getAnonKey();
      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(anonKey ? { Authorization: `Bearer ${anonKey}`, apikey: anonKey } : {}),
        },
        body: JSON.stringify(trimmed),
      });

      if (response.ok) {
        return { sent: true };
      }
      // Server bereikbaar maar verzending mislukte (bv. ontbrekende API-key):
      // val terug op mailto zodat de gebruiker niet vastloopt.
      console.warn('send-contact gaf status', response.status);
    } catch (err) {
      console.warn('send-contact niet bereikbaar', err);
    }
  }

  return { sent: false, mailto: buildContactMailto(trimmed) };
}
