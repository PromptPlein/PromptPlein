// Supabase Edge Function: register-brevo-contact
//
// Registreert een nieuw aangemaakte gebruiker als contact in Brevo en voegt
// hem toe aan een contactlijst (standaard lijst 14). Wordt aangeroepen door een
// database-trigger op `public.profiles` (AFTER INSERT) via pg_net, dus niet
// vanuit de browser. De Brevo API-sleutel blijft daardoor volledig server-side.
//
// Beveiliging: de trigger stuurt een gedeeld geheim mee in de header
// `x-webhook-secret`. Alleen verzoeken met het juiste geheim worden uitgevoerd.
//
// Deploy:  supabase functions deploy register-brevo-contact
// Secrets: supabase secrets set BREVO_API_KEY=xkeysib-...
//          supabase secrets set BREVO_WEBHOOK_SECRET=<lang-willekeurig-geheim>
//          supabase secrets set BREVO_LIST_ID=14            (optioneel; standaard 14)
//
// Runtime: Deno (Supabase Edge Functions)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-webhook-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface RequestBody {
  email?: string;
  /** Volledige naam; wordt opgesplitst in voor-/achternaam voor Brevo. */
  fullName?: string | null;
  /** Optioneel: de gebruikers-id, puur als attribuut. */
  userId?: string | null;
}

const DEFAULT_LIST_ID = 14;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** Splits "Voor Tussen Achter" in {firstName, lastName} voor Brevo-attributen. */
function splitName(full: string | null | undefined): { firstName?: string; lastName?: string } {
  const trimmed = (full ?? '').trim();
  if (!trimmed) return {};
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0] };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  // Gedeeld geheim controleren — alleen de database-trigger kent dit.
  const expectedSecret = Deno.env.get('BREVO_WEBHOOK_SECRET');
  if (!expectedSecret || req.headers.get('x-webhook-secret') !== expectedSecret) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const apiKey = Deno.env.get('BREVO_API_KEY');
  if (!apiKey) {
    return json({ error: 'BREVO_API_KEY ontbreekt' }, 503);
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return json({ error: 'Ongeldige JSON' }, 400);
  }

  const email = (body.email ?? '').trim().toLowerCase();
  if (!email || !isEmail(email)) {
    return json({ error: 'Geldig e-mailadres vereist' }, 400);
  }

  const listId = Number(Deno.env.get('BREVO_LIST_ID') ?? DEFAULT_LIST_ID) || DEFAULT_LIST_ID;
  const { firstName, lastName } = splitName(body.fullName);

  const attributes: Record<string, string> = {};
  if (firstName) attributes.FIRSTNAME = firstName;
  if (lastName) attributes.LASTNAME = lastName;

  // Brevo "Create a contact". updateEnabled:true maakt het idempotent:
  // bestaat het contact al, dan wordt het bijgewerkt en aan de lijst toegevoegd.
  // Docs: https://developers.brevo.com/reference/createcontact
  const payload = {
    email,
    attributes,
    listIds: [listId],
    updateEnabled: true,
  };

  try {
    const res = await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });

    // 201 = nieuw aangemaakt, 204 = bijgewerkt. Beide zijn succes.
    if (res.ok) {
      return json({ ok: true }, 200);
    }

    const detail = await res.text();
    // Brevo geeft 400 "Contact already exist" alleen zonder updateEnabled;
    // met updateEnabled:true zou dat niet mogen voorkomen. Log voor zekerheid.
    console.error('Brevo-fout', res.status, detail);
    return json({ error: 'Brevo weigerde het contact', status: res.status }, 502);
  } catch (err) {
    console.error('register-brevo-contact-fout', err);
    return json({ error: 'Onverwachte fout' }, 500);
  }
});
