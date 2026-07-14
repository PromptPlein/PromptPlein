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
// (`preferredProvider`: 'auto' | 'claude' | 'openai' | 'deepseek' | 'mistral');
// 'auto' gebruikt de standaardvolgorde Claude → GPT-4 → DeepSeek → Mistral.
// Faalt alles (of ontbreken de keys), dan valt de functie terug op de ruwe
// template (generate) of lokale trefwoord-matching (recommend).
//
// Deploy:  supabase functions deploy optimize-prompt
// Secrets: supabase secrets set CLAUDE_API_KEY=sk-ant-...     (Anthropic)
//          supabase secrets set OPENAI_API_KEY=sk-...         (OpenAI, optioneel)
//          supabase secrets set DEEPSEEK_API_KEY=sk-...       (DeepSeek, optioneel)
//          supabase secrets set MISTRAL_API_KEY=...           (Mistral, optioneel)
//
// Runtime: Deno (Supabase Edge Functions)

import Anthropic from 'npm:@anthropic-ai/sdk@^0.65.0';

type Provider = 'claude' | 'openai' | 'deepseek' | 'mistral';
type PreferredProvider = 'auto' | Provider;
type Mode =
  | 'generate'
  | 'recommend'
  | 'recommend-framework'
  | 'framework-fit'
  | 'analyze'
  | 'prefill'
  | 'title'
  | 'metadata'
  | 'plan'
  | 'plan-step';

/** Eén veld van het gekozen prompt framework waar de analyse op toetst. */
interface AnalyzeField {
  id: string;
  label: string;
  placeholder?: string;
}

/** Beknopte techniekbeschrijving voor de aanbevelingsmodus. */
interface TechniqueSummary {
  id: string;
  name: string;
  description?: string;
  /** De kracht van de techniek — waar is hij sterk in? */
  strength?: string;
  /** Concrete gebruikssituaties. */
  use_cases?: string[];
  /**
   * Alleen voor de plan-modus: is dit een compleet raamwerk (CARE, CRISP, …)?
   * De planner mag hoogstens één raamwerk kiezen en zet dat vooraan.
   */
  is_framework?: boolean;
  /**
   * Alleen voor de plan-modus: de vaste uitvoerstructuur van de techniek
   * (persona/template-based/chain-of-thought/…). Helpt de planner de juiste
   * volgorde te kiezen (context eerst, vormgevers daarna, bevraging om materiaal
   * op te halen).
   */
  structure_format?: string;
}

/** Eén ingevuld veld met het label en het antwoord van de gebruiker. */
interface AnsweredField {
  id: string;
  label: string;
  answer: string;
}

interface RequestBody {
  mode?: Mode;
  techniqueId?: string;
  // 'generate'-velden
  template?: string;
  promptContent?: string;
  followUpAnswers?: Record<string, string>;
  // Verrijkende context zodat het model kan synthetiseren i.p.v. invullen.
  techniqueName?: string;
  techniqueDescription?: string;
  techniqueStrength?: string;
  /**
   * Is de gekozen techniek een context-raamwerk (CARE, CRISP, …) dat de hele
   * prompt opbouwt? Behouden voor terugwaartse compatibiliteit; nieuwe clients
   * sturen liever `structureFormat`.
   */
  isContextPrompt?: boolean;
  /**
   * Welke vaste uitvoerstructuur de generator moet afdwingen:
   *  - 'care'             → #-koppen (Rol, Context, Taak/vraag, …).
   *  - 'few-shot'         → rol/taak + Voorbeeld-blokken (Input/Output) + Nieuwe taak.
   *  - 'chain-of-thought' → rol/taak + interactieve stap-voor-stap-werkwijze + stapvragen.
   *  - 'persona'          → taak gericht op een ontvanger + Doel/Focus/Toon + inhoud-plaatshouder.
   *  - 'multi-persona'    → vraagstuk vanuit meerdere persona's + gezamenlijke conclusie.
   *  - 'template-based'   → taak + genummerde rubrieken + regels + Project/Context-plaatshouders.
   *  - 'meta'             → doel + ruwe prompt + verbeterinstructie (rol/context/taak/format) + max. 3 vragen.
   *  - 'socratic'         → Socratische interviewer: één vraag tegelijk om aannames bloot te leggen.
   * Ontbreekt dit, dan valt 'care' terug op `isContextPrompt` (oude clients).
   */
  structureFormat?:
    | 'care'
    | 'few-shot'
    | 'chain-of-thought'
    | 'persona'
    | 'multi-persona'
    | 'template-based'
    | 'meta'
    | 'socratic';
  /** De ingevulde velden mét hun labels, voor analyse. */
  answeredFields?: AnsweredField[];
  // 'recommend'-velden
  goal?: string;
  techniques?: TechniqueSummary[];
  // 'plan-step'-velden: verzamel het materiaal voor één stap uit het plan.
  /** De titel van de huidige stap (bijv. "Bepaal voor wie het plan is"). */
  stepTitle?: string;
  /** Wat deze stap moet opleveren: persona/format/brief/text. */
  stepProduces?: 'persona' | 'format' | 'brief' | 'text';
  /** Naam van de techniek van deze stap, voor context in de prompt. */
  stepTechniqueName?: string;
  /**
   * Compacte tekst van het materiaal dat eerdere stappen al opleverden. Dit is
   * de letterlijke "dat wat gemaakt is gebruikt voor de volgende stap": de AI
   * bouwt het materiaal van deze stap voort op wat er al ligt.
   */
  outcomesSummary?: string;
  /**
   * Is dit een INTERACTIEVE stap (chain-of-thought / socratic)? Dan stelt de AI
   * één vraag tegelijk (VRAAG:/KLAAR:-protocol) i.p.v. het materiaal in één keer
   * uit te schrijven.
   */
  stepInteractive?: boolean;
  /** Het vraag-na-vraag-transcript tot nu toe (interactieve stap). */
  transcript?: { question: string; answer: string }[];
  // 'analyze'-velden: toets de eigen prompt aan de eisen van het prompt framework.
  ownPrompt?: string;
  analyzeFields?: AnalyzeField[];
  /**
   * 'recommend-framework': optionele toelichting van de gebruiker uit de
   * heranalyse-lus. Nadat de AI aangaf welke context nog ontbrak, vult de
   * gebruiker dit aan; de heranalyse weegt het mee als extra context.
   */
  clarification?: string;
  // 'title'-velden: vat een gegenereerde template samen tot een korte titel.
  templateContent?: string;
  // 'metadata'-velden: stel titel + omschrijving + best passende categorie voor.
  metaCategories?: { id: string; name: string; description?: string }[];
  preferredProvider?: PreferredProvider;
  /**
   * Het concrete API-model binnen de gekozen provider (bijv. 'claude-opus-4-8').
   * Wordt alleen toegepast op de provider die met `preferredProvider` overeenkomt;
   * valt een optimalisatie terug op een andere provider, dan gebruikt die zijn
   * eigen standaardmodel. Leeg/ongeldig = standaardmodel van de provider.
   */
  preferredModel?: string;
  // Admin-bestuurde AI-instellingen (optioneel; anders defaults).
  systemPrompt?: string;
  toneInstruction?: string;
  temperature?: number;
}

// Het EERSTE model per provider is de standaard; de overige zijn toegestane
// alternatieven die de admin in de instellingen kan kiezen. Houd dit in sync met
// `src/config/aiModels.ts` (PROVIDER_MODELS).
const PROVIDER_MODELS: Record<Provider, string[]> = {
  claude: ['claude-opus-4-8', 'claude-sonnet-4-6', 'claude-haiku-4-5'],
  openai: ['gpt-5.5', 'gpt-5.5-pro', 'gpt-5.4', 'gpt-5.4-mini', 'gpt-5.4-nano'],
  // deepseek-chat/-reasoner zijn aliassen die op 2026-07-24 vervallen; gebruik de V4-ids.
  deepseek: ['deepseek-v4-flash', 'deepseek-v4-pro'],
  mistral: ['mistral-small-latest', 'ministral-8b-latest', 'ministral-3b-latest'],
};

const CLAUDE_MODEL = PROVIDER_MODELS.claude[0];
const OPENAI_MODEL = PROVIDER_MODELS.openai[0];
const DEEPSEEK_MODEL = PROVIDER_MODELS.deepseek[0];
const MISTRAL_MODEL = PROVIDER_MODELS.mistral[0];

/**
 * Kies het model voor `candidate`. Alleen wanneer de admin-voorkeur dezelfde
 * provider is én het gevraagde model bij die provider hoort, gebruiken we dat;
 * anders het standaardmodel. Zo krijgt een fallback-provider nooit een model-id
 * van een andere provider.
 */
function resolveModel(
  candidate: Provider,
  preferred: PreferredProvider | undefined,
  preferredModel: string | undefined,
): string {
  if (
    preferred === candidate &&
    preferredModel &&
    PROVIDER_MODELS[candidate].includes(preferredModel)
  ) {
    return preferredModel;
  }
  return PROVIDER_MODELS[candidate][0];
}

/**
 * Haalt de #-koppen uit een raamwerk-template, in volgorde van voorkomen.
 * Bijv. "# CONTEXT:\n..." → "CONTEXT". Zo kan de generator de EIGEN koppen van
 * het gekozen raamwerk afdwingen (CARE, CRISPE, CO-STAR, … hebben elk andere).
 */
function extractHeadings(template: string): string[] {
  const headings: string[] = [];
  const seen = new Set<string>();
  // Match regels die met één of meer hekjes beginnen en op een dubbele punt eindigen.
  const re = /^#+\s*([^\n:]+?)\s*:/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(template)) !== null) {
    const name = m[1].trim();
    const key = name.toLowerCase();
    if (name && !seen.has(key)) {
      seen.add(key);
      headings.push(name);
    }
  }
  return headings;
}

/**
 * Bouwt de gebruikersprompt voor generatie: techniekcontext + de losse,
 * gelabelde antwoorden van de gebruiker + de gevulde template als structuur.
 * Zo kan het model de antwoorden analyseren en uitschrijven i.p.v. invullen.
 */
