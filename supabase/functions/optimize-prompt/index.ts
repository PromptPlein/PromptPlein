// Supabase Edge Function: optimize-prompt
//
// Twee modi:
//   - mode: 'generate' (default) — neemt een techniek-template + doel + ingevulde
//     velden en laat een AI-model een HERBRUIKBARE prompt-template genereren.
//     De eigen inhoud van de gebruiker blijft als [PLAATSHOUDERS] staan zodat
//     ze die zelf in hun eigen chat aanvullen.
//   - mode: 'recommend' — neemt het doel ("Wat wil je bereiken?") + de lijst
//     beschikbare technieken en geeft de best passende technieken terug,
//     gerangschikt met een korte motivatie.
//
// Multi-model met fallback-keten. De client kan een voorkeursprovider sturen
// (`preferredProvider`: 'auto' | 'claude' | 'openai' | 'deepseek'); 'auto'
// gebruikt de standaardvolgorde Claude → GPT-4 → DeepSeek. Faalt alles
// (of ontbreken de keys), dan valt de functie terug op de ruwe template
// (generate) of lokale trefwoord-matching (recommend).
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
type Mode = 'generate' | 'recommend';

/** Beknopte techniekbeschrijving voor de aanbevelingsmodus. */
interface TechniqueSummary {
  id: string;
  name: string;
  description?: string;
  /** De kracht van de techniek — waar is hij sterk in? */
  strength?: string;
  /** Concrete gebruikssituaties. */
  use_cases?: string[];
}

interface RequestBody {
  mode?: Mode;
  techniqueId?: string;
  // 'generate'-velden
  template?: string;
  promptContent?: string;
  followUpAnswers?: Record<string, string>;
  // 'recommend'-velden
  goal?: string;
  techniques?: TechniqueSummary[];
  preferredProvider?: PreferredProvider;
  // Admin-bestuurde AI-instellingen (optioneel; anders defaults).
  systemPrompt?: string;
  toneInstruction?: string;
  temperature?: number;
}

const CLAUDE_MODEL = 'claude-opus-4-8';
const OPENAI_MODEL = 'gpt-4o';
const DEEPSEEK_MODEL = 'deepseek-chat';

const GENERATE_USER_PROMPT = (filled: string) =>
  `Hier is de ingevulde prompt-template. Lever de herbruikbare prompt-template:\n\n${filled}`;

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

const DEFAULT_SYSTEM_PROMPT = `Je bent een expert in prompt-engineering voor de Nederlandse rijksoverheid.
Je krijgt een ingevulde prompt-template die een specifieke prompting-techniek toepast.
Je levert een HERBRUIKBARE prompt-template op in het Nederlands: een sjabloon dat de gebruiker
telkens kan kopiëren en plakken in hun eigen AI-chat.

BELANGRIJK — interne doelgroep:
- De gebruiker is een interne overheidsmedewerker (bijv. beleidsmedewerker, projectleider,
  manager, communicatieadviseur, Secretaris-Generaal (SG) of SGO).
- De prompts zijn UITSLUITEND voor INTERN gebruik binnen de overheid. Richt ze nooit op het
  schrijven vóór of de communicatie náár burgers of externe partijen.
- Gebruik waar passend interne voorbeelden en interne rollen/personas, geen burger-personas.

Richtlijnen:
- Pas de gekozen techniek consequent en herkenbaar toe.
- De velden die de gebruiker heeft ingevuld vormen de STRUCTUUR van de template.
- Laat de plekken waar de gebruiker zélf nog inhoud moet leveren staan als duidelijke
  plaatshouders tussen rechte haken, bijvoorbeeld [PLAATS HIER JE TEKST] of [BESCHRIJF JE SITUATIE].
  Verzín die inhoud NIET; de gebruiker vult dat later zelf in.
- Behoud bestaande [plaatshouders] die al in de input staan; verwijder ze niet.
- Schrijf in duidelijke, professionele taal.
- Geef ALLEEN de prompt-template terug, zonder inleiding, uitleg of opmaak-markeringen.`;

