// Supabase Edge Function: brevo-event
//
// Geeft gebeurtenissen uit de goedkeuringsstroom door aan Brevo, waar per
// gebeurtenis een automation de mail verstuurt. Wordt aangeroepen door de
// database-triggers uit migratie 0048 (via pg_net), dus niet vanuit de browser.
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

const ALLOWED_EVENTS = new Set([
  'promptplein_aanvraag_ingediend',
  'promptplein_goedkeuring_wacht',
  'promptplein_aanvraag_goedgekeurd',
  'promptplein_aanvraag_afgewezen',
]);

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
  if (!ALLOWED_EVENTS.has(event)) return json({ error: 'Onbekende gebeurtenis' }, 400);

  const properties = cleanProperties(body.properties);
  const recipients = (body.recipients ?? []).filter((r) => r.email && isEmail(r.email));

  // Docs: https://developers.brevo.com/reference/createevent
  const results = await Promise.all(
    recipients.map(async (recipient) => {
      const voornaam = recipient.voornaam?.trim();
      const res = await fetch('https://api.brevo.com/v3/events', {
        method: 'POST',
        headers: {
          'api-key': apiKey,
          'Content-Type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          event_name: event,
          identifiers: { email_id: recipient.email!.toLowerCase() },
          ...(voornaam ? { contact_properties: { FIRSTNAME: voornaam } } : {}),
          event_properties: properties,
        }),
      });
      if (!res.ok) console.error('Brevo-fout', event, res.status, await res.text());
      return res.ok;
    }),
  );

  const failed = results.filter((ok) => !ok).length;
  return json({ ok: failed === 0, sent: results.length - failed, failed }, failed ? 502 : 200);
});