const GENERATE_USER_PROMPT = (args: {
  filled: string;
  techniqueName?: string;
  techniqueDescription?: string;
  techniqueStrength?: string;
  answeredFields?: AnsweredField[];
  promptContent?: string;
  structureFormat?:
    | 'care'
    | 'few-shot'
    | 'chain-of-thought'
    | 'persona'
    | 'multi-persona'
    | 'template-based'
    | 'meta'
    | 'socratic';
}) => {
  const parts: string[] = [];

  const techLines = [
    args.techniqueName ? `Naam: ${args.techniqueName}` : '',
    args.techniqueDescription ? `Beschrijving: ${args.techniqueDescription}` : '',
    args.techniqueStrength ? `Doel/kracht: ${args.techniqueStrength}` : '',
  ].filter(Boolean);
  if (techLines.length > 0) {
    parts.push(`GEKOZEN TECHNIEK:\n${techLines.join('\n')}`);
  }

  const answered = (args.answeredFields ?? []).filter((f) => f.answer?.trim());
  if (answered.length > 0) {
    parts.push(
      `ANTWOORDEN VAN DE GEBRUIKER (analyseer en verwerk deze, neem ze niet letterlijk over):\n` +
        answered.map((f) => `- ${f.label}: ${f.answer.trim()}`).join('\n'),
    );
  }

  if (args.promptContent?.trim() && args.promptContent.trim() !== '[BESCHRIJF HIER WAT JE WILT BEREIKEN]') {
    parts.push(`STARTPUNT / EIGEN TEKST VAN DE GEBRUIKER:\n${args.promptContent.trim()}`);
  }

  parts.push(
    `STRUCTUUR-REFERENTIE (de techniek-template, alleen ter ondersteuning van de opbouw):\n${args.filled}`,
  );

  parts.push(
    `Schrijf nu één rijke, volledig uitgewerkte en direct bruikbare prompt-template die alle ` +
      `bovenstaande antwoorden combineert. Laat het doel${args.answeredFields?.some((f) => /persona/i.test(f.label)) ? ' en de persona' : ''} duidelijk naar voren komen.`,
  );

  if (args.structureFormat === 'care') {
    // De koppen verschillen per raamwerk (CARE: Context/Ask/Rules/Examples;
    // CRISPE: Context/Role/Instructions/…; CO-STAR: Context/Objective/…).
    // Leid ze af uit de template van het GEKOZEN raamwerk i.p.v. vaste koppen.
    const headings = extractHeadings(args.filled);
    if (headings.length > 0) {
      parts.push(
        `Houd je STRIKT aan de koppen van het gekozen raamwerk, in deze exacte volgorde:\n` +
          headings.map((h) => `#${h}:`).join('\n') +
          `\n\nGebruik PRECIES deze koppen — niet meer, niet minder, en geen andere namen. Begin elke ` +
          `kop met een hekje (#), de naam en een dubbele punt; zet de inhoud op de regel(s) eronder, ` +
          `met een lege regel tussen de blokken. Vul elke kop volledig uit op basis van de antwoorden.`,
      );
    }
  } else if (args.structureFormat === 'few-shot') {
    parts.push(
      `Houd je strikt aan de verplichte Few-Shot-structuur: een korte rol/taak-intro, daarna ` +
        `2 à 3 genummerde voorbeelden met telkens een regel "Input:" en een regel "Output:", en ` +
        `tot slot een blok "Nieuwe taak:" met "Input: [plak hier je eigen invoer]" en een lege "Output:".`,
    );
  } else if (args.structureFormat === 'chain-of-thought') {
    parts.push(
      `Houd je strikt aan de verplichte Chain-of-Thought-structuur. Cruciaal: de gegenereerde prompt ` +
        `moet de AI laten werken via een interactieve dialoog — telkens MAAR ÉÉN vraag tegelijk, wachten ` +
        `op het antwoord, en op basis daarvan een vervolg-/wedervraag stellen, net zo lang tot de kern ` +
        `van het vraagstuk helder is. De genummerde stappen zijn een MINIMUM; de AI mag zelf aanvullende ` +
        `vervolgvragen bedenken. Het eindproduct komt PAS nadat alle stappen zijn doorlopen.`,
    );
  } else if (args.structureFormat === 'persona') {
    parts.push(
      `Houd je strikt aan de verplichte Persona-structuur: een taak-zin gericht op de ontvanger/persona, ` +
        `daarna de regels "Doel:", "Focus:" en "Toon:", een inhoud-regel met een [plaatshouder] voor de eigen ` +
        `tekst, en een korte slotinstructie. Beschrijf bij Focus niet alleen de functie, maar ook wat deze ` +
        `persoon nodig heeft om goed te kunnen reageren.`,
    );
  } else if (args.structureFormat === 'multi-persona') {
    parts.push(
      `Houd je strikt aan de verplichte Multi-Persona-structuur: een openingszin met het aantal persona's, ` +
        `een genummerde lijst van de persona's met hun belangen, een blok "Vraagstuk:" met een [plaatshouder], ` +
        `een blok "Laat elke persona kort reageren op:" met de bullets (Wat valt op? / Welke risico's? / ` +
        `Welke kans? / Welke vraag moet nog beantwoord worden?), en een afsluitende gezamenlijke conclusie.`,
    );
  } else if (args.structureFormat === 'template-based') {
    parts.push(
      `Houd je strikt aan de verplichte Sjabloon-structuur: een taak-zin die het vaste format aankondigt, ` +
        `een genummerde lijst met de rubrieken/kopjes in de juiste volgorde, een regel-blok met de eisen ` +
        `(lengte, toon, opmaak én wat niet mag ontbreken), en tot slot plaatshouders voor de eigen inhoud ` +
        `(bijv. "Project: [naam project]" en "Context: [plak hier je informatie]").`,
    );
  } else if (args.structureFormat === 'meta') {
    parts.push(
      `Houd je strikt aan de verplichte Meta-structuur: een doel-zin met [plaatshouder], een blok met de ` +
        `ruwe prompt van de gebruiker, de instructie om de prompt EERST te verbeteren met rol, context, taak, ` +
        `formaat en parameters (grenzen), "Stel maximaal 3 verduidelijkende vragen als informatie ontbreekt", ` +
        `en tot slot "Geef daarna de verbeterde prompt die ik direct kan gebruiken". De AI geeft dus niet meteen ` +
        `het inhoudelijke antwoord, maar maakt eerst de prompt scherper.`,
    );
  } else if (args.structureFormat === 'socratic') {
    parts.push(
      `Houd je strikt aan de verplichte Socratische interview-structuur: een rol-zin (Socratische interviewer ` +
        `die geen antwoorden/oordelen geeft), een doel (verborgen aannames blootleggen), gedragsregels ` +
        `(telkens MAAR ÉÉN vraag tegelijk, wachten op antwoord, voortbouwen op het vorige antwoord, neutraal ` +
        `blijven, geen ja/nee- of sturende vragen), de 6 soorten Socratische vragen, een stopconditie ` +
        `(ong. 5-7 vragen), en een afsluitende neutrale samenvatting van de blootgelegde aannames.`,
    );
  }

  return parts.join('\n\n');
};

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

/**
 * Sentinel waarmee het model aangeeft dat de input onbegrijpelijk/onsamenhangend
 * is en het er GEEN zinnige prompt van kan maken. Het model zet deze regel als
 * ALLEREERSTE regel van zijn antwoord, gevolgd door een korte uitleg. De server
 * detecteert dit en blokkeert het genereren i.p.v. een verzonnen casus terug te geven.
 */
const UNCLEAR_SENTINEL = 'ONDUIDELIJKE_INVOER';

/**
 * Instructie die aan ELKE generatie-systeemprompt wordt toegevoegd: koppel
 * eerlijk terug wanneer de input nergens op slaat, in plaats van een casus te
 * verzinnen. Dit is bewust streng — de gebruiker wil dat zijn exacte input
 * serieus wordt genomen, niet dat de AI er zelf iets bij bedenkt.
 */
const CLARITY_GATE_INSTRUCTION = `EERST CONTROLEREN — neem de input van de gebruiker letterlijk serieus:
Beoordeel, vóór je iets schrijft, of de antwoorden en/of de eigen tekst van de gebruiker
samen een herkenbare, echte bedoeling vormen. Verzin NOOIT zelf een onderwerp, doel,
casus, doelgroep of inhoud die de gebruiker niet heeft aangeleverd.

Als de input onsamenhangend, betekenisloos of pure onzin is — bijvoorbeeld losse letters,
herhaalde tekens of toetsaanslagen ("A-B-B", "C-C-C", "asdf", "test test"), of antwoorden
die niets met elkaar of met de vraag te maken hebben — dan mag je GEEN prompt-template maken.
Geef in dat geval UITSLUITEND dit terug, zonder iets anders:
${UNCLEAR_SENTINEL}
<één korte, vriendelijke zin in het Nederlands die uitlegt wat er onduidelijk is en wat de
gebruiker kan aanvullen of verduidelijken>

Twijfel je of de input zinnig is maar zit er een herkenbare kern in? Bouw dan gewoon de
template op basis van wat de gebruiker écht heeft gegeven, zonder de ontbrekende delen te
verzinnen — laat die als [plaatshouder] staan. Gebruik de ${UNCLEAR_SENTINEL}-regel alleen
als er echt geen bruikbare bedoeling uit de input te halen valt.`;

/**
 * JSON-variant van de clarity-gate voor modi die al JSON teruggeven (recommend,
 * prefill). Het model geeft dan {"unclear":true,"reason":"…"} i.p.v. de normale
 * payload. `detectUnclearJson` vangt dit server-side af.
 */
const CLARITY_GATE_JSON_INSTRUCTION = `EERST CONTROLEREN: beoordeel of de tekst van de gebruiker een herkenbare, echte bedoeling bevat.
Verzin zelf NOOIT een onderwerp of bedoeling die de gebruiker niet heeft aangeleverd. Is de tekst
onsamenhangend, betekenisloos of pure onzin (losse letters, herhaalde tekens of toetsaanslagen zoals
"A-B-B", "C-C-C", "asdf", "test test"), doe dan NIETS van het bovenstaande en geef in plaats daarvan
uitsluitend dit terug:
{"unclear":true,"reason":"<één korte, vriendelijke zin in het Nederlands die uitlegt wat onduidelijk is en wat de gebruiker kan verduidelijken>"}`;

const DEFAULT_SYSTEM_PROMPT = `Je bent een expert in prompt-engineering voor de Nederlandse rijksoverheid.
Een interne overheidsmedewerker heeft losse antwoorden gegeven via een prompting-techniek.
Jouw taak: ANALYSEER al die antwoorden en SCHRIJF op basis daarvan één rijke, volledig
uitgewerkte, direct bruikbare prompt-template in het Nederlands die de gebruiker in hun eigen
AI-chat kan plakken.

WERKWIJZE — analyseren en uitschrijven (niet letterlijk overnemen):
- Neem de antwoorden NIET één-op-één over. Combineer ze tot vloeiende, samenhangende instructies.
- Verwerk elk antwoord betekenisvol: leid uit de losse antwoorden een compleet beeld af van de
  persona, de context, het doel en de gewenste uitkomst, en schrijf dat volledig uit.
- Laat het specifieke doel en (waar van toepassing) de persona duidelijk en expliciet naar voren komen.
- Maak de prompt uitgebreider en concreter dan de input: voeg passende structuur, duidelijke
  instructies en waar nuttig een gewenst format toe — zonder de intentie van de gebruiker te veranderen.
- Pas de gekozen techniek consequent en herkenbaar toe (bijv. echt redeneren bij Chain-of-Thought,
  echt vanuit de persona schrijven bij Persona Prompting).

PLAATSHOUDERS:
- Laat ALLEEN de plekken die de gebruiker écht per keer zelf moet aanvullen staan als duidelijke
  plaatshouder tussen rechte haken, bijv. [PLAK HIER DE NOTITIE] of [BESCHRIJF DE CASUS].
- Verzín geen concrete inhoud voor die plekken; maar schrijf de omliggende instructies wél volledig uit.
- Behoud bestaande [plaatshouders] die al in de input staan.

INTERNE DOELGROEP:
- De gebruiker is een interne overheidsmedewerker (bijv. beleidsmedewerker, projectleider,
  manager, communicatieadviseur, Secretaris-Generaal (SG) of SGO).
- De prompts zijn UITSLUITEND voor INTERN gebruik. Richt ze nooit op het schrijven vóór of de
  communicatie náár burgers of externe partijen. Gebruik interne personas, geen burger-personas.

UITVOER:
- Schrijf in duidelijke, professionele taal (waar passend B1-taalniveau).
- Geef ALLEEN de prompt-template terug, zonder inleiding, uitleg of opmaak-markeringen.`;

const RECOMMEND_SYSTEM_PROMPT = `Je bent een expert in prompt-engineering voor de Nederlandse rijksoverheid.
Een interne overheidsmedewerker (bijv. beleidsmedewerker, projectleider, manager,
communicatieadviseur, SG of SGO) beschrijft wat die wil bereiken voor INTERN gebruik.

Analyseer het doel en weeg het af tegen de KRACHT en gebruikssituaties van elke techniek.
Kies de best passende technieken (maximaal 3), gerangschikt van meest naar minst geschikt.
Baseer je motivatie expliciet op waar de techniek sterk in is in relatie tot het doel.

Geef per aanbeveling TWEE dingen:
- "reason": één korte zin die de kracht van de techniek koppelt aan het doel.
- "value": één KORTE, bondige zin (max. ~20 woorden) die concreet zegt waarom dit precies de
  beste optie is voor DIT vraagstuk. Verwijs kort naar de case (het onderwerp/de doelgroep/het
  soort taak uit het doel), geen opsomming, geen algemeenheden, niet uitweiden.

${CLARITY_GATE_JSON_INSTRUCTION}

Anders geef je UITSLUITEND geldige JSON terug, zonder codeblok of extra tekst, in dit formaat:
{"recommendations":[{"id":"<techniek-id>","reason":"<korte motivatie in 1 zin die de kracht koppelt aan het doel, in het Nederlands>","value":"<1 korte zin (max ~20 woorden) waarom dit de beste optie is voor precies dit vraagstuk, in het Nederlands>"}]}

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

// --- Plan-modus: stel een geordend meerstaps-recept van technieken samen ---
// De doel-flow bouwt niet één losse techniek in, maar combineert er meerdere tot
// één herbruikbare template. De planner bepaalt WELKE technieken in WELKE volgorde
// nodig zijn. Het maakt hier nog GEEN template of inhoud — alleen het plan.
const PLAN_SYSTEM_PROMPT = `Je bent een expert in prompt-engineering voor de Nederlandse rijksoverheid.
Een interne overheidsmedewerker beschrijft wat die wil bereiken. Jouw taak: stel een SLIM,
GEORDEND PLAN op van prompttechnieken die SAMEN één sterke, herbruikbare prompt-template opbouwen.

Denk na over welke technieken elkaar aanvullen en in welke VOLGORDE ze horen:
- Bepaal EERST de context/doelgroep (persona of multi-persona) als dat relevant is.
- Kies DAARNA een uitvoerstructuur/format (template-based output) als er een vaste vorm nodig is.
- Gebruik verdiepende bevraging (chain-of-thought, socratic) om de inhoud scherp te krijgen.
- De LAATSTE stap stelt alles samen tot de uiteindelijke template (produces: "text").
- Gebruik HOOGSTENS één compleet raamwerk (is_framework=true) en zet dat vooraan.
- Kies alleen technieken die het doel echt nodig heeft: liever 2–3 goede stappen dan alles.
- Maximaal 5 stappen.

Geef per stap:
- "technique_id": exact een id uit de lijst.
- "title": korte Nederlandse staptitel (bijv. "Bepaal voor wie het plan is").
- "rationale": één zin die uitlegt waarom deze techniek hier hoort.
- "produces": één van "persona" | "format" | "brief" | "text".

${CLARITY_GATE_JSON_INSTRUCTION}

Anders geef je UITSLUITEND geldige JSON terug, zonder codeblok of extra tekst, in dit formaat:
{"summary":"<1–2 zinnen die het recept samenvatten, in het Nederlands>","steps":[{"technique_id":"<id>","title":"<staptitel>","rationale":"<waarom deze techniek hier, 1 zin>","produces":"persona|format|brief|text"}]}

Gebruik alleen id's die exact in de lijst voorkomen. Geef minstens 1 en maximaal 5 stappen; de laatste stap produces "text".`;

