// Supabase Edge Function: optimize-prompt
//
// Neemt een techniek-template + prompt + vervolgvragen, vult de template,
// en laat een AI-model een geoptimaliseerde prompt genereren.
//
// Multi-model met fallback-keten. De client kan een voorkeursprovider sturen
// (`preferredProvider`: 'auto' | 'claude' | 'openai' | 'deepseek'); 'auto'
// gebruikt de standaardvolgorde Claude → GPT-4 → DeepSeek. Faalt alles
// (of ontbreken de keys), dan valt de functie terug op de ruwe template.
//
// Deploy:  supabase functions deploy optimize-prompt
// Secrets: supabase secrets set CLAUDE_API_KEY=sk-ant-...     (Anthropic)
//          supabase secrets set OPENAI_API_KEY=sk-...         (OpenAI, optioneel)
//          supabase secrets set DEEPSEEK_API_KEY=sk-...       (DeepSeek, optioneel)
//
// Runtime: Deno (Supabase Edge Functions)

import Anthropic from 'npm:@anthropic-ai/sdk@^0.65.0';

type Provider = 'claude' | 'openai' | 'deepseek';
type PreferredProvider = 'auto' | Provider;

interface RequestBody {
  techniqueId?: string;
  template: string;
  promptContent: string;
  followUpAnswers?: Record<string, string>;
  preferredProvider?: PreferredProvider;
}

const CLAUDE_MODEL = 'claude-opus-4-8';
const OPENAI_MODEL = 'gpt-4o';
const DEEPSEEK_MODEL = 'deepseek-chat';

const USER_PROMPT = (filled: string) =>
  `Hier is de ingevulde prompt-template. Lever de geoptimaliseerde prompt:\n\n${filled}`;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** Vult {{PROMPT}} en {{vraag_id}} placeholders in de template. */
function fillTemplate(
  template: string,
  promptContent: string,
  answers: Record<string, string>,
): string {
  let result = template.replace(/\{\{\s*PROMPT\s*\}\}/g, promptContent);
  for (const [key, value] of Object.entries(answers)) {
    const pattern = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
    result = result.replace(pattern, value?.trim() ? value.trim() : `[${key}]`);
  }
  return result.replace(/\{\{\s*([\w-]+)\s*\}\}/g, '[$1]').trim();
}

const SYSTEM_PROMPT = `Je bent een expert in prompt-engineering voor de Nederlandse overheid.
Je krijgt een ingevulde prompt-template die een specifieke prompting-techniek toepast.
Lever één heldere, direct bruikbare geoptimaliseerde prompt op in het Nederlands.

Richtlijnen:
- Behoud de intentie van de oorspronkelijke opdracht.
- Pas de techniek consequent toe.
- Schrijf in duidelijke, professionele taal (waar passend B1-taalniveau).
- Geef ALLEEN de geoptimaliseerde prompt terug, zonder inleiding, uitleg of opmaak-markeringen.`;

async function optimizeWithClaude(filledTemplate: string): Promise<string> {
  const apiKey = Deno.env.get('CLAUDE_API_KEY');
  if (!apiKey) throw new Error('CLAUDE_API_KEY ontbreekt');

  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 4096,
    thinking: { type: 'adaptive' },
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Hier is de ingevulde prompt-template. Lever de geoptimaliseerde prompt:\n\n${filledTemplate}`,
      },
    ],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();

  if (!text) throw new Error('Claude gaf een lege respons');
  return text;
}

async function optimizeWithDeepSeek(filledTemplate: string): Promise<string> {
  const apiKey = Deno.env.get('DEEPSEEK_API_KEY');
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY ontbreekt');

  // DeepSeek gebruikt een OpenAI-compatibele API.
  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      max_tokens: 4096,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Hier is de ingevulde prompt-template. Lever de geoptimaliseerde prompt:\n\n${filledTemplate}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`DeepSeek gaf status ${response.status}`);
  }

  const data = await response.json();
  const text: string = data?.choices?.[0]?.message?.content?.trim() ?? '';
  if (!text) throw new Error('DeepSeek gaf een lege respons');
  return text;
}

async function optimizeWithOpenAI(filledTemplate: string): Promise<string> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) throw new Error('OPENAI_API_KEY ontbreekt');

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      max_tokens: 4096,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: USER_PROMPT(filledTemplate) },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI gaf status ${response.status}`);
  }

  const data = await response.json();
  const text: string = data?.choices?.[0]?.message?.content?.trim() ?? '';
  if (!text) throw new Error('OpenAI gaf een lege respons');
  return text;
}

const PROVIDERS: Record<Provider, (filled: string) => Promise<string>> = {
  claude: optimizeWithClaude,
  openai: optimizeWithOpenAI,
  deepseek: optimizeWithDeepSeek,
};

const DEFAULT_ORDER: Provider[] = ['claude', 'openai', 'deepseek'];

/** Bouw de fallback-volgorde op basis van de voorkeur van de client. */
function buildOrder(preferred?: PreferredProvider): Provider[] {
  if (!preferred || preferred === 'auto') return DEFAULT_ORDER;
  return [preferred, ...DEFAULT_ORDER.filter((p) => p !== preferred)];
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ success: false, error: 'Methode niet toegestaan' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = (await req.json()) as RequestBody;

    if (!body?.template || !body?.promptContent) {
      return new Response(
        JSON.stringify({ success: false, error: 'template en promptContent zijn verplicht' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const filled = fillTemplate(body.template, body.promptContent, body.followUpAnswers ?? {});

    // Doorloop de providers in voorkeursvolgorde; eerste succes wint.
    // Faalt alles (of ontbreken alle keys), dan de ruwe template.
    const order = buildOrder(body.preferredProvider);
    let optimized = filled;
    let provider: Provider | 'local-template' = 'local-template';

    for (const candidate of order) {
      try {
        optimized = await PROVIDERS[candidate](filled);
        provider = candidate;
        break;
      } catch (providerErr) {
        console.error(`${candidate} mislukt, probeer volgende:`, providerErr);
      }
    }

    return new Response(
      JSON.stringify({ success: true, optimized_content: optimized, provider }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Onbekende fout';
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
