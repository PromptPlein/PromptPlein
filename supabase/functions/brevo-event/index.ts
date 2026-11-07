// Supabase Edge Function: brevo-event
//
// Verstuurt de mails uit de goedkeuringsstroom via de transactionele mail van
// Brevo. Bewust geen automation: dat is voor Brevo marketing, dus wie zich ergens
// in dit gedeelde account uitschrijft zou deze meldingen missen. Dit zijn berichten
// over een eigen aanvraag of een taak als beoordelaar, dus zonder uitschrijflink.
// Wordt aangeroepen door de database-triggers uit migratie 0048 (via pg_net), niet
// vanuit de browser.
//
// Beveiliging: de trigger stuurt hetzelfde gedeelde geheim mee als
// register-brevo-contact, in de header `x-webhook-secret`.
//
// Deploy:  supabase functions deploy brevo-event
// Secrets: BREVO_API_KEY, BREVO_WEBHOOK_SECRET (staan er al)

interface Recipient {
  email?: string;
  voornaam?: string | null;
}

interface RequestBody {
  event?: string;
  recipients?: Recipient[];
  properties?: Record<string, string | null>;
}

/** Gebeurtenis uit de database naar de transactionele template in Brevo. */
const TEMPLATES: Record<string, number> = {
  promptplein_goedkeuring_wacht: 69,
  promptplein_aanvraag_ingediend: 70,
  promptplein_aanvraag_goedgekeurd: 71,
  promptplein_aanvraag_afgewezen: 72,
};

const SENDER = { name: 'PromptPlein', email: 'roy@awaren.nl' };

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** Lege waarden gaan niet mee, zodat `{% if params.x %}` in de mail klopt. */
function cleanProperties(input: Record<string, string | null> = {}): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    const text = (value ?? '').trim();
    if (text) out[key] = text.slice(0, 500);
  }
  return out;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const expectedSecret = Deno.env.get('BREVO_WEBHOOK_SECRET');
  if (!expectedSecret || req.headers.get('x-webhook-secret') !== expectedSecret) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const apiKey = Deno.env.get('BREVO_API_KEY');
  if (!apiKey) return json({ error: 'BREVO_API_KEY ontbreekt' }, 503);

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return json({ error: 'Ongeldige JSON' }, 400);
  }

  const event = body.event ?? '';
  const templateId = TEMPLATES[event];
  if (!templateId) return json({ error: 'Onbekende gebeurtenis' }, 400);

  const properties = cleanProperties(body.properties);
  const recipients = (body.recipients ?? []).filter((r) => r.email && isEmail(r.email));

  // Docs: https://developers.brevo.com/reference/sendtransacemail
  const results = await Promise.all(
    recipients.map(async (recipient) => {
      const voornaam = recipient.voornaam?.trim();
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': apiKey,
          'Content-Type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          templateId,
          sender: SENDER,
          to: [{ email: recipient.email!.toLowerCase() }],
          params: { ...properties, ...(voornaam ? { voornaam } : {}) },
        }),
      });
      if (!res.ok) console.error('Brevo-fout', event, res.status, await res.text());
      return res.ok;
    }),
  );

  const failed = results.filter((ok) => !ok).length;
  return json({ ok: failed === 0, sent: results.length - failed, failed }, failed ? 502 : 200);
});