/** Bouw de gebruikersprompt voor de plan-modus. */
const PLAN_USER_PROMPT = (goal: string, techniques: TechniqueSummary[]) =>
  `Doel van de gebruiker:\n${goal}\n\nBeschikbare technieken:\n${techniques
    .map((t) => {
      const parts = [`- id: ${t.id}`, `naam: ${t.name}`];
      if (t.description) parts.push(`uitleg: ${t.description}`);
      if (t.strength) parts.push(`kracht: ${t.strength}`);
      if (t.use_cases && t.use_cases.length > 0)
        parts.push(`gebruik voor: ${t.use_cases.join('; ')}`);
      if (t.is_framework) parts.push('type: compleet raamwerk');
      if (t.structure_format) parts.push(`structuur: ${t.structure_format}`);
      return parts.join(' | ');
    })
    .join('\n')}`;

// --- Plan-step-modus (materiaal): verzamel de inhoud van ÉÉN stap ---
// KRITIEK: deze modus produceert GEEN template met plaatshouders (dat doet alleen
// mode:'generate' in de laatste stap). Hij schrijft ECHT MATERIAAL uit — een
// uitgewerkte persona, concrete format-rubrieken, een korte brief — dat als
// context aan de volgende stap wordt doorgegeven. Zo stapelen plaatshouders niet
// en ontstaat er geen prompt-die-een-prompt-maakt.
const PLAN_STEP_MATERIAL_SYSTEM_PROMPT = `Je bent een expert in prompt-engineering voor de Nederlandse rijksoverheid.
Je bouwt STAP VOOR STAP materiaal op waarmee straks één sterke, herbruikbare prompt-template wordt
samengesteld. Dit is één tussenstap — nog NIET de eindtemplate.

Schrijf UITSLUITEND het concrete materiaal voor deze stap uit, gebaseerd op het doel en het materiaal
van eerdere stappen:
- Levert de stap een PERSONA op → beschrijf de doelgroep/rol(len): wie zijn het, wat hebben ze nodig,
  welke toon en welk detailniveau passen daarbij.
- Levert de stap een FORMAT op → geef de concrete structuur/rubrieken die bij dit doel en deze
  doelgroep passen (genummerd of als kopjes), afgestemd op wat eerdere stappen opleverden.
- Levert de stap een BRIEF op → vat de inhoudelijke kern bondig samen: aanleiding, doel, scope,
  aandachtspunten.

BELANGRIJK:
- Schrijf ECHTE inhoud, GEEN plaatshouders zoals [zo], GEEN meta-instructies aan een AI, GEEN
  volledige prompt-template. Alleen het materiaal zelf.
- Bouw voort op het materiaal van eerdere stappen; herhaal het niet, maar sluit erop aan.
- Dit is voor INTERN overheidsgebruik; gebruik interne persona's, geen burger-persona's.
- Schrijf in duidelijke, professionele taal (waar passend B1-niveau).
- Houd het bondig en bruikbaar (enkele zinnen tot een korte opsomming).

${CLARITY_GATE_JSON_INSTRUCTION}

Anders geef je ALLEEN het uitgeschreven materiaal terug als platte tekst, zonder inleiding, kop of
opmaak-markeringen.`;

/** Bouw de gebruikersprompt voor één materiaal-stap (plan-step-modus). */
const PLAN_STEP_MATERIAL_USER_PROMPT = (args: {
  goal: string;
  stepTitle?: string;
  stepProduces?: string;
  stepTechniqueName?: string;
  outcomesSummary?: string;
}) => {
  const parts: string[] = [`DOEL VAN DE GEBRUIKER:\n${args.goal}`];
  if (args.outcomesSummary && args.outcomesSummary.trim()) {
    parts.push(`MATERIAAL UIT EERDERE STAPPEN:\n${args.outcomesSummary.trim()}`);
  }
  const wat: string[] = [];
  if (args.stepTitle) wat.push(`Stap: ${args.stepTitle}`);
  if (args.stepTechniqueName) wat.push(`Techniek: ${args.stepTechniqueName}`);
  const producesLabel =
    args.stepProduces === 'persona'
      ? 'een uitgewerkte persona/doelgroep'
      : args.stepProduces === 'format'
        ? 'een concrete format-structuur met rubrieken'
        : args.stepProduces === 'brief'
          ? 'een bondige inhoudelijke brief'
          : 'het gevraagde materiaal';
  wat.push(`Wat je nu levert: ${producesLabel}.`);
  parts.push(`WAT JE NU LEVERT:\n${wat.join('\n')}`);
  return parts.join('\n\n');
};

// --- Plan-step-modus (interactief): vraag-na-vraag chain-of-thought/socratic ---
// Anders dan de materiaal-tak schrijft deze NIET meteen materiaal uit, maar voert
// een kort interview: ÉÉN vraag tegelijk tot er genoeg bekend is, dan een bondige
// brief. Sentinel-protocol zodat de client weet wat te doen:
//   VRAAG: <één vraag>        → er is nog input nodig
//   KLAAR: <geconsolideerde brief> → genoeg info, dit is het materiaal
const PLAN_STEP_INTERVIEW_SYSTEM_PROMPT = `Je bent een expert in prompt-engineering voor de Nederlandse rijksoverheid.
Je helpt een interne medewerker STAP VOOR STAP de inhoud van één tussenstap scherp te krijgen via een
kort interview. Dit is nog NIET de eindtemplate — je verzamelt materiaal.

Werkwijze — houd je STRIKT aan dit protocol:
- Stel telkens ÉÉN concrete, korte vraag die de inhoud verder aanscherpt. Bouw voort op het doel, het
  materiaal van eerdere stappen en de al gegeven antwoorden. Herhaal geen eerder gestelde vraag.
- Zolang je nog een vraag nodig hebt, antwoord je met exact één regel die begint met "VRAAG:" gevolgd
  door je vraag. Geen inleiding, geen extra tekst.
- Zodra je genoeg weet (meestal na 2 tot 5 vragen), stop je met vragen en geef je een bondige,
  goed gestructureerde brief die alle input samenvat. Antwoord dan met "KLAAR:" gevolgd door die brief.
- Stel NOOIT meerdere vragen tegelijk. Verzin GEEN antwoorden namens de gebruiker.
- Schrijf ECHTE inhoud in de brief, GEEN plaatshouders, GEEN prompt-template, GEEN meta-instructies.
- Dit is voor INTERN overheidsgebruik; gebruik interne persona's, geen burger-persona's.
- Schrijf in duidelijke, professionele taal (waar passend B1-niveau).

${CLARITY_GATE_JSON_INSTRUCTION}`;

/** Bouw de gebruikersprompt voor één interview-beurt (interactieve plan-step). */
const PLAN_STEP_INTERVIEW_USER_PROMPT = (args: {
  goal: string;
  stepTitle?: string;
  stepTechniqueName?: string;
  outcomesSummary?: string;
  transcript?: { question: string; answer: string }[];
}) => {
  const parts: string[] = [`DOEL VAN DE GEBRUIKER:\n${args.goal}`];
  if (args.outcomesSummary && args.outcomesSummary.trim()) {
    parts.push(`MATERIAAL UIT EERDERE STAPPEN:\n${args.outcomesSummary.trim()}`);
  }
  const wat: string[] = [];
  if (args.stepTitle) wat.push(`Stap: ${args.stepTitle}`);
  if (args.stepTechniqueName) wat.push(`Techniek: ${args.stepTechniqueName}`);
  parts.push(`DEZE STAP:\n${wat.join('\n')}`);
  const turns = args.transcript ?? [];
  if (turns.length === 0) {
    parts.push('GESPREK TOT NU TOE:\n(nog geen vragen gesteld — stel je eerste vraag)');
  } else {
    parts.push(
      `GESPREK TOT NU TOE:\n${turns
        .map((t, i) => `V${i + 1}: ${t.question}\nA${i + 1}: ${t.answer}`)
        .join('\n')}`,
    );
  }
  parts.push(
    'Stel je volgende vraag ("VRAAG: …"), of rond af met de brief ("KLAAR: …") als je genoeg weet.',
  );
  return parts.join('\n\n');
};

/**
 * Parseert het VRAAG:/KLAAR:-sentinel-antwoord van een interview-beurt.
 * Onparseerbaar (geen sentinel) → behandel als afgerond materiaal i.p.v.
 * vastlopen: degradeert veilig naar een brief.
 */
function parseInterviewTurn(raw: string): { question?: string; material?: string } {
  const text = raw.trim();
  const vraag = text.match(/(?:^|\n)\s*VRAAG:\s*([\s\S]+?)\s*$/i);
  const klaar = text.match(/(?:^|\n)\s*KLAAR:\s*([\s\S]+)$/i);
  // "KLAAR:" wint: als het model afrondt is dat het eindmateriaal.
  if (klaar && klaar[1].trim()) return { material: klaar[1].trim() };
  if (vraag && vraag[1].trim()) {
    // Pak alleen de eerste regel als vraag; negeer eventuele nakomende tekst.
    const q = vraag[1].trim().split('\n')[0].trim();
    if (q) return { question: q };
  }
  // Geen herkenbare sentinel → veilige degradatie: gebruik de ruwe tekst als brief.
  return { material: text };
}

const RECOMMEND_FRAMEWORK_SYSTEM_PROMPT = `Je bent een expert in prompt-engineering voor de Nederlandse rijksoverheid.
Een interne overheidsmedewerker heeft een EIGEN prompt geschreven en wil die optimaliseren met een
prompt framework (een compleet raamwerk dat de hele prompt structureert, bijv. CARE, CRISP, CO-STAR).

Analyseer de geschreven prompt: wat is het doel, wat voor soort tekst/taak is het, wat ontbreekt er
nog aan structuur? Kies daarna de best passende prompt frameworks (maximaal 3), gerangschikt van
meest naar minst geschikt. Baseer je motivatie expliciet op de inhoud van de prompt in relatie tot
waar het raamwerk sterk in is.

Geef per aanbeveling TWEE dingen:
- "reason": één korte zin die de kracht van het raamwerk koppelt aan deze prompt.
- "value": één KORTE, bondige zin (max. ~20 woorden) die concreet zegt waarom dit raamwerk nuttig
  is voor precies DIT vraagstuk. Verwijs kort naar de case (het onderwerp/de doelgroep/het soort tekst),
  geen opsomming, geen algemeenheden, niet uitweiden.

Geef daarnaast "missingContext": een korte lijst (0–4 punten) van concrete context die NOG ONTBREEKT
in de prompt en die — als de gebruiker die aanvult — een scherpere prompt-template zou opleveren.
Denk aan: doelgroep/ontvanger, gewenste lengte/vorm, toon, doel of beoogd effect, concrete
onderwerpsafbakening, voorbeelden, randvoorwaarden. Elk punt is één korte, vriendelijke zin die de
gebruiker uitnodigt iets te verduidelijken (bijv. "Voor wie is deze tekst bedoeld?"). Is de prompt al
volledig genoeg, geef dan een lege lijst.

Geef UITSLUITEND geldige JSON terug, zonder codeblok of extra tekst, in dit formaat:
{"summary":"<1 zin: wat voor prompt dit is en wat het beste raamwerk eraan toevoegt, in het Nederlands>","missingContext":["<kort punt dat nog mist, in het Nederlands>"],"recommendations":[{"id":"<framework-id>","reason":"<korte motivatie in 1 zin die de kracht van het raamwerk koppelt aan deze prompt, in het Nederlands>","value":"<1 korte zin (max ~20 woorden) waarom dit raamwerk nuttig is voor precies dit vraagstuk, in het Nederlands>"}]}

Gebruik alleen id's die exact in de lijst voorkomen. Geef minstens 1 en maximaal 3 aanbevelingen.`;

/**
 * Bouw de gebruikersprompt voor de framework-aanbevelingsmodus (eigen-prompt-flow).
 * `clarification` (optioneel) bevat eerdere toelichtingen van de gebruiker uit de
 * heranalyse-lus: extra context die de gebruiker zelf heeft aangevuld nadat de AI
 * aangaf wat er nog ontbrak. Die weegt de AI expliciet mee.
 */
const RECOMMEND_FRAMEWORK_USER_PROMPT = (
  ownPrompt: string,
  frameworks: TechniqueSummary[],
  clarification?: string,
) =>
  `PROMPT VAN DE GEBRUIKER (analyseer deze):\n"""\n${ownPrompt}\n"""\n\n` +
  (clarification && clarification.trim()
    ? `AANVULLENDE TOELICHTING VAN DE GEBRUIKER (weeg dit mee als extra context bij de prompt):\n"""\n${clarification.trim()}\n"""\n\n`
    : '') +
  `Beschikbare prompt frameworks:\n${frameworks
    .map((t) => {
      const parts = [`- id: ${t.id}`, `naam: ${t.name}`];
      if (t.description) parts.push(`uitleg: ${t.description}`);
      if (t.strength) parts.push(`kracht: ${t.strength}`);
      if (t.use_cases && t.use_cases.length > 0)
        parts.push(`gebruik voor: ${t.use_cases.join('; ')}`);
      return parts.join(' | ');
    })
    .join('\n')}`;

