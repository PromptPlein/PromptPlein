// Supabase Edge Function: auth-email
//
// Send Email Hook van Supabase Auth: Supabase verstuurt zelf geen mail meer, maar
// roept deze functie aan, die de mail via de transactionele mail van Brevo stuurt.
// Zo komt de herstelmail in de huisstijl en van een afzender die de rijksmail kent.
//
// De herstellink gaat niet naar /auth/v1/verify, maar naar de pagina voor een nieuw
// wachtwoord met de token_hash erin. Die pagina gebruikt de token pas als iemand op
// Opslaan drukt. Mailscanners (Safe Links, Umbrella) openen elke link vanzelf, en de
// oude link was daarna al gebruikt.
//
// Andere soorten mail (bevestigen, e-mail wijzigen, uitnodiging) komen nu niet voor:
// bevestigen staat uit. Ze krijgen een eenvoudige mail met de gewone verify-link, zodat
// er niets stil blijft liggen als iemand ze aanzet.
//
// Instellen: Authentication, Hooks, Send Email, HTTPS, met deze function-URL. Het
// geheim dat Supabase daar maakt, komt als SEND_EMAIL_HOOK_SECRET bij de secrets.
//
// Deploy:  supabase functions deploy auth-email --no-verify-jwt
// Secrets: BREVO_API_KEY (staat er al), SEND_EMAIL_HOOK_SECRET

import { Webhook } from 'https://esm.sh/standardwebhooks@1.0.0';

interface HookPayload {
  user: {
    email: string;
    user_metadata?: { full_name?: string | null } | null;
  };
  email_data: {
    token: string;
    token_hash: string;
    redirect_to: string;
    email_action_type: string;
    site_url: string;
    token_new?: string;
    token_hash_new?: string;
  };
}

/** Brevo-template voor de herstelmail. */
const RECOVERY_TEMPLATE = 146;
const SENDER = { name: 'PromptPlein', email: 'roy@awaren.nl' };
const UPDATE_PASSWORD_PATH = '/auth/nieuw-wachtwoord';
const FALLBACK_ORIGIN = 'https://www.promptplein.app';

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Foutvorm die Supabase Auth van een hook verwacht. */
function hookError(message: string, status: number): Response {
  return json({ error: { http_code: status, message } }, status);
}

/**
 * Het adres van de app. Supabase heeft `redirect_to` al tegen de lijst met
 * toegestane adressen gehouden; staat het er niet op, dan is het de Site URL.
 */
function appOrigin(data: HookPayload['email_data']): string {
  for (const candidate of [data.redirect_to, data.site_url]) {
    try {
      const url = new URL(candidate);
      if (url.protocol === 'https:' || url.hostname === 'localhost') return url.origin;
    } catch {
      /* volgende proberen */
    }
  }
  return FALLBACK_ORIGIN;
}

function firstName(fullName: string | null | undefined): string | undefined {
  const first = (fullName ?? '').trim().split(/\s+/)[0];
  return first ? first.slice(0, 60) : undefined;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const FALLBACK_TEXT: Record<string, { subject: string; kop: string; tekst: string; knop: string }> = {
  signup: {
    subject: 'Bevestig je e-mailadres voor PromptPlein',
    kop: 'Bevestig je e-mailadres',
    tekst: 'Klik op de knop om je account op PromptPlein te activeren.',
    knop: 'E-mailadres bevestigen',
  },
  invite: {
    subject: 'Je bent uitgenodigd voor PromptPlein',
    kop: 'Je bent uitgenodigd',
    tekst: 'Klik op de knop om je account op PromptPlein te maken.',
    knop: 'Uitnodiging aannemen',
  },
  magiclink: {
    subject: 'Je inloglink voor PromptPlein',
    kop: 'Inloggen op PromptPlein',
    tekst: 'Klik op de knop om in te loggen.',
    knop: 'Inloggen',
  },
  email_change: {
    subject: 'Bevestig je nieuwe e-mailadres voor PromptPlein',
    kop: 'Bevestig je nieuwe e-mailadres',
    tekst: 'Klik op de knop om de wijziging van je e-mailadres te bevestigen.',
    knop: 'Wijziging bevestigen',
  },
};

function fallbackHtml(kop: string, tekst: string, knop: string, link: string): string {
  const href = escapeHtml(link);
  return `<!DOCTYPE html><html lang="nl"><head><meta charset="utf-8"><title>${kop}</title></head>` +
    `<body style="margin:0;padding:32px;font-family:Arial, Helvetica, sans-serif;color:#1E293B;">` +
    `<h1 style="margin:0 0 12px;font-size:26px;color:#154273;">${kop}</h1>` +
    `<p style="margin:0 0 24px;font-size:16px;line-height:1.7;">${tekst}</p>` +
    `<p style="margin:0 0 24px;"><a href="${href}" style="display:inline-block;background-color:#154273;color:#FFFFFF;` +
    `font-weight:bold;text-decoration:none;padding:14px 20px;border-radius:4px;">${knop}</a></p>` +
    `<p style="margin:0;font-size:14px;color:#475569;">Heb je dit niet zelf gevraagd? Dan hoef je niets te doen.</p>` +
    `</body></html>`;
}

async function sendBrevo(apiKey: string, message: Record<string, unknown>): Promise<boolean> {
  // Docs: https://developers.brevo.com/reference/sendtransacemail
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ sender: SENDER, ...message }),
  });
  if (!res.ok) console.error('Brevo-fout', res.status, await res.text());
  return res.ok;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return hookError('Method not allowed', 405);

  const hookSecret = Deno.env.get('SEND_EMAIL_HOOK_SECRET');
  const apiKey = Deno.env.get('BREVO_API_KEY');
  if (!hookSecret || !apiKey) return hookError('Mailinstellingen ontbreken', 500);

  const raw = await req.text();
  let payload: HookPayload;
  try {
    const wh = new Webhook(hookSecret.replace('v1,whsec_', ''));
    payload = wh.verify(raw, Object.fromEntries(req.headers)) as HookPayload;
  } catch {
    return hookError('Ongeldige handtekening', 401);
  }

  const { user, email_data: data } = payload;
  const to = [{ email: user.email.toLowerCase() }];
  const type = data.email_action_type;
  const origin = appOrigin(data);

  let ok: boolean;
  if (type === 'recovery') {
    const link = new URL(UPDATE_PASSWORD_PATH, origin);
    link.searchParams.set('token_hash', data.token_hash);
    link.searchParams.set('type', 'recovery');
    const voornaam = firstName(user.user_metadata?.full_name);
    ok = await sendBrevo(apiKey, {
      templateId: RECOVERY_TEMPLATE,
      to,
      params: { link: link.toString(), ...(voornaam ? { voornaam } : {}) },
    });
  } else {
    const text = FALLBACK_TEXT[type];
    if (!text) return hookError(`Onbekende mailsoort: ${type}`, 400);
    const verify = new URL(`${Deno.env.get('SUPABASE_URL')}/auth/v1/verify`);
    verify.searchParams.set('token', data.token_hash);
    verify.searchParams.set('type', type);
    verify.searchParams.set('redirect_to', data.redirect_to || data.site_url);
    ok = await sendBrevo(apiKey, {
      to,
      subject: text.subject,
      htmlContent: fallbackHtml(text.kop, text.tekst, text.knop, verify.toString()),
      tags: ['promptplein-account'],
    });
  }

  if (!ok) return hookError('Versturen via Brevo mislukt', 502);
  return json({}, 200);
});
