// Supabase Edge Function: delete-account
//
// Een ingelogde gebruiker verwijdert zijn eigen account. De functie:
//   1. leest wie het is uit zijn token (nooit uit de body);
//   2. controleert dat hij zijn e-mailadres heeft overgetypt;
//   3. haalt het contact in Brevo weg;
//   4. wist in de database alles van hem met `delete_user_account` (0068).
//
// Brevo eerst: lukt dat niet, dan blijft het account staan en kan de gebruiker
// het opnieuw proberen. Andersom zou een contact achterblijven bij iemand die er
// niet meer is, en dan kan hij het zelf niet meer oplossen.
//
// Het Brevo-account wordt gedeeld met andere producten van Awaren. Staat het
// contact alleen op de lijst van PromptPlein, dan gaat het hele contact weg.
// Staat het ook op een andere lijst, dan is hij daar zelf voor ingeschreven en
// halen we hem alleen van de lijst van PromptPlein.
//
// Deploy:  supabase functions deploy delete-account
// Secrets: BREVO_API_KEY (al gezet voor register-brevo-contact)
//          BREVO_LIST_ID (optioneel; standaard 14)
//          SUPABASE_URL en SUPABASE_SERVICE_ROLE_KEY zet Supabase zelf.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const DEFAULT_LIST_ID = 14;
const BREVO = 'https://api.brevo.com/v3';

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

type BrevoResult = 'verwijderd' | 'van-lijst' | 'niet-gevonden';

/** Haalt het contact weg uit Brevo. Gooit als Brevo iets anders zegt dan gelukt of onbekend. */
async function removeFromBrevo(email: string, apiKey: string, listId: number): Promise<BrevoResult> {
  const headers = { 'api-key': apiKey, accept: 'application/json', 'Content-Type': 'application/json' };
  const id = encodeURIComponent(email);

  const found = await fetch(`${BREVO}/contacts/${id}?identifierType=email_id`, { headers });
  if (found.status === 404) return 'niet-gevonden';
  if (!found.ok) throw new Error(`Brevo zoeken gaf ${found.status}: ${(await found.text()).slice(0, 200)}`);
  const contact = (await found.json()) as { listIds?: number[] };
  const otherLists = (contact.listIds ?? []).filter((list) => list !== listId);

  if (otherLists.length > 0) {
    const res = await fetch(`${BREVO}/contacts/lists/${listId}/contacts/remove`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ emails: [email] }),
    });
    // 400 "Contact already removed from list" is ook goed.
    if (!res.ok && res.status !== 400 && res.status !== 404) {
      throw new Error(`Brevo van lijst halen gaf ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    return 'van-lijst';
  }

  const res = await fetch(`${BREVO}/contacts/${id}?identifierType=email_id`, { method: 'DELETE', headers });
  if (res.status === 404) return 'niet-gevonden';
  if (!res.ok) throw new Error(`Brevo verwijderen gaf ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return 'verwijderd';
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.replace(/\/+$/, '');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const brevoKey = Deno.env.get('BREVO_API_KEY');
  if (!supabaseUrl || !serviceKey || !brevoKey) {
    console.error('delete-account: configuratie ontbreekt');
    return json({ error: 'Verwijderen is nu niet mogelijk. Probeer het later opnieuw.' }, 503);
  }

  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Log opnieuw in en probeer het nog eens.' }, 401);

  // Wie is het? Alleen het token telt.
  const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${token}` },
  });
  if (!userRes.ok) return json({ error: 'Log opnieuw in en probeer het nog eens.' }, 401);
  const user = (await userRes.json()) as { id?: string; email?: string };
  if (!user.id || !user.email) return json({ error: 'Log opnieuw in en probeer het nog eens.' }, 401);
  const email = user.email.trim().toLowerCase();

  let body: { confirmEmail?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Ongeldige aanvraag' }, 400);
  }
  if ((body.confirmEmail ?? '').trim().toLowerCase() !== email) {
    return json({ error: 'Het e-mailadres klopt niet met je account.' }, 400);
  }

  const rest = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  };

  // De laatste beheerder vóór Brevo tegenhouden, anders is het contact al weg
  // terwijl het account blijft staan. De databasefunctie controleert het nog eens.
  const adminRes = await fetch(`${supabaseUrl}/rest/v1/profiles?role=eq.admin&select=id,is_active`, {
    headers: rest,
  });
  if (adminRes.ok) {
    const admins = (await adminRes.json()) as { id: string; is_active: boolean | null }[];
    const isAdmin = admins.some((a) => a.id === user.id);
    const others = admins.filter((a) => a.id !== user.id && a.is_active !== false);
    if (isAdmin && others.length === 0) {
      return json({ error: 'Je bent de enige beheerder. Maak eerst iemand anders beheerder.' }, 409);
    }
  }

  const listId = Number(Deno.env.get('BREVO_LIST_ID') ?? DEFAULT_LIST_ID) || DEFAULT_LIST_ID;
  let brevo: BrevoResult;
  try {
    brevo = await removeFromBrevo(email, brevoKey, listId);
  } catch (err) {
    console.error('delete-account: Brevo', err);
    return json(
      { error: 'Je account is niet verwijderd: de maillijst gaf een fout. Probeer het later opnieuw.' },
      502,
    );
  }

  const rpc = await fetch(`${supabaseUrl}/rest/v1/rpc/delete_user_account`, {
    method: 'POST',
    headers: rest,
    body: JSON.stringify({ p_user: user.id }),
  });
  if (!rpc.ok) {
    const detail = await rpc.text();
    console.error('delete-account: database', rpc.status, detail.slice(0, 300));
    if (detail.includes('laatste_beheerder')) {
      return json({ error: 'Je bent de enige beheerder. Maak eerst iemand anders beheerder.' }, 409);
    }
    return json({ error: 'Je account is niet verwijderd. Probeer het later opnieuw.' }, 500);
  }
  const removed = (await rpc.json()) as { prompts?: number; projecten?: number };

  console.log(`delete-account: verwijderd, brevo=${brevo}, prompts=${removed.prompts ?? 0}`);
  return json({ success: true, brevo, ...removed }, 200);
});