// --- Framework-fit-modus: beoordeel ELK meegegeven framework tegen het vraagstuk ---
// Anders dan 'recommend'/'recommend-framework' (die alleen de top ~3 teruggeven),
// geeft deze modus voor ÉLK framework een oordeel: past het bij dít vraagstuk, en
// zo niet, wát moet er dan nog bij om het wel te laten passen. Zo kan de UI bij
// elke kaart in de "kies een ander framework"-lijst een vraagstuk-specifieke
// uitleg tonen (i.p.v. een algemene beschrijving van de techniek).
const FRAMEWORK_FIT_SYSTEM_PROMPT = `Je bent een expert in prompt-engineering voor de Nederlandse rijksoverheid.
Een interne overheidsmedewerker heeft een EIGEN prompt/vraagstuk beschreven. Je krijgt die prompt
plus een lijst prompt frameworks (complete raamwerken die de hele prompt structureren, bijv. CARE,
CRISP, CO-STAR).

Beoordeel ELK framework uit de lijst afzonderlijk tegen DIT concrete vraagstuk. Geef per framework:
- "id": de exacte framework-id uit de lijst.
- "fits": true als het raamwerk goed past bij dit vraagstuk, anders false.
- "value": één KORTE zin (max. ~25 woorden), altijd concreet gekoppeld aan de case (het onderwerp/
  de doelgroep/het soort tekst uit de prompt):
    • als fits=true: waarom dit raamwerk goed werkt voor precies dit vraagstuk.
    • als fits=false: waarom het minder goed past bij dit vraagstuk (geen algemeenheden).
- "missing": alleen bij fits=false — één KORTE zin die zegt WAT er nog aan het vraagstuk/de prompt
  toegevoegd of veranderd zou moeten worden om dit raamwerk wél zinvol te maken. Bij fits=true mag
  "missing" een lege string zijn.

Wees eerlijk: als een framework echt niet bij het soort taak hoort, zeg dat en leg uit wat het wél
nodig zou hebben. Verzin niets; baseer je op de inhoud van de prompt.

${CLARITY_GATE_JSON_INSTRUCTION}

Anders geef je UITSLUITEND geldige JSON terug, zonder codeblok of extra tekst, in dit formaat:
{"fits":[{"id":"<framework-id>","fits":true,"value":"<1 korte zin, in het Nederlands>","missing":"<1 korte zin wat er nog bij moet als fits=false, anders leeg, in het Nederlands>"}]}

Gebruik alleen id's die exact in de lijst voorkomen. Geef een oordeel voor ELK framework uit de lijst.`;

/** Bouw de gebruikersprompt voor de framework-fit-modus (eigen-prompt-flow). */
const FRAMEWORK_FIT_USER_PROMPT = (ownPrompt: string, frameworks: TechniqueSummary[]) =>
  `PROMPT/VRAAGSTUK VAN DE GEBRUIKER (beoordeel elk framework hiertegen):\n"""\n${ownPrompt}\n"""\n\n` +
  `Te beoordelen prompt frameworks:\n${frameworks
    .map((t) => {
      const parts = [`- id: ${t.id}`, `naam: ${t.name}`];
      if (t.description) parts.push(`uitleg: ${t.description}`);
      if (t.strength) parts.push(`kracht: ${t.strength}`);
      if (t.use_cases && t.use_cases.length > 0)
        parts.push(`gebruik voor: ${t.use_cases.join('; ')}`);
      return parts.join(' | ');
    })
    .join('\n')}`;

const ANALYZE_SYSTEM_PROMPT = `Je bent een expert in prompt-engineering voor de Nederlandse rijksoverheid.
Een interne overheidsmedewerker heeft een eigen prompt geschreven en wil die optimaliseren met een
prompt framework (bijv. CARE of CRISP). Elk raamwerk vereist bepaalde bouwstenen (velden).

Jouw taak: ANALYSEER de prompt van de gebruiker en bepaal PER VEREIST VELD of de prompt daar al
voldoende informatie voor bevat. Voor elk veld dat ONTBREEKT of te vaag is, formuleer je een korte,
concrete vraag die de gebruiker helpt die informatie alsnog aan te leveren.

REGELS:
- Beoordeel mild maar eerlijk: alleen velden waar de prompt echt te weinig over zegt markeer je als ontbrekend.
- Een veld dat de prompt al goed dekt, markeer je NIET als ontbrekend.
- Schrijf de vraag/hint in het Nederlands, vriendelijk en concreet (B1-taalniveau waar passend).
- Houd het intern gericht: de doelgroep is een overheidsmedewerker, niet de burger.

Geef UITSLUITEND geldige JSON terug, zonder codeblok of extra tekst, in dit formaat:
{"summary":"<1 zin: hoe compleet is de prompt al, in het Nederlands>","missing":[{"id":"<veld-id>","label":"<veld-label>","question":"<korte vraag die de gebruiker helpt dit aan te vullen>"}]}

Gebruik alleen veld-id's die exact in de lijst voorkomen. Laat "missing" leeg ([]) als de prompt alle velden al goed dekt.`;

/** Bouw de gebruikersprompt voor de analysemodus. */
const ANALYZE_USER_PROMPT = (
  ownPrompt: string,
  techniqueName: string | undefined,
  fields: AnalyzeField[],
) =>
  `Gekozen prompt framework: ${techniqueName ?? 'onbekend'}\n\n` +
  `VEREISTE VELDEN van dit raamwerk:\n` +
  fields
    .map((f) => `- id: ${f.id} | label: ${f.label}${f.placeholder ? ` | bedoeld voor: ${f.placeholder}` : ''}`)
    .join('\n') +
  `\n\nPROMPT VAN DE GEBRUIKER (analyseer deze):\n"""\n${ownPrompt}\n"""`;

const PREFILL_SYSTEM_PROMPT = `Je bent een expert in prompt-engineering voor de Nederlandse rijksoverheid.
Een interne overheidsmedewerker heeft een eigen prompt/tekst geschreven en een prompttechniek of
prompt framework gekozen. Dat raamwerk bestaat uit een aantal VELDEN (bouwstenen).

Jouw taak: ontleed de tekst van de gebruiker en VUL PER VELD alvast een voorstel in, zodat de
gebruiker niet met lege velden begint maar met een ingevulde, controleerbare basis.

WERKWIJZE PER VELD:
1. Zoek eerst in de tekst van de gebruiker naar inhoud die bij dit veld hoort (bijv. een beschreven
   rol → het rol-veld, achtergrond/situatie → het context-veld, de opdracht → het taak-veld).
   Vind je die? Neem dan ALLE relevante details voor dit veld over en zet "source":"prompt".
   BEHOUD concrete specifieke inhoud die de gebruiker noemt — denk aan aantallen, namen, categorieën,
   opsommingen, voorbeelden, schermen/views, filters en stappen. Vat NIET samen tot één regel als de
   gebruiker meer detail heeft gegeven: je mag herformuleren en ordenen (bijv. in korte bullets), maar
   laat geen door de gebruiker genoemde details weg. Een rijke beschrijving hoort te leiden tot een rijk
   ingevuld veld. Verdeel details over het veld waar ze inhoudelijk thuishoren; stop niet alles in één veld.
2. Staat er in de tekst niets voor dit veld? Bedenk dan zelf een passend, plausibel voorstel dat
   logisch aansluit op de rest van de tekst, en zet "source":"ai". Verzin GEEN feiten die de
   bedoeling van de gebruiker veranderen; blijf dicht bij wat de tekst impliceert en houd het
   algemeen waar je het niet zeker weet (gebruik desnoods een [plaatshouder] in de waarde).

REGELS:
- Vul ELK veld in (laat "value" nooit leeg): of afgeleid uit de tekst ("prompt"), of als suggestie ("ai").
- Volledigheid gaat vóór beknoptheid bij "source":"prompt"-velden: liever een compleet, detailrijk veld
  dan een korte samenvatting waarin informatie van de gebruiker verloren gaat. Knip lange opsommingen op
  in leesbare bullets in plaats van ze in te korten.
- Schrijf in helder Nederlands (B1-taalniveau waar passend). Houd het intern gericht: de doelgroep
  is een overheidsmedewerker, niet de burger.
- "note": één heel korte toelichting (max ~12 woorden) per veld, bijv. "Afgeleid uit je prompt" of
  "Suggestie — controleer of dit klopt".
${CLARITY_GATE_JSON_INSTRUCTION}

CONTROLE VOORDAT JE ANTWOORDT: als de gebruiker een lange of gedetailleerde tekst heeft aangeleverd,
mag vrijwel geen enkel concreet detail (aantal, naam, categorie, view, filter, stap) ontbreken in de
gevulde velden. Loop de tekst van de gebruiker na en zorg dat elk genoemd detail ergens terechtkomt in
het veld waar het thuishoort. Een detail mag je herformuleren of verplaatsen, maar niet stilzwijgend laten vallen.

Geef UITSLUITEND geldige JSON terug, zonder codeblok of extra tekst, in dit formaat:
{"summary":"<1 zin: wat je uit de prompt hebt gehaald en wat je hebt aangevuld, in het Nederlands>","fields":[{"id":"<veld-id>","value":"<voorgestelde inhoud voor dit veld — detailrijk waar de gebruiker detail gaf>","source":"prompt|ai","note":"<korte toelichting>"}]}

Gebruik alleen veld-id's die exact in de lijst voorkomen.`;

/** Bouw de gebruikersprompt voor de prefill-modus. */
const PREFILL_USER_PROMPT = (
  ownPrompt: string,
  techniqueName: string | undefined,
  fields: AnalyzeField[],
  clarification?: string,
) =>
  `Gekozen techniek/raamwerk: ${techniqueName ?? 'onbekend'}\n\n` +
  `IN TE VULLEN VELDEN van dit raamwerk:\n` +
  fields
    .map((f) => `- id: ${f.id} | label: ${f.label}${f.placeholder ? ` | bedoeld voor: ${f.placeholder}` : ''}`)
    .join('\n') +
  `\n\nTEKST/PROMPT VAN DE GEBRUIKER (ontleed deze en vul de velden voor):\n"""\n${ownPrompt}\n"""` +
  (clarification && clarification.trim()
    ? `\n\nAANVULLENDE TOELICHTING VAN DE GEBRUIKER (verwerk dit als extra, leidende context bij het invullen van de velden — het is bedoeld om de velden die nog ontbraken of vaag waren nu concreet te maken):\n"""\n${clarification.trim()}\n"""`
    : '');

const TITLE_SYSTEM_PROMPT = `Je bent een expert in prompt-engineering voor de Nederlandse rijksoverheid.
Een interne overheidsmedewerker heeft een herbruikbare prompt-template gemaakt en wil die opslaan
in een gedeelde bibliotheek. Jouw taak: bedenk één korte, beschrijvende titel die meteen duidelijk
maakt WAAR de template voor dient en WAT hij oplevert.

REGELS VOOR DE TITEL:
- In het Nederlands, beknopt: maximaal ~8 woorden, geen punt aan het einde.
- Beschrijf het concrete onderwerp/doel van de template, niet de gebruikte techniek
  (dus niet "CARE-template" of "Chain-of-Thought-prompt", maar bijv. "Mindfulness-microposts voor intern gebruik").
- Geen aanhalingstekens, geen markdown, geen labels als "Titel:".
- Hou het herkenbaar voor een overheidscollega die hem in een lijst ziet staan.

Geef UITSLUITEND de titel terug, op één regel, zonder enige andere tekst.`;

/** Bouw de gebruikersprompt voor de titelmodus. */
const TITLE_USER_PROMPT = (templateContent: string) =>
  `Bedenk een korte, beschrijvende titel voor deze prompt-template:\n"""\n${templateContent}\n"""`;

const METADATA_SYSTEM_PROMPT = `Je bent een expert in prompt-engineering voor de Nederlandse rijksoverheid.
Een interne overheidsmedewerker heeft een herbruikbare prompt-template gemaakt en wil die opslaan in
een gedeelde bibliotheek. Jouw taak: stel op basis van de inhoud DRIE dingen voor:

1. "title" — één korte, beschrijvende titel (in het Nederlands, max. ~8 woorden, geen punt aan het
   einde, geen aanhalingstekens, geen techniek-naam). Beschrijf het concrete onderwerp/doel.
2. "description" — één korte omschrijving (1 zin, max. ~20 woorden) die duidelijk maakt wat de
   template doet en oplevert. Begrijpelijk voor een overheidscollega die hem in een lijst ziet.
3. "category_id" — kies de id van de BEST passende categorie uit de meegegeven lijst, ALLEEN als er
   een duidelijke match is. Is er geen goede match, gebruik dan null.

Geef UITSLUITEND geldige JSON terug, zonder codeblok of extra tekst, in dit formaat:
{"title":"<titel>","description":"<omschrijving>","category_id":"<categorie-id of null>"}

Gebruik voor category_id alleen een id die exact in de lijst voorkomt, of null.`;

/** Bouw de gebruikersprompt voor de metadata-modus (titel + omschrijving + categorie). */
const METADATA_USER_PROMPT = (
  templateContent: string,
  categories: { id: string; name: string; description?: string }[],
) =>
  `PROMPT-TEMPLATE (analyseer deze):\n"""\n${templateContent}\n"""\n\n` +
  `Beschikbare categorieën:\n${
    categories.length
      ? categories
          .map((c) => `- id: ${c.id} | naam: ${c.name}${c.description ? ` | ${c.description}` : ''}`)
          .join('\n')
      : '(geen categorieën beschikbaar — gebruik null voor category_id)'
  }`;

/** Eén metadata-suggestie: titel, omschrijving en (optioneel) een categorie-id. */
interface MetadataSuggestion {
  title: string;
  description: string;
  category_id: string | null;
}

