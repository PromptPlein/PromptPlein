// Supabase Edge Function: send-contact
//
// Verstuurt een contactbericht (bug-melding of feature-verzoek) vanuit het
// contactformulier naar het beheeradres. Gebruikt de Brevo (Sendinblue)
// transactionele e-mail-API zodat de API-sleutel server-side blijft en niet
// in de frontend-bundle terechtkomt.
//
// Deploy:  supabase functions deploy send-contact
// Secrets: supabase secrets set BREVO_API_KEY=xkeysib-...
//          supabase secrets set CONTACT_TO_EMAIL=royvsichem@gmail.com   (optioneel)
//          supabase secrets set CONTACT_FROM_EMAIL=no-reply@jouwdomein.nl (optioneel)
//
// Runtime: Deno (Supabase Edge Functions)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** Soort melding dat het formulier kan versturen. */
type ContactKind = 'bug' | 'feature' | 'other';

interface RequestBody {
  kind?: ContactKind;
  /** Onderwerp / korte titel van de melding. */
  subject?: string;
  /** De uitgebreide omschrijving. */
  message?: string;
  /** Optioneel: antwoordadres van de melder. */
  replyTo?: string;
  /** Optioneel: naam van de melder. */
  name?: string;
}

const KIND_LABELS: Record<ContactKind, string> = {
  bug: 'Bug-melding',
  feature: 'Feature-verzoek',
  other: 'Algemeen bericht',
};

/** Standaard-ontvanger; te overschrijven via CONTACT_TO_EMAIL secret. */
const DEFAULT_TO = 'royvsichem@gmail.com';

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Simpele e-mailvalidatie zodat we geen onzin als reply-to doorgeven. */
function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return new Response(JSON.stringify({ error: 'Ongeldige JSON' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const kind: ContactKind =
    body.kind === 'bug' || body.kind === 'feature' || body.kind === 'other'
      ? body.kind
      : 'other';
  const subject = (body.subject ?? '').trim();
  const message = (body.message ?? '').trim();
  const name = (body.name ?? '').trim().slice(0, 120);
  const replyToRaw = (body.replyTo ?? '').trim();
  const replyTo = replyToRaw && isEmail(replyToRaw) ? replyToRaw : '';

  if (!message) {
    return new Response(JSON.stringify({ error: 'Bericht is verplicht' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const apiKey = Deno.env.get('BREVO_API_KEY');
  if (!apiKey) {
    return new Response(
      JSON.stringify({
        error: 'E-mailservice niet geconfigureerd (BREVO_API_KEY ontbreekt).',
      }),
      {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }

  const toEmail = Deno.env.get('CONTACT_TO_EMAIL') ?? DEFAULT_TO;
  // Optioneel kopie-adres (bijv. een werk-mailbox die mee wil lezen).
  const ccEmail = Deno.env.get('CONTACT_CC_EMAIL')?.trim();
  // Brevo eist een geverifieerd afzenderadres/-domein. Valt CONTACT_FROM_EMAIL
  // weg, dan gebruiken we het ontvangstadres als afzender (werkt zodra dat
  // adres/domein in Brevo geverifieerd is).
  const fromEmail = Deno.env.get('CONTACT_FROM_EMAIL') ?? toEmail;

  const kindLabel = KIND_LABELS[kind];
  const mailSubject = subject
    ? `[PromptGo] ${kindLabel}: ${subject}`
    : `[PromptGo] ${kindLabel}`;

  const safeName = name ? escapeHtml(name) : 'Onbekend';
  const safeReply = replyTo ? escapeHtml(replyTo) : '—';
  const htmlBody = `
    <h2>${escapeHtml(kindLabel)}</h2>
    ${subject ? `<p><strong>Onderwerp:</strong> ${escapeHtml(subject)}</p>` : ''}
    <p><strong>Van:</strong> ${safeName} (${safeReply})</p>
    <hr />
    <p style="white-space:pre-wrap">${escapeHtml(message)}</p>
  `.trim();

  const textBody = [
    kindLabel,
    subject ? `Onderwerp: ${subject}` : '',
    `Van: ${name || 'Onbekend'} (${replyTo || '—'})`,
    '',
    message,
  ]
    .filter(Boolean)
    .join('\n');

  // Brevo transactionele e-mail-API.
  // Docs: https://developers.brevo.com/reference/sendtransacemail
  const payload: Record<string, unknown> = {
    sender: { email: fromEmail, name: 'PromptGo Contact' },
    to: [{ email: toEmail }],
    subject: mailSubject,
    htmlContent: htmlBody,
    textContent: textBody,
  };
  // Stuur een kopie naar het CC-adres als dat is ingesteld (en niet gelijk is
  // aan de hoofdontvanger).
  if (ccEmail && ccEmail.toLowerCase() !== toEmail.toLowerCase()) {
    payload.cc = [{ email: ccEmail }];
  }
  if (replyTo) {
    payload.replyTo = { email: replyTo, name: name || replyTo };
  }

  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error('Brevo-fout', res.status, detail);
      return new Response(
        JSON.stringify({ error: 'Versturen mislukt bij e-mailprovider.' }),
        {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('send-contact-fout', err);
    return new Response(
      JSON.stringify({ error: 'Onverwachte fout bij het versturen.' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});