const RECOMMEND_SYSTEM_PROMPT = `Je bent een expert in prompt-engineering voor de Nederlandse rijksoverheid.
Een interne overheidsmedewerker (bijv. beleidsmedewerker, projectleider, manager,
communicatieadviseur, SG of SGO) beschrijft wat die wil bereiken voor INTERN gebruik.

Analyseer het doel en weeg het af tegen de KRACHT en gebruikssituaties van elke techniek.
Kies de best passende technieken (maximaal 3), gerangschikt van meest naar minst geschikt.
Baseer je motivatie expliciet op waar de techniek sterk in is in relatie tot het doel.

Geef UITSLUITEND geldige JSON terug, zonder codeblok of extra tekst, in dit formaat:
{"recommendations":[{"id":"<techniek-id>","reason":"<korte motivatie in 1 zin die de kracht koppelt aan het doel, in het Nederlands>"}]}

Gebruik alleen id's die exact in de lijst voorkomen. Geef minstens 1 en maximaal 3 aanbevelingen.`;

/** Bouw de gebruikersprompt voor de aanbevelingsmodus. */
const RECOMMEND_USER_PROMPT = (goal: string, techniques: TechniqueSummary[]) =>
  `Doel van de gebruiker:\n${goal}\n\nBeschikbare technieken:\n${techniques
    .map((t) => {
      const parts = [`- id: ${t.id}`, `naam: ${t.name}`];
      if (t.description) parts.push(`uitleg: ${t.description}`);
      if (t.strength) parts.push(`kracht: ${t.strength}`);
      if (t.use_cases && t.use_cases.length > 0)
        parts.push(`gebruik voor: ${t.use_cases.join('; ')}`);
      return parts.join(' | ');
    })
    .join('\n')}`;

/** Bouw de systeemprompt uit de admin-hoofdprompt (of default) + toon-instructie. */
function buildSystemPrompt(systemPrompt?: string, tone?: string): string {
  const base = systemPrompt?.trim() ? systemPrompt.trim() : DEFAULT_SYSTEM_PROMPT;
  return tone?.trim() ? `${base}\n\nToon en schrijfstijl: ${tone.trim()}` : base;
}

/** Begrens de temperature tot een veilig bereik; default 0.4. */
function clampTemp(t?: number): number {
  if (typeof t !== 'number' || Number.isNaN(t)) return 0.4;
  return Math.min(1, Math.max(0, t));
}

async function runClaude(
  userMessage: string,
  system: string,
  temperature: number,
): Promise<string> {
  const apiKey = Deno.env.get('CLAUDE_API_KEY');
  if (!apiKey) throw new Error('CLAUDE_API_KEY ontbreekt');

  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 4096,
    temperature,
    system,
    messages: [{ role: 'user', content: userMessage }],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();

  if (!text) throw new Error('Claude gaf een lege respons');
  return text;
}

async function runDeepSeek(
  userMessage: string,
  system: string,
  temperature: number,
): Promise<string> {
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
      temperature,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userMessage },
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

async function runOpenAI(
  userMessage: string,
  system: string,
  temperature: number,
): Promise<string> {
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
      temperature,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userMessage },
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

type ProviderFn = (userMessage: string, system: string, temperature: number) => Promise<string>;

const PROVIDERS: Record<Provider, ProviderFn> = {
  claude: runClaude,
  openai: runOpenAI,
  deepseek: runDeepSeek,
};

const DEFAULT_ORDER: Provider[] = ['claude', 'openai', 'deepseek'];

/** Bouw de fallback-volgorde op basis van de voorkeur van de client. */
function buildOrder(preferred?: PreferredProvider): Provider[] {
  if (!preferred || preferred === 'auto') return DEFAULT_ORDER;
  return [preferred, ...DEFAULT_ORDER.filter((p) => p !== preferred)];
}

interface Recommendation {
  id: string;
  reason: string;
}