/** Parseert het JSON-antwoord van de metadata-modus robuust. */
function parseMetadata(raw: string, validCategoryIds: Set<string>): MetadataSuggestion {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return { title: '', description: '', category_id: null };
  try {
    const parsed = JSON.parse(match[0]) as {
      title?: string;
      description?: string;
      category_id?: string | null;
    };
    const catId =
      typeof parsed.category_id === 'string' && validCategoryIds.has(parsed.category_id)
        ? parsed.category_id
        : null;
    return {
      title: typeof parsed.title === 'string' ? cleanTitle(parsed.title) : '',
      description: typeof parsed.description === 'string' ? parsed.description.trim() : '',
      category_id: catId,
    };
  } catch {
    return { title: '', description: '', category_id: null };
  }
}

/**
 * Maak het AI-antwoord schoon tot een bruikbare titel: één regel, geen
 * aanhalingstekens/opmaak, en begrensd op een nette lengte.
 */
function cleanTitle(raw: string): string {
  const firstLine = raw.split('\n').map((l) => l.trim()).filter(Boolean)[0] ?? '';
  const stripped = firstLine
    .replace(/^titel\s*:\s*/i, '')
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
    .replace(/[.\s]+$/, '')
    .trim();
  if (stripped.length <= 70) return stripped;
  return `${stripped.slice(0, 67)}…`;
}

/**
 * Lokale fallback voor de titel: leid een korte titel af uit de inhoud zonder
 * AI. Pak bij voorkeur de #Taak/vraag:- of #Rol:-kop, anders de eerste zin.
 */
function localTitle(templateContent: string): string {
  const text = templateContent.trim();
  // Zoek een #-kop met inhoud (bijv. "#Taak/vraag:\n...").
  const headingOrder = ['taak', 'rol', 'context'];
  for (const key of headingOrder) {
    const re = new RegExp(`#\\s*${key}[^:\\n]*:\\s*([^\\n]+)`, 'i');
    const m = text.match(re);
    if (m && m[1].trim()) return cleanTitle(m[1]);
  }
  // Anders: eerste zinvolle regel (geen kop, geen lege regel).
  const firstLine = text
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith('#'));
  if (firstLine) {
    const sentence = firstLine.split(/(?<=[.!?])\s/)[0];
    return cleanTitle(sentence);
  }
  return 'Nieuwe template';
}

/**
 * Verplichte uitvoerstructuur voor context-raamwerken (CARE, CRISPE, CO-STAR, …).
 * Cruciaal: elk raamwerk heeft ZIJN EIGEN koppen — de letters in de naam staan
 * voor de koppen (CARE = Context/Ask/Rules/Examples; CO-STAR = Context/Objective/
 * Style/Tone/Audience/Response; …). We leiden die koppen af uit de template van
 * het gekozen raamwerk en dwingen PRECIES die af, in plaats van vaste koppen.
 * Valt het afleiden weg, dan een generieke instructie die de template volgt.
 */
function contextStructureInstruction(headings: string[]): string {
  const header = `VERPLICHTE UITVOERSTRUCTUUR (geldt voor dit specifieke prompt framework):
Elk prompt framework heeft zijn EIGEN koppen; de letters van de naam staan voor die koppen.`;

  const footer = `Begin elke kop met een hekje (#), direct gevolgd door de naam van de kop en een
dubbele punt. Zet daaronder, op een nieuwe regel, de volledig uitgeschreven inhoud voor die kop op
basis van de antwoorden van de gebruiker. Laat een lege regel tussen de blokken.
Gebruik UITSLUITEND deze koppen — voeg geen eigen koppen toe (zoals Rol, Stijl of Randvoorwaarden)
tenzij die hierboven staan, en laat geen kop weg. Laat alleen écht per keer in te vullen plekken
staan als [plaatshouder]. Geef geen tekst buiten deze koppen en plaats GEEN codeblok-tekens (\`\`\`).`;

  if (headings.length > 0) {
    const list = headings.map((h) => `#${h}:\n[volledig uitgeschreven inhoud voor "${h}"]`).join('\n\n');
    return `${header}\n\nBouw de prompt op met PRECIES deze koppen van het gekozen raamwerk, in deze exacte volgorde:\n\n${list}\n\n${footer}`;
  }

  // Geen koppen afleidbaar: volg de structuur van de meegestuurde template.
  return `${header}\n\nBouw de prompt op met exact de #-koppen die in de meegestuurde STRUCTUUR-REFERENTIE (de raamwerk-template) staan, in dezelfde volgorde en met dezelfde namen.\n\n${footer}`;
}

/**
 * Verplichte uitvoerstructuur voor de Few-Shot-techniek: een rol/taak-intro,
 * 2 à 3 voorbeeldblokken met Input/Output, en een afsluitend "Nieuwe taak"-blok
 * waar de gebruiker zijn eigen invoer plakt. Het model leert het patroon uit de
 * voorbeelden en voert daarna in dezelfde stijl de nieuwe taak uit.
 */
const FEW_SHOT_STRUCTURE_INSTRUCTION = `VERPLICHTE UITVOERSTRUCTUUR (Few-Shot / voorbeeldgestuurd prompten):
Bouw de prompt ALTIJD op in deze volgorde. Schrijf de voorbeelden volledig uit op
basis van de antwoorden; gebruik dezelfde doelgroep, toon en soort tekst als de taak.

1. Een korte rol/taak-intro (1-3 zinnen): wie de AI is en wat de taak is, met de
   expliciete instructie om de stijl en structuur van de onderstaande voorbeelden te volgen.
2. Twee à drie genummerde voorbeelden, elk in dit formaat:
   Voorbeeld 1:
   Input: "[voorbeeld van de invoer]"
   Output: "[de gewenste, voorbeeldige uitvoer]"
3. Een afsluitend blok:
   Nieuwe taak:
   Input: "[plak hier je eigen invoer]"
   Output:
   (laat Output bewust leeg zodat het model die invult)

Houd Input/Output-paren consistent qua toon, lengte en niveau. Laat alleen écht per
keer in te vullen plekken staan als [plaatshouder]. Plaats GEEN codeblok-tekens (\`\`\`).`;

/**
 * Verplichte uitvoerstructuur voor Chain-of-Thought (stapsgewijs redeneren).
 * De prompt laat de AI NIET meteen het eindproduct maken, maar eerst stap voor
 * stap vragen stellen — de gebruiker antwoordt, en pas daarna stelt de AI het
 * resultaat op. Zo wordt zichtbaar welke keuzes, aannames en afwegingen nodig
 * zijn en of er informatie ontbreekt.
 */
const CHAIN_OF_THOUGHT_STRUCTURE_INSTRUCTION = `VERPLICHTE UITVOERSTRUCTUUR (Chain-of-Thought / stapsgewijs redeneren):
Bouw de prompt ALTIJD op in deze volgorde. Schrijf alles volledig uit op basis van de antwoorden.
Het allerbelangrijkste: de gegenereerde prompt moet de AI laten WERKEN via een interactieve
één-vraag-per-keer-dialoog. De AI maakt NIET meteen het eindproduct.

1. Een rol-zin: wie de AI is (bijv. een ervaren beleidsmedewerker die goed onderbouwde stukken maakt).
2. Een taak-zin: waar de AI bij helpt, met een [plaatshouder] voor het concrete onderwerp.
3. Een interactieve werkwijze, expliciet en dwingend uitgeschreven in de prompt zelf. Neem deze regels
   letterlijk en volledig op (herformuleren mag, betekenis behouden):
   - "Neem mij stap voor stap mee. Stel telkens MAAR ÉÉN vraag tegelijk en wacht op mijn antwoord
     voordat je verder gaat."
   - "Stel op basis van mijn antwoord zo nodig een vervolg-/wedervraag, en blijf doorvragen tot de
     kern van het vraagstuk helder is. Vraag dus door totdat je voldoende scherp hebt wat ik precies wil."
   - "Maak of schrijf het eindproduct PAS nadat alle stappen zijn doorlopen en de inhoud compleet is."
4. Een genummerde lijst met de minimale onderwerpen/vragen die in elk geval aan bod komen
   (uit de antwoorden van de gebruiker). Instrueer de AI expliciet dat dit een MINIMUM is en dat de AI
   zelf aanvullende, scherpere vervolgvragen mag bedenken om tot de kern te komen.
5. Een korte slotinstructie dat de AI de feiten controleert en aangeeft waar informatie ontbreekt.

Laat alleen écht per keer in te vullen plekken staan als [plaatshouder]. Plaats GEEN codeblok-tekens (\`\`\`).`;

/**
 * Verplichte uitvoerstructuur voor Persona Prompting: schrijf gericht VOOR een
 * ontvanger/persona. De prompt benoemt expliciet het doel, de focus (waar deze
 * persona op let / wat hij nodig heeft) en de toon, en bevat een plaatshouder
 * voor de eigen inhoud van de gebruiker.
 */
const PERSONA_STRUCTURE_INSTRUCTION = `VERPLICHTE UITVOERSTRUCTUUR (Persona Prompting — schrijf voor je ontvanger):
Bouw de prompt ALTIJD op in deze volgorde. Schrijf alles volledig uit op basis van de antwoorden.

1. Een taak-zin die de opdracht richt op de ontvanger/persona, bijv.:
   "Geef mij feedback en herschrijf onderstaande tekst voor een [ontvanger/persona]."
2. Drie gelabelde regels, elk op een eigen regel:
   Doel: [wat het resultaat moet bereiken]
   Focus: [waar deze persona op let / wat hij nodig heeft om goed te kunnen reageren — niet alleen de functie]
   Toon: [de gewenste toon voor deze ontvanger, bijv. kort, bestuurlijk, vriendelijk]
3. Een inhoud-regel met een plaatshouder voor de eigen tekst van de gebruiker, bijv.:
   Tekst: [plak hier je eigen tekst/e-mail]
4. Een korte slotinstructie om het resultaat duidelijk, passend en gericht op deze ontvanger te maken.

Beschrijf bij Focus niet alleen de functie, maar ook wat deze persoon nodig heeft om goed te reageren.
Laat alleen écht per keer in te vullen plekken staan als [plaatshouder]. Plaats GEEN codeblok-tekens (\`\`\`).`;

/**
 * Verplichte uitvoerstructuur voor Multi-Persona Prompting: bekijk hetzelfde
 * vraagstuk vanuit meerdere persona's met hun eigen belangen, laat elke persona
 * kort reageren op vaste vragen, en sluit af met één gezamenlijke conclusie.
 */
const MULTI_PERSONA_STRUCTURE_INSTRUCTION = `VERPLICHTE UITVOERSTRUCTUUR (Multi-Persona Prompting):
Bouw de prompt ALTIJD op in deze volgorde. Schrijf alles volledig uit op basis van de antwoorden.

1. Een openingszin: "Bekijk onderstaand(e) [plan/voorstel/vraagstuk] vanuit [aantal] persona's met hun eigen belangen:"
2. Een genummerde lijst van de persona's (uit de antwoorden), elk met hun rol/belang.
3. Een blok "Vraagstuk:" met een plaatshouder voor de eigen inhoud, bijv.:
   Vraagstuk:
   [plak hier het plan of voorstel]
4. Een blok "Laat elke persona kort reageren op:" met deze bullets:
   - Wat valt op?
   - Welke risico's zie je?
   - Welke kans zie je?
   - Welke vraag moet nog beantwoord worden?
5. Een afsluiting "Sluit af met één gezamenlijke conclusie:" met de vraag wat er aangepast moet worden
   voordat de gebruiker het voorstel verder brengt.

Laat alleen écht per keer in te vullen plekken staan als [plaatshouder]. Plaats GEEN codeblok-tekens (\`\`\`).`;

/**
 * Verplichte uitvoerstructuur voor Sjabloongebaseerd prompten (Template-based):
 * geef de AI een vaste structuur/format om in te vullen. De prompt benoemt
 * expliciet de rubrieken (kopjes + volgorde), de regels (lengte, toon, wat niet
 * mag ontbreken) en sluit af met plaatshouders voor de eigen inhoud.
 */
const TEMPLATE_BASED_STRUCTURE_INSTRUCTION = `VERPLICHTE UITVOERSTRUCTUUR (Sjabloongebaseerd prompten):
Bouw de prompt ALTIJD op in deze volgorde. Schrijf alles volledig uit op basis van de antwoorden.

1. Een taak-zin die het vaste format aankondigt, bijv.: "Maak een [soort document] in dit vaste format:".
2. Een genummerde lijst met de rubrieken/kopjes van het sjabloon, in de juiste volgorde
   (uit de antwoorden van de gebruiker).
3. Een regel-blok met de eisen: lengte, toon/taalniveau, gewenste opmaak (bijv. korte bullets,
   maximaal één pagina) en expliciet wat NIET mag ontbreken.
4. Tot slot plaatshouders voor de eigen inhoud van de gebruiker, elk op een eigen regel, bijv.:
   Project: [naam project]
   Context: [plak hier je informatie]

Geef het sjabloon dus expliciet mee: kopjes, volgorde, lengte, toon én wat juist niet mag ontbreken.
Laat alleen écht per keer in te vullen plekken staan als [plaatshouder]. Plaats GEEN codeblok-tekens (\`\`\`).`;