/** Parseert het JSON-antwoord van de aanbevelingsmodus robuust. */
function parseRecommendations(raw: string, valid: Set<string>): Recommendation[] {
  // Pak het eerste JSON-object uit de respons (verwijdert eventuele codeblok-randen).
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]) as { recommendations?: Recommendation[] };
    const recs = Array.isArray(parsed.recommendations) ? parsed.recommendations : [];
    return recs
      .filter((r) => r && typeof r.id === 'string' && valid.has(r.id))
      .slice(0, 3)
      .map((r) => ({ id: r.id, reason: typeof r.reason === 'string' ? r.reason : '' }));
  } catch {
    return [];
  }
}

/** Lokale trefwoord-fallback: rangschik technieken op overlap met het doel. */
function localRecommend(goal: string, techniques: TechniqueSummary[]): Recommendation[] {
  const words = new Set(
    goal
      .toLowerCase()
      .split(/[^a-zà-ÿ0-9]+/)
      .filter((w) => w.length > 3),
  );
  const scored = techniques
    .map((t) => {
      const haystack =
        `${t.name} ${t.description ?? ''} ${t.strength ?? ''} ${(t.use_cases ?? []).join(' ')}`.toLowerCase();
      let score = 0;
      for (const w of words) if (haystack.includes(w)) score += 1;
      return { t, score };
    })
    .sort((a, b) => b.score - a.score);
  const top = scored.filter((s) => s.score > 0).slice(0, 3);
  // Niets gematcht: bied de eerste paar technieken aan zodat de gebruiker verder kan.
  const chosen = top.length > 0 ? top : scored.slice(0, 2);
  return chosen.map(({ t }) => ({
    id: t.id,
    reason: 'Mogelijk passend op basis van je doel.',
  }));
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
    const mode: Mode = body.mode === 'recommend' ? 'recommend' : 'generate';
    const order = buildOrder(body.preferredProvider);
    const temperature = clampTemp(body.temperature);

    // --- Aanbevelingsmodus: kies passende technieken bij een doel ---
    if (mode === 'recommend') {
      const goal = body.goal?.trim();
      const techniques = Array.isArray(body.techniques) ? body.techniques : [];
      if (!goal || techniques.length === 0) {
        return new Response(
          JSON.stringify({ success: false, error: 'goal en techniques zijn verplicht' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      const validIds = new Set(techniques.map((t) => t.id));
      const userMessage = RECOMMEND_USER_PROMPT(goal, techniques);
      let recommendations: Recommendation[] = [];
      let provider: Provider | 'local-template' = 'local-template';

      for (const candidate of order) {
        try {
          const raw = await PROVIDERS[candidate](userMessage, RECOMMEND_SYSTEM_PROMPT, 0.2);
          const parsed = parseRecommendations(raw, validIds);
          if (parsed.length > 0) {
            recommendations = parsed;
            provider = candidate;
            break;
          }
        } catch (providerErr) {
          console.error(`${candidate} (recommend) mislukt, probeer volgende:`, providerErr);
        }
      }

      if (recommendations.length === 0) {
        recommendations = localRecommend(goal, techniques);
      }

      return new Response(
        JSON.stringify({ success: true, recommendations, provider }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // --- Generatiemodus: maak een herbruikbare prompt-template ---
    if (!body?.template || !body?.promptContent) {
      return new Response(
        JSON.stringify({ success: false, error: 'template en promptContent zijn verplicht' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const filled = fillTemplate(body.template, body.promptContent, body.followUpAnswers ?? {});
    const system = buildSystemPrompt(body.systemPrompt, body.toneInstruction);
    const userMessage = GENERATE_USER_PROMPT(filled);

    // Doorloop de providers in voorkeursvolgorde; eerste succes wint.
    // Faalt alles (of ontbreken alle keys), dan de ruwe template.
    let optimized = filled;
    let provider: Provider | 'local-template' = 'local-template';

    for (const candidate of order) {
      try {
        optimized = await PROVIDERS[candidate](userMessage, system, temperature);
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