/**
 * Verplichte uitvoerstructuur voor Meta Prompting: keer de rollen om en laat de
 * AI eerst de prompt zelf scherper maken (met rol, context, taak, formaat en
 * parameters) en zo nodig verduidelijkende vragen stellen, vóór het antwoord.
 */
const META_STRUCTURE_INSTRUCTION = `VERPLICHTE UITVOERSTRUCTUUR (Meta Prompting):
Bouw de prompt ALTIJD op in deze volgorde. Schrijf alles volledig uit op basis van de antwoorden.

1. Een doel-zin met een [plaatshouder] voor het concrete onderwerp, bijv.:
   "Ik wil AI gebruiken om [doel] voor: [project / plan / voorstel]."
2. Een blok met de ruwe prompt van de gebruiker, bijv.:
   "Mijn ruwe prompt is:
   \\"[plak hier je ruwe prompt]\\""
3. Een verbeterinstructie: "Verbeter deze prompt voordat je antwoord geeft. Gebruik daarbij:
   rol, context, taak, formaat en parameters (grenzen)."
4. "Stel maximaal 3 verduidelijkende vragen als informatie ontbreekt."
5. "Geef daarna de verbeterde prompt die ik direct kan gebruiken."

Het draait er dus om dat de AI eerst de prompt scherper maakt — niet meteen het inhoudelijke antwoord geeft.
Laat alleen écht per keer in te vullen plekken staan als [plaatshouder]. Plaats GEEN codeblok-tekens (\`\`\`).`;

/**
 * Verplichte uitvoerstructuur voor Socratic Prompting: de AI treedt op als
 * Socratische interviewer die via één vraag per keer de aannames van de
 * gebruiker blootlegt en uitdaagt — zonder zelf antwoorden of conclusies te geven.
 * Gebaseerd op de klassieke 6 categorieën Socratische vragen (Paul/Elder).
 */
const SOCRATIC_STRUCTURE_INSTRUCTION = `VERPLICHTE UITVOERSTRUCTUUR (Socratic Prompting — interviewstijl, aannames blootleggen):
Belangrijk: het eindresultaat is een PROMPT/TEMPLATE die de gebruiker in een Gen AI-chat plakt. Het is dus
de Gen AI (niet de gebruiker) die straks de aannames eruit haalt door de gebruiker in interviewstijl door te
vragen over de geschetste situatie. Stel zelf GEEN vragen aan de gebruiker; schrijf de instructie voor de AI.
Bouw de prompt ALTIJD op in deze volgorde, en stem de vragen af op de concrete situatie/use case uit de antwoorden.

1. Een rol-zin: "Jij bent een Socratische interviewer. Je geeft GEEN antwoorden, oordelen of conclusies;
   je stelt vragen die mijn denken en mijn aannames over de onderstaande situatie zichtbaar en bespreekbaar maken."
2. Een situatie-blok: vat de situatie/use case van de gebruiker kort samen (met een [plaatshouder] waar de
   gebruiker zijn eigen situatie/casus kan aanvullen), en benoem het doel: de verborgen aannames in DEZE
   situatie boven tafel krijgen en uitdagen.
3. Gedragsregels, expliciet uitgeschreven:
   - "Stel telkens MAAR ÉÉN vraag tegelijk en wacht op mijn antwoord voordat je verder gaat."
   - "Bouw je volgende vraag voort op mijn vorige antwoord en graaf door naar de aanname erachter."
   - "Blijf neutraal: geef geen antwoorden, geen oordeel en geen advies. Vermijd ja/nee-vragen en
     sturende vragen; stel open wat/hoe/waarom-vragen."
4. Concreet toegesneden startvragen: schrijf 3 à 5 EERSTE voorbeeldvragen die echt over deze situatie gaan
   (niet generiek), en geef aan dat de AI deze als vertrekpunt gebruikt en daarna zelf scherpere vervolgvragen bedenkt.
   Wissel daarbij de 6 Socratische categorieën af: verheldering, aannames onderzoeken, redenen & bewijs,
   andere perspectieven, implicaties & gevolgen, en vragen over de vraag zelf. Leg de nadruk op aannames en bewijs.
5. Een stopconditie: "Stel ongeveer 5 à 7 vragen, of stop eerder zodra de kernaannames helder zijn of
   ik aangeef te willen stoppen."
6. Een afsluiting: "Vat daarna de blootgelegde aannames neutraal samen in een lijst, en geef per aanname
   aan hoe zeker die is en welk bewijs hem zou bevestigen of weerleggen." (nog steeds zonder oordeel)

Laat alleen écht per keer in te vullen plekken staan als [plaatshouder]. Plaats GEEN codeblok-tekens (\`\`\`).`;

type StructureFormat =
  | 'care'
  | 'few-shot'
  | 'chain-of-thought'
  | 'persona'
  | 'multi-persona'
  | 'template-based'
  | 'meta'
  | 'socratic';

/**
 * Kies de juiste structuur-instructie (of geen) op basis van de techniek.
 * Voor context-raamwerken (`care`) zijn de koppen raamwerk-specifiek; die
 * worden uit de template afgeleid en als `headings` doorgegeven.
 */
function structureInstruction(format?: StructureFormat, headings: string[] = []): string | null {
  if (format === 'care') return contextStructureInstruction(headings);
  if (format === 'few-shot') return FEW_SHOT_STRUCTURE_INSTRUCTION;
  if (format === 'chain-of-thought') return CHAIN_OF_THOUGHT_STRUCTURE_INSTRUCTION;
  if (format === 'persona') return PERSONA_STRUCTURE_INSTRUCTION;
  if (format === 'multi-persona') return MULTI_PERSONA_STRUCTURE_INSTRUCTION;
  if (format === 'template-based') return TEMPLATE_BASED_STRUCTURE_INSTRUCTION;
  if (format === 'meta') return META_STRUCTURE_INSTRUCTION;
  if (format === 'socratic') return SOCRATIC_STRUCTURE_INSTRUCTION;
  return null;
}

/** Bouw de systeemprompt uit de admin-hoofdprompt (of default) + structuur + toon. */
function buildSystemPrompt(
  systemPrompt?: string,
  tone?: string,
  format?: StructureFormat,
  headings: string[] = [],
): string {
  const base = systemPrompt?.trim() ? systemPrompt.trim() : DEFAULT_SYSTEM_PROMPT;
  const instruction = structureInstruction(format, headings);
  const withStructure = instruction ? `${base}\n\n${instruction}` : base;
  const withTone = tone?.trim() ? `${withStructure}\n\nToon en schrijfstijl: ${tone.trim()}` : withStructure;
  // De clarity-gate komt als laatste, zodat hij ook geldt bij een aangepaste admin-systeemprompt.
  return `${withTone}\n\n${CLARITY_GATE_INSTRUCTION}`;
}

/**
 * Detecteert of het model de input als onbruikbaar heeft beoordeeld (zie
 * UNCLEAR_SENTINEL). Geeft de uitlegregel terug als de sentinel is aangetroffen,
 * anders null. Tolerant voor opmaak (codeblok-randen, hekjes, vetgedrukt).
 */
function detectUnclear(raw: string): string | null {
  // Eerste niet-lege regel pakken en opmaak/markeringen eraf strippen.
  const lines = raw.split('\n');
  const firstIdx = lines.findIndex((l) => l.trim());
  if (firstIdx === -1) return null;
  const firstLine = lines[firstIdx]
    .replace(/[`*_#>\s]/g, '') // codeblok, vet, kop-hekjes, witruimte
    .toUpperCase();
  if (!firstLine.startsWith(UNCLEAR_SENTINEL)) return null;
  // De uitleg is alles ná de sentinel-regel; val terug op een nette standaardtekst.
  const reason = lines
    .slice(firstIdx + 1)
    .join('\n')
    .replace(/^[`*_#>\s]+|[`*_#>\s]+$/g, '')
    .trim();
  return (
    reason ||
    'Je invoer is op dit moment niet duidelijk genoeg om er een zinvolle prompt van te maken. ' +
      'Beschrijf in je eigen woorden wat je wilt bereiken en vul de velden concreet in.'
  );
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
  model: string = CLAUDE_MODEL,
): Promise<string> {
  const apiKey = Deno.env.get('CLAUDE_API_KEY');
  if (!apiKey) throw new Error('CLAUDE_API_KEY ontbreekt');

  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model,
    // Claude (primaire provider) mag royaal: genoeg ruimte voor detailrijke
    // prefill van veel velden zonder dat de JSON wordt afgekapt.
    max_tokens: 16384,
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
  model: string = DEEPSEEK_MODEL,
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
      model,
      // DeepSeek V4 (Flash/Pro) ondersteunt zeer hoge output-limieten (V4 Pro tot
      // 384k). 16384 is ruim genoeg voor detailrijke prefill en veilig voor beide
      // modellen; hoger heeft hier geen meerwaarde (je betaalt alleen voor wat
      // daadwerkelijk gegenereerd wordt, niet voor het plafond).
      max_tokens: 16384,
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
  model: string = OPENAI_MODEL,
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
      model,
      max_tokens: 16384,
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

async function runMistral(
  userMessage: string,
  system: string,
  temperature: number,
  model: string = MISTRAL_MODEL,
): Promise<string> {
  const apiKey = Deno.env.get('MISTRAL_API_KEY');
  if (!apiKey) throw new Error('MISTRAL_API_KEY ontbreekt');

  // Mistral gebruikt een OpenAI-compatibele API.
  const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      temperature,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userMessage },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Mistral gaf status ${response.status}`);
  }

  const data = await response.json();
  const text: string = data?.choices?.[0]?.message?.content?.trim() ?? '';
  if (!text) throw new Error('Mistral gaf een lege respons');
  return text;
}

type ProviderFn = (
  userMessage: string,
  system: string,
  temperature: number,
  model?: string,
) => Promise<string>;

const PROVIDERS: Record<Provider, ProviderFn> = {
  claude: runClaude,
  openai: runOpenAI,
  deepseek: runDeepSeek,
  mistral: runMistral,
};

const DEFAULT_ORDER: Provider[] = ['claude', 'openai', 'deepseek', 'mistral'];

/** Bouw de fallback-volgorde op basis van de voorkeur van de client. */
function buildOrder(preferred?: PreferredProvider): Provider[] {
  if (!preferred || preferred === 'auto') return DEFAULT_ORDER;
  return [preferred, ...DEFAULT_ORDER.filter((p) => p !== preferred)];
}

interface Recommendation {
  id: string;
  reason: string;
  /** Uitgebreidere onderbouwing van de toegevoegde waarde (framework-modus). */
  value?: string;
}

/**
 * Detecteert een {"unclear":true,"reason":"…"}-verdict in een JSON-antwoord.
 * Gebruikt door de aanbevelingsmodi om eerlijk terug te koppelen bij onzin-input
 * i.p.v. willekeurige technieken aan te bevelen. Geeft de reason terug of null.
 */
function detectUnclearJson(raw: string): string | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as { unclear?: boolean; reason?: unknown };
    if (parsed.unclear === true) {
      const reason = typeof parsed.reason === 'string' ? parsed.reason.trim() : '';
      return (
        reason ||
        'Je invoer is op dit moment niet duidelijk genoeg. Beschrijf in je eigen woorden wat je wilt bereiken.'
      );
    }
  } catch {
    /* geen geldige JSON → niet als onduidelijk behandelen */
  }
  return null;
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
      .map((r) => ({
        id: r.id,
        reason: typeof r.reason === 'string' ? r.reason : '',
        value: typeof r.value === 'string' ? r.value : '',
      }));
  } catch {
    return [];
  }
}

/** Eén fit-oordeel per framework tegen het vraagstuk (framework-fit-modus). */
interface FrameworkFit {
  id: string;
  fits: boolean;
  /** Vraagstuk-specifieke uitleg: waarom het (wel of niet) past. */
  value: string;
  /** Alleen bij fits=false: wat er nog bij moet om het wel te laten passen. */
  missing?: string;
}

/** Parseert het JSON-antwoord van de framework-fit-modus robuust. */
function parseFrameworkFits(raw: string, valid: Set<string>): FrameworkFit[] {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]) as { fits?: FrameworkFit[] };
    const fits = Array.isArray(parsed.fits) ? parsed.fits : [];
    return fits
      .filter((f) => f && typeof f.id === 'string' && valid.has(f.id))
      .map((f) => ({
        id: f.id,
        fits: f.fits === true,
        value: typeof f.value === 'string' ? f.value : '',
        missing: typeof f.missing === 'string' ? f.missing : '',
      }));
  } catch {
    return [];
  }
}

/**
 * Parseert het JSON-antwoord van de framework-aanbevelingsmodus robuust.
 * Verschilt van `parseRecommendations` doordat er ook een `summary` meekomt.
 */
function parseFrameworkRecommendations(
  raw: string,
  valid: Set<string>,
): { summary: string; recommendations: Recommendation[]; missingContext: string[] } {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return { summary: '', recommendations: [], missingContext: [] };
  try {
    const parsed = JSON.parse(match[0]) as {
      summary?: string;
      missingContext?: unknown;
      recommendations?: Recommendation[];
    };
    const recommendations = (Array.isArray(parsed.recommendations) ? parsed.recommendations : [])
      .filter((r) => r && typeof r.id === 'string' && valid.has(r.id))
      .slice(0, 3)
      .map((r) => ({
        id: r.id,
        reason: typeof r.reason === 'string' ? r.reason : '',
        value: typeof r.value === 'string' ? r.value : '',
      }));
    // Ontbrekende-context-punten: alleen niet-lege strings, maximaal 4.
    const missingContext = (Array.isArray(parsed.missingContext) ? parsed.missingContext : [])
      .filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
      .map((p) => p.trim())
      .slice(0, 4);
    return {
      summary: typeof parsed.summary === 'string' ? parsed.summary : '',
      recommendations,
      missingContext,
    };
  } catch {
    return { summary: '', recommendations: [], missingContext: [] };
  }
}

/** Eén ontbrekend veld uit de analyse: wat mist er en welke vraag helpt de gebruiker. */
interface MissingField {
  id: string;
  label: string;
  question: string;
}

/** Parseert het JSON-antwoord van de analysemodus robuust. */
function parseAnalysis(
  raw: string,
  fields: AnalyzeField[],
): { summary: string; missing: MissingField[] } {
  const byId = new Map(fields.map((f) => [f.id, f]));
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return { summary: '', missing: [] };
  try {
    const parsed = JSON.parse(match[0]) as {
      summary?: string;
      missing?: Array<{ id?: string; label?: string; question?: string }>;
    };
    const missing = (Array.isArray(parsed.missing) ? parsed.missing : [])
      .filter((m) => m && typeof m.id === 'string' && byId.has(m.id))
      .map((m) => ({
        id: m.id as string,
        label: typeof m.label === 'string' && m.label.trim() ? m.label : byId.get(m.id as string)!.label,
        question: typeof m.question === 'string' ? m.question : '',
      }));
    return { summary: typeof parsed.summary === 'string' ? parsed.summary : '', missing };
  } catch {
    return { summary: '', missing: [] };
  }
}

/** Eén voor-ingevuld veld: voorgestelde inhoud + herkomst + korte toelichting. */
interface PrefilledField {
  id: string;
  value: string;
  /** 'prompt' = afgeleid uit de tekst van de gebruiker; 'ai' = AI-suggestie. */
  source: 'prompt' | 'ai';
  note: string;
}

/** Parseert het JSON-antwoord van de prefill-modus robuust. */
function parsePrefill(
  raw: string,
  fields: AnalyzeField[],
): { summary: string; fields: PrefilledField[] } {
  const byId = new Map(fields.map((f) => [f.id, f]));
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return { summary: '', fields: [] };
  try {
    const parsed = JSON.parse(match[0]) as {
      summary?: string;
      fields?: Array<{ id?: string; value?: string; source?: string; note?: string }>;
    };
    const prefilled = (Array.isArray(parsed.fields) ? parsed.fields : [])
      .filter((f) => f && typeof f.id === 'string' && byId.has(f.id) && typeof f.value === 'string')
      .map((f) => ({
        id: f.id as string,
        value: (f.value as string).trim(),
        source: f.source === 'ai' ? ('ai' as const) : ('prompt' as const),
        note: typeof f.note === 'string' ? f.note.trim() : '',
      }))
      // Lege voorstellen zijn nutteloos; die laten we als leeg veld over.
      .filter((f) => f.value);
    return {
      summary: typeof parsed.summary === 'string' ? parsed.summary : '',
      fields: prefilled,
    };
  } catch {
    return { summary: '', fields: [] };
  }
}

/**
 * Lokale fallback voor de analyse: markeer een veld als ontbrekend wanneer geen
 * van de woorden uit het label (of placeholder) in de prompt voorkomt. Grof,
 * maar werkt zonder AI of backend.
 */
function localAnalyze(
  ownPrompt: string,
  fields: AnalyzeField[],
): { summary: string; missing: MissingField[] } {
  const haystack = ownPrompt.toLowerCase();
  const missing = fields
    .filter((f) => {
      const cues = `${f.label} ${f.placeholder ?? ''}`
        .toLowerCase()
        .split(/[^a-zà-ÿ0-9]+/)
        .filter((w) => w.length > 3);
      // Geen enkele aanwijzing uit het label terug te vinden → waarschijnlijk niet gedekt.
      return cues.length > 0 && !cues.some((w) => haystack.includes(w));
    })
    .map((f) => ({
      id: f.id,
      label: f.label,
      question: `Voeg informatie toe voor "${f.label}".`,
    }));
  return {
    summary:
      missing.length === 0
        ? 'Je prompt lijkt de belangrijkste onderdelen al te bevatten.'
        : `Er ${missing.length === 1 ? 'lijkt 1 onderdeel' : `lijken ${missing.length} onderdelen`} nog te ontbreken.`,
    missing,
  };
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
    value: t.strength ? t.strength.split(/(?<=[.!?])\s/)[0] : '',
  }));
}

/** Eén stap uit het door de AI voorgestelde plan (plan-modus). */
interface PlanStepOut {
  technique_id: string;
  title: string;
  rationale: string;
  produces: 'persona' | 'format' | 'brief' | 'text';
}

/** Het volledige plan-antwoord (plan-modus). */
interface PlanOut {
  summary: string;
  steps: PlanStepOut[];
}

/**
 * Parseert het JSON-antwoord van de plan-modus robuust. Filtert stappen op
 * bestaande techniek-id's (net als {@link parseRecommendations}) en capt op 5.
 * Garandeert dat de laatste stap "text" produceert (de compose-basis).
 */
function parsePlan(raw: string, valid: Set<string>): PlanOut | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as { summary?: unknown; steps?: unknown };
    const rawSteps = Array.isArray(parsed.steps) ? parsed.steps : [];
    const steps: PlanStepOut[] = rawSteps
      .filter(
        (s): s is Record<string, unknown> =>
          !!s && typeof (s as Record<string, unknown>).technique_id === 'string',
      )
      .filter((s) => valid.has(s.technique_id as string))
      .slice(0, 5)
      .map((s) => {
        const produces = s.produces;
        const p =
          produces === 'persona' || produces === 'format' || produces === 'brief'
            ? produces
            : 'text';
        return {
          technique_id: s.technique_id as string,
          title: typeof s.title === 'string' ? s.title : '',
          rationale: typeof s.rationale === 'string' ? s.rationale : '',
          produces: p,
        };
      });
    if (steps.length === 0) return null;
    // De laatste stap is de compose-basis en levert altijd "text".
    steps[steps.length - 1].produces = 'text';
    return {
      summary: typeof parsed.summary === 'string' ? parsed.summary : '',
      steps,
    };
  } catch {
    return null;
  }
}

/**
 * Lokale fallback voor de plan-modus (geen AI beschikbaar / parse mislukt).
 * Bouwt een eenvoudig 2-staps plan uit de lokaal best passende techniek plus een
 * compose-stap, zodat de wizard ook zonder backend een bruikbaar plan toont.
 */
function localPlan(goal: string, techniques: TechniqueSummary[]): PlanOut {
  const recs = localRecommend(goal, techniques);
  const top = recs[0] ? techniques.find((t) => t.id === recs[0].id) : undefined;
  const base = top ?? techniques[0];
  if (!base) {
    return { summary: 'Geen technieken beschikbaar.', steps: [] };
  }
  const steps: PlanStepOut[] = [
    {
      technique_id: base.id,
      title: `Werk je doel uit met ${base.name}`,
      rationale: base.strength
        ? base.strength.split(/(?<=[.!?])\s/)[0]
        : 'Passend bij je doel.',
      produces: 'brief',
    },
    {
      technique_id: base.id,
      title: 'Stel de complete template samen',
      rationale: 'Giet het verzamelde materiaal in één herbruikbare template.',
      produces: 'text',
    },
  ];
  return {
    summary: 'Een eenvoudig plan op basis van je doel (lokale suggestie).',
    steps,
  };
}

/**
 * Lokale fallback voor de framework-fit-modus (geen AI beschikbaar). Grove
 * trefwoord-overlap tussen het vraagstuk en de kracht/gebruikssituaties van elk
 * framework bepaalt of het "past". Levert voor ELK framework een oordeel, zodat
 * de UI ook zonder backend een vraagstuk-gerelateerde regel kan tonen.
 */
function localFrameworkFits(ownPrompt: string, frameworks: TechniqueSummary[]): FrameworkFit[] {
  const words = new Set(
    ownPrompt
      .toLowerCase()
      .split(/[^a-zà-ÿ0-9]+/)
      .filter((w) => w.length > 3),
  );
  return frameworks.map((t) => {
    const haystack =
      `${t.name} ${t.description ?? ''} ${t.strength ?? ''} ${(t.use_cases ?? []).join(' ')}`.toLowerCase();
    let score = 0;
    for (const w of words) if (haystack.includes(w)) score += 1;
    const fits = score >= 2;
    const firstStrength = t.strength ? t.strength.split(/(?<=[.!?])\s/)[0] : '';
    return {
      id: t.id,
      fits,
      value: fits
        ? firstStrength || 'Sluit aan bij wat je vraagstuk nodig heeft.'
        : 'Sluit minder duidelijk aan op de kern van je vraagstuk.',
      missing: fits
        ? ''
        : 'Maak in je prompt concreter welk onderwerp, doelgroep en soort tekst je bedoelt.',
    };
  });
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
    const mode: Mode =
      body.mode === 'recommend'
        ? 'recommend'
        : body.mode === 'recommend-framework'
          ? 'recommend-framework'
          : body.mode === 'framework-fit'
            ? 'framework-fit'
            : body.mode === 'analyze'
              ? 'analyze'
              : body.mode === 'prefill'
                ? 'prefill'
                : body.mode === 'title'
                  ? 'title'
                  : body.mode === 'metadata'
                    ? 'metadata'
                    : body.mode === 'plan'
                      ? 'plan'
                      : body.mode === 'plan-step'
                        ? 'plan-step'
                        : 'generate';
    const order = buildOrder(body.preferredProvider);
    const temperature = clampTemp(body.temperature);

    // --- Analysemodus: toets de eigen prompt aan de velden van het prompt framework ---
    if (mode === 'analyze') {
      const ownPrompt = body.ownPrompt?.trim();
      const fields = Array.isArray(body.analyzeFields) ? body.analyzeFields : [];
      if (!ownPrompt || fields.length === 0) {
        return new Response(
          JSON.stringify({ success: false, error: 'ownPrompt en analyzeFields zijn verplicht' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      const userMessage = ANALYZE_USER_PROMPT(ownPrompt, body.techniqueName, fields);
      let analysis: { summary: string; missing: MissingField[] } | null = null;
      let provider: Provider | 'local-template' = 'local-template';

      for (const candidate of order) {
        try {
          const raw = await PROVIDERS[candidate](
            userMessage,
            ANALYZE_SYSTEM_PROMPT,
            0.2,
            resolveModel(candidate, body.preferredProvider, body.preferredModel),
          );
          analysis = parseAnalysis(raw, fields);
          provider = candidate;
          break;
        } catch (providerErr) {
          console.error(`${candidate} (analyze) mislukt, probeer volgende:`, providerErr);
        }
      }

      if (!analysis) analysis = localAnalyze(ownPrompt, fields);

      return new Response(
        JSON.stringify({ success: true, ...analysis, provider }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // --- Prefill-modus: ontleed de eigen prompt en vul de velden van het gekozen
    //     raamwerk alvast voor (afgeleid uit de prompt of als AI-suggestie) ---
    if (mode === 'prefill') {
      const ownPrompt = body.ownPrompt?.trim();
      const fields = Array.isArray(body.analyzeFields) ? body.analyzeFields : [];
      if (!ownPrompt || fields.length === 0) {
        // Diagnostisch: benoem precies wat ontbrak, zodat de client-side melding
        // (en de logs) duidelijk maken waarom de prefill werd geweigerd.
        const missing = [
          !ownPrompt ? 'ownPrompt (lege of ontbrekende tekst)' : null,
          fields.length === 0 ? 'analyzeFields (geen velden meegestuurd)' : null,
        ].filter(Boolean);
        console.error('prefill 400 — ontbrekende input:', missing.join(', '));
        return new Response(
          JSON.stringify({ success: false, error: `prefill: ontbrekend — ${missing.join(' en ')}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      // Eventuele toelichting uit de "wat mist nog"-lus meewegen bij het invullen.
      const userMessage = PREFILL_USER_PROMPT(
        ownPrompt,
        body.techniqueName,
        fields,
        body.clarification,
      );
      let result: { summary: string; fields: PrefilledField[] } | null = null;
      let provider: Provider | 'local-template' = 'local-template';

      for (const candidate of order) {
        try {
          const raw = await PROVIDERS[candidate](
            userMessage,
            PREFILL_SYSTEM_PROMPT,
            0.3,
            resolveModel(candidate, body.preferredProvider, body.preferredModel),
          );
          // Clarity-gate: is de prompt zelf onzin? Dan eerlijk terugkoppelen.
          const unclear = detectUnclearJson(raw);
          if (unclear) {
            return new Response(
              JSON.stringify({ success: false, unclear: true, reason: unclear, provider: candidate }),
              { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
            );
          }
          const parsed = parsePrefill(raw, fields);
          if (parsed.fields.length > 0) {
            result = parsed;
            provider = candidate;
            break;
          }
        } catch (providerErr) {
          console.error(`${candidate} (prefill) mislukt, probeer volgende:`, providerErr);
        }
      }

      // Geen AI-resultaat: lege voor-invulling (de UI toont dan gewoon lege velden).
      if (!result) result = { summary: '', fields: [] };

      return new Response(
        JSON.stringify({ success: true, ...result, provider }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // --- Titelmodus: vat een gegenereerde template samen tot een korte titel ---
    if (mode === 'title') {
      const templateContent = body.templateContent?.trim();
      if (!templateContent) {
        return new Response(
          JSON.stringify({ success: false, error: 'templateContent is verplicht' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      const userMessage = TITLE_USER_PROMPT(templateContent);
      let title: string | null = null;
      let provider: Provider | 'local-template' = 'local-template';

      for (const candidate of order) {
        try {
          const raw = await PROVIDERS[candidate](
            userMessage,
            TITLE_SYSTEM_PROMPT,
            0.3,
            resolveModel(candidate, body.preferredProvider, body.preferredModel),
          );
          const cleaned = cleanTitle(raw);
          if (cleaned) {
            title = cleaned;
            provider = candidate;
            break;
          }
        } catch (providerErr) {
          console.error(`${candidate} (title) mislukt, probeer volgende:`, providerErr);
        }
      }

      if (!title) title = localTitle(templateContent);

      return new Response(
        JSON.stringify({ success: true, title, provider }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // --- Metadata-modus: stel titel + omschrijving + best passende categorie voor ---
    if (mode === 'metadata') {
      const templateContent = body.templateContent?.trim();
      if (!templateContent) {
        return new Response(
          JSON.stringify({ success: false, error: 'templateContent is verplicht' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      const categories = Array.isArray(body.metaCategories) ? body.metaCategories : [];
      const validCatIds = new Set(categories.map((c) => c.id));
      const userMessage = METADATA_USER_PROMPT(templateContent, categories);
      let meta: MetadataSuggestion | null = null;
      let provider: Provider | 'local-template' = 'local-template';

      for (const candidate of order) {
        try {
          const raw = await PROVIDERS[candidate](
            userMessage,
            METADATA_SYSTEM_PROMPT,
            0.3,
            resolveModel(candidate, body.preferredProvider, body.preferredModel),
          );
          const parsed = parseMetadata(raw, validCatIds);
          if (parsed.title) {
            meta = parsed;
            provider = candidate;
            break;
          }
        } catch (providerErr) {
          console.error(`${candidate} (metadata) mislukt, probeer volgende:`, providerErr);
        }
      }

      // Geen AI-resultaat: val terug op een lokale titel, lege omschrijving, geen categorie.
      if (!meta) {
        meta = { title: localTitle(templateContent), description: '', category_id: null };
      }

      return new Response(
        JSON.stringify({ success: true, ...meta, provider }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // --- Framework-aanbevelingsmodus: kies het best passende prompt framework
    //     op basis van de EIGEN prompt van de gebruiker (eigen-prompt-flow) ---
    if (mode === 'recommend-framework') {
      const ownPrompt = body.ownPrompt?.trim();
      const frameworks = Array.isArray(body.techniques) ? body.techniques : [];
      if (!ownPrompt || frameworks.length === 0) {
        return new Response(
          JSON.stringify({ success: false, error: 'ownPrompt en techniques zijn verplicht' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      const validIds = new Set(frameworks.map((t) => t.id));
      // Eventuele eerdere toelichting uit de heranalyse-lus meewegen als extra context.
      const userMessage = RECOMMEND_FRAMEWORK_USER_PROMPT(ownPrompt, frameworks, body.clarification);
      let result:
        | { summary: string; recommendations: Recommendation[]; missingContext: string[] }
        | null = null;
      let provider: Provider | 'local-template' = 'local-template';

      for (const candidate of order) {
        try {
          const raw = await PROVIDERS[candidate](
            userMessage,
            RECOMMEND_FRAMEWORK_SYSTEM_PROMPT,
            0.2,
            resolveModel(candidate, body.preferredProvider, body.preferredModel),
          );
          const parsed = parseFrameworkRecommendations(raw, validIds);
          if (parsed.recommendations.length > 0) {
            result = parsed;
            provider = candidate;
            break;
          }
        } catch (providerErr) {
          console.error(`${candidate} (recommend-framework) mislukt, probeer volgende:`, providerErr);
        }
      }

      // Geen AI-resultaat: val terug op trefwoord-matching over de eigen prompt.
      if (!result) {
        result = {
          summary: '',
          recommendations: localRecommend(ownPrompt, frameworks),
          missingContext: [],
        };
      }

      return new Response(
        JSON.stringify({ success: true, ...result, provider }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // --- Aanbevelingsmodus: kies passende technieken bij een doel ---
    // --- Plan-modus: stel een geordend meerstaps-recept van technieken samen ---
    if (mode === 'plan') {
      const goal = body.goal?.trim();
      const techniques = Array.isArray(body.techniques) ? body.techniques : [];
      if (!goal || techniques.length === 0) {
        return new Response(
          JSON.stringify({ success: false, error: 'goal en techniques zijn verplicht' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      const validIds = new Set(techniques.map((t) => t.id));
      const userMessage = PLAN_USER_PROMPT(goal, techniques);
      let plan: PlanOut | null = null;
      let provider: Provider | 'local-template' = 'local-template';

      for (const candidate of order) {
        try {
          const raw = await PROVIDERS[candidate](
            userMessage,
            PLAN_SYSTEM_PROMPT,
            0.2,
            resolveModel(candidate, body.preferredProvider, body.preferredModel),
          );
          // Clarity-gate: heeft het model het doel als onzin beoordeeld?
          const unclear = detectUnclearJson(raw);
          if (unclear) {
            return new Response(
              JSON.stringify({ success: false, unclear: true, reason: unclear, provider: candidate }),
              { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
            );
          }
          const parsed = parsePlan(raw, validIds);
          if (parsed && parsed.steps.length > 0) {
            plan = parsed;
            provider = candidate;
            break;
          }
        } catch (providerErr) {
          console.error(`${candidate} (plan) mislukt, probeer volgende:`, providerErr);
        }
      }

      if (!plan) {
        plan = localPlan(goal, techniques);
      }

      return new Response(
        JSON.stringify({ success: true, plan, provider }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // --- Plan-step-modus: verzamel het uitgeschreven materiaal voor één stap ---
    if (mode === 'plan-step') {
      const goal = body.goal?.trim();
      if (!goal) {
        return new Response(
          JSON.stringify({ success: false, error: 'goal is verplicht' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      // --- Interactieve tak: vraag-na-vraag (chain-of-thought / socratic) ---
      if (body.stepInteractive) {
        const transcript = Array.isArray(body.transcript) ? body.transcript : [];
        const interviewMessage = PLAN_STEP_INTERVIEW_USER_PROMPT({
          goal,
          stepTitle: body.stepTitle,
          stepTechniqueName: body.stepTechniqueName,
          outcomesSummary: body.outcomesSummary,
          transcript,
        });

        for (const candidate of order) {
          try {
            const raw = await PROVIDERS[candidate](
              interviewMessage,
              PLAN_STEP_INTERVIEW_SYSTEM_PROMPT,
              0.3,
              resolveModel(candidate, body.preferredProvider, body.preferredModel),
            );
            const unclear = detectUnclearJson(raw);
            if (unclear) {
              return new Response(
                JSON.stringify({ success: false, unclear: true, reason: unclear, provider: candidate }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
              );
            }
            const turn = parseInterviewTurn(raw);
            if (turn.question) {
              return new Response(
                JSON.stringify({ success: true, needs_input: true, question: turn.question, provider: candidate }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
              );
            }
            if (turn.material) {
              return new Response(
                JSON.stringify({ success: true, done: true, material: turn.material, provider: candidate }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
              );
            }
          } catch (providerErr) {
            console.error(`${candidate} (plan-step interview) mislukt, probeer volgende:`, providerErr);
          }
        }

        // Honest-degrade: geen enkele provider leverde iets bruikbaars.
        return new Response(
          JSON.stringify({ success: false, error: 'De volgende vraag kon niet worden opgehaald' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      const userMessage = PLAN_STEP_MATERIAL_USER_PROMPT({
        goal,
        stepTitle: body.stepTitle,
        stepProduces: body.stepProduces,
        stepTechniqueName: body.stepTechniqueName,
        outcomesSummary: body.outcomesSummary,
      });
      let material = '';
      let provider: Provider | 'local-template' = 'local-template';

      for (const candidate of order) {
        try {
          const raw = await PROVIDERS[candidate](
            userMessage,
            PLAN_STEP_MATERIAL_SYSTEM_PROMPT,
            0.3,
            resolveModel(candidate, body.preferredProvider, body.preferredModel),
          );
          // Clarity-gate: alleen deze STAP wordt afgekort, niet het hele plan.
          const unclear = detectUnclearJson(raw);
          if (unclear) {
            return new Response(
              JSON.stringify({ success: false, unclear: true, reason: unclear, provider: candidate }),
              { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
            );
          }
          const trimmed = raw.trim();
          if (trimmed) {
            material = trimmed;
            provider = candidate;
            break;
          }
        } catch (providerErr) {
          console.error(`${candidate} (plan-step) mislukt, probeer volgende:`, providerErr);
        }
      }

      // Honest-degrade: geen nep-materiaal. Kon geen enkele provider iets leveren,
      // dan geeft de wizard een retry — nooit een verzonnen tekst.
      if (!material) {
        return new Response(
          JSON.stringify({ success: false, error: 'Materiaal voor deze stap kon niet worden gegenereerd' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      return new Response(
        JSON.stringify({ success: true, material, provider }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

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
          const raw = await PROVIDERS[candidate](
            userMessage,
            RECOMMEND_SYSTEM_PROMPT,
            0.2,
            resolveModel(candidate, body.preferredProvider, body.preferredModel),
          );
          // Clarity-gate: heeft het model het doel als onzin beoordeeld?
          const unclear = detectUnclearJson(raw);
          if (unclear) {
            return new Response(
              JSON.stringify({ success: false, unclear: true, reason: unclear, provider: candidate }),
              { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
            );
          }
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

    // --- Framework-fit-modus: beoordeel elk framework tegen het vraagstuk ---
    if (mode === 'framework-fit') {
      const ownPrompt = body.ownPrompt?.trim();
      const frameworks = Array.isArray(body.techniques) ? body.techniques : [];
      if (!ownPrompt || frameworks.length === 0) {
        return new Response(
          JSON.stringify({ success: false, error: 'ownPrompt en techniques zijn verplicht' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      const validIds = new Set(frameworks.map((t) => t.id));
      const userMessage = FRAMEWORK_FIT_USER_PROMPT(ownPrompt, frameworks);
      let fits: FrameworkFit[] = [];
      let provider: Provider | 'local-template' = 'local-template';

      for (const candidate of order) {
        try {
          const raw = await PROVIDERS[candidate](
            userMessage,
            FRAMEWORK_FIT_SYSTEM_PROMPT,
            0.2,
            resolveModel(candidate, body.preferredProvider, body.preferredModel),
          );
          // Clarity-gate: heeft het model de prompt als onzin beoordeeld?
          const unclear = detectUnclearJson(raw);
          if (unclear) {
            return new Response(
              JSON.stringify({ success: false, unclear: true, reason: unclear, provider: candidate }),
              { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
            );
          }
          const parsed = parseFrameworkFits(raw, validIds);
          if (parsed.length > 0) {
            fits = parsed;
            provider = candidate;
            break;
          }
        } catch (providerErr) {
          console.error(`${candidate} (framework-fit) mislukt, probeer volgende:`, providerErr);
        }
      }

      if (fits.length === 0) {
        fits = localFrameworkFits(ownPrompt, frameworks);
      }

      return new Response(
        JSON.stringify({ success: true, fits, provider }),
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

    // Nieuwe clients sturen `structureFormat`; oude clients alleen `isContextPrompt`.
    const format: StructureFormat | undefined =
      body.structureFormat ?? (body.isContextPrompt ? 'care' : undefined);

    const filled = fillTemplate(body.template, body.promptContent, body.followUpAnswers ?? {});
    // Koppen van DIT raamwerk afleiden uit de template, zodat de generator de
    // raamwerk-eigen koppen (CARE, CRISPE, CO-STAR, …) afdwingt i.p.v. vaste.
    const headings = extractHeadings(body.template);
    const system = buildSystemPrompt(body.systemPrompt, body.toneInstruction, format, headings);
    const userMessage = GENERATE_USER_PROMPT({
      filled,
      techniqueName: body.techniqueName,
      techniqueDescription: body.techniqueDescription,
      techniqueStrength: body.techniqueStrength,
      answeredFields: body.answeredFields,
      promptContent: body.promptContent,
      structureFormat: format,
    });

    // Doorloop de providers in voorkeursvolgorde; eerste succes wint.
    // Faalt alles (of ontbreken alle keys), dan de ruwe template.
    let optimized = filled;
    let provider: Provider | 'local-template' = 'local-template';

    for (const candidate of order) {
      try {
        const raw = await PROVIDERS[candidate](
          userMessage,
          system,
          temperature,
          resolveModel(candidate, body.preferredProvider, body.preferredModel),
        );
        // Clarity-gate: heeft het model de input als onbruikbaar beoordeeld?
        // Dan geen verzonnen casus teruggeven, maar eerlijk terugkoppelen.
        const unclear = detectUnclear(raw);
        if (unclear) {
          return new Response(
            JSON.stringify({ success: false, unclear: true, reason: unclear, provider: candidate }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          );
        }
        optimized = raw;
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
