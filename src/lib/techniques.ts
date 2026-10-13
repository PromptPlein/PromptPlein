import type { Technique } from '@/types';

/**
 * Bekende prompt framework-ids/namen — complete raamwerken (CARE, CRISPE,
 * RAISE, …) die de hele prompt structureren, in tegenstelling tot losse
 * prompttechnieken. Wordt als fallback gebruikt wanneer het `family`-veld
 * (nog) niet in de backend is ingevuld, zodat de groepering ook werkt zonder
 * DB-migratie.
 */
const CONTEXT_PROMPT_IDS = new Set(['tech-crisp', 'tech-care']);
const CONTEXT_PROMPT_NAMES = new Set([
  'crisp',
  'crispe',
  'care',
  'raise',
  'co-star',
  'craft',
  'create',
  'react',
]);

/**
 * De velden waaruit de aard van een techniek is af te leiden. Losser dan een
 * volledige {@link Technique}, zodat ook het admin-formulier (dat nog niet is
 * opgeslagen) kan bepalen met wat voor techniek het te maken heeft.
 */
type TechniqueIdentity = Pick<Technique, 'id' | 'name' | 'family'>;

/** Is deze techniek een prompt framework (raamwerk) i.p.v. een losse techniek? */
export function isContextPrompt(t: TechniqueIdentity): boolean {
  if (t.family) return t.family === 'context';
  return CONTEXT_PROMPT_IDS.has(t.id) || CONTEXT_PROMPT_NAMES.has(t.name.trim().toLowerCase());
}

/**
 * De soorten die de gebruiker boven het invoerveld van /genereren kan kiezen
 * ("Wat wil je maken?"), in de volgorde van de knoppen. Niets kiezen mag ook;
 * dan kiest de AI uit alle frameworks.
 *
 * Alleen soorten die iemand met zekerheid kan aanwijzen. Of een nota zakelijk of
 * creatief is weet niemand vooraf, en een verkeerde klik sluit het juiste
 * framework uit. Binnen Tekst kiest de AI dus zelf.
 *
 * Skill kiest geen framework: die soort stuurt door naar de Skill Creator op
 * /technieken.
 */
export const PROMPT_KINDS = ['text', 'code', 'dashboard', 'agent', 'skill'] as const;

export type PromptKind = (typeof PROMPT_KINDS)[number];

/**
 * De waarden van `techniques.modality`. Moet gelijk blijven aan de
 * CHECK-constraint uit migratie 0036.
 */
export type Modality =
  | 'text'
  | 'code_new'
  | 'code_existing'
  | 'dashboard_prototype'
  | 'dashboard_full'
  | 'agent';

/**
 * De vervolgkeuze onder een soort: twee opties die elk een eigen framework
 * aanwijzen. Bij Code een nieuw project of bestaande code, bij Dashboard een
 * prototype of een echt dashboard. De eerste optie (`on`) is de standaard.
 */
export interface KindVariantOption {
  label: string;
  detail: string;
  modality: Modality;
}

export interface KindVariant {
  question: string;
  on: KindVariantOption;
  off: KindVariantOption;
}

export const KIND_VARIANTS: Partial<Record<PromptKind, KindVariant>> = {
  code: {
    question: 'Wat bouw je?',
    on: { label: 'Nieuw project', detail: 'iets wat er nog niet is', modality: 'code_new' },
    off: { label: 'Bestaande code', detail: 'een fout, functie of aanpassing', modality: 'code_existing' },
  },
  dashboard: {
    question: 'Wat wil je?',
    on: { label: 'Prototype', detail: 'klikbaar, met nepdata, snel te laten zien', modality: 'dashboard_prototype' },
    off: { label: 'Echt dashboard', detail: 'met databronnen, rollen en koppelingen', modality: 'dashboard_full' },
  },
};

const KIND_MODALITIES: Record<Exclude<PromptKind, 'code' | 'dashboard' | 'skill'>, Modality> = {
  text: 'text',
  agent: 'agent',
};

/** Welke `modality` hoort bij deze soort en stand van de schakelaar? */
function modalityFor(kind: PromptKind, variantOn: boolean): Modality | null {
  if (kind === 'skill') return null;
  const variant = KIND_VARIANTS[kind];
  if (variant) return variantOn ? variant.on.modality : variant.off.modality;
  return KIND_MODALITIES[kind as keyof typeof KIND_MODALITIES];
}

/**
 * De frameworks die bij de gekozen soort horen, in de volgorde van de lijst.
 *
 * Zonder soort (of bij Skill) komen ze allemaal terug. Met soort blijven de
 * frameworks van die soort over, plus die zonder `modality`: die zijn aan geen
 * vorm gebonden en doen overal mee.
 *
 * Levert het filter niets op (de migratie draait nog niet, of de lokale modus
 * kent de soort niet), dan bewust de volledige lijst. Een lege lijst laat de
 * zoekknop stil falen; een bredere keuze levert hooguit een minder scherp
 * framework op.
 */
export function frameworksForKind<T extends { modality?: string | null }>(
  frameworks: T[],
  kind: PromptKind | null,
  variantOn = true,
): T[] {
  const modality = kind ? modalityFor(kind, variantOn) : null;
  if (!modality) return frameworks;
  const matching = frameworks.filter((f) => !f.modality || f.modality === modality);
  return matching.some((f) => f.modality === modality) ? matching : frameworks;
}

/**
 * Ruwe trefwoord-match tussen de eigen prompt en de frameworks, zodat er meteen
 * iets op het scherm staat terwijl de AI nog nadenkt. Bewust dezelfde aanpak als
 * de `localRecommend`-fallback in de edge function.
 *
 * Dit is nadrukkelijk een VOORLOPIGE suggestie: zodra het AI-antwoord binnen is
 * vervangt de aanroeper hem. Levert de prompt geen enkele overlap op, dan geven
 * we niets terug — een willekeurig framework tonen zou misleidend zijn.
 */
export function localFrameworkGuess(ownPrompt: string, frameworks: Technique[]): Technique[] {
  const words = new Set(
    ownPrompt
      .toLowerCase()
      .split(/[^a-zà-ÿ0-9]+/)
      .filter((w) => w.length > 3),
  );
  if (words.size === 0) return [];
  const scored = frameworks
    .map((t) => {
      const haystack =
        `${t.name} ${t.description ?? ''} ${t.strength ?? ''} ${(t.use_cases ?? []).join(' ')}`.toLowerCase();
      let score = 0;
      for (const w of words) if (haystack.includes(w)) score += 1;
      return { t, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, 2).map((s) => s.t);
}

/**
 * Vaste uitvoerstructuur die de generator moet afdwingen voor bepaalde
 * technieken. De waarde wordt naar de edge function gestuurd, die er de
 * bijbehorende structuur-instructie aan koppelt.
 *  - 'care'             → #-koppen (Rol, Context, Taak/vraag, …) voor context-raamwerken.
 *  - 'few-shot'         → rol/taak + Voorbeeld-blokken (Input/Output) + Nieuwe taak.
 *  - 'chain-of-thought' → rol/taak + interactieve stap-voor-stap-werkwijze + stapvragen.
 *  - 'persona'          → taak gericht op een ontvanger + Doel/Focus/Toon + inhoud-plaatshouder.
 *  - 'multi-persona'    → vraagstuk bekeken vanuit meerdere persona's + gezamenlijke conclusie.
 *  - 'template-based'   → taak + genummerde rubrieken + regels + Project/Context-plaatshouders.
 *  - 'meta'             → doel + ruwe prompt + verbeterinstructie (rol/context/taak/format) + max. 3 vragen.
 *  - 'socratic'         → Socratische interviewer: één vraag tegelijk om aannames bloot te leggen.
 *  - 'chain-of-verification' → beweringen → verificatievragen → losse antwoorden → gecorrigeerde tekst.
 *  - 'step-back'        → eerst de algemenere vraag beantwoorden, dan pas terug naar de gestelde vraag.
 *  - 'rubric'           → toetsingskader met niveaubeschrijvingen, bewijsregel en eindoordeel.
 *  - 'skill'            → vaste instructie in secties die elke invoer op dezelfde manier afhandelt.
 *  - undefined          → geen vaste structuur; de AI bepaalt zelf de vorm.
 */
export type StructureFormat =
  | 'care'
  | 'few-shot'
  | 'chain-of-thought'
  | 'persona'
  | 'multi-persona'
  | 'template-based'
  | 'meta'
  | 'socratic'
  | 'chain-of-verification'
  | 'step-back'
  | 'rubric'
  | 'skill';

const FEW_SHOT_IDS = new Set(['tech-few-shot']);
const FEW_SHOT_NAMES = new Set(['few-shot voorbeelden', 'few-shot', 'few shot']);
const COT_IDS = new Set(['tech-chain-of-thought']);
const COT_NAMES = new Set(['chain-of-thought', 'chain of thought', 'stapsgewijs redeneren']);
// Multi-persona eerst toetsen (de naam bevat ook "persona").
const MULTI_PERSONA_IDS = new Set(['tech-multi-persona']);
const MULTI_PERSONA_NAMES = new Set(['multi-persona prompting', 'multi-persona', 'multi persona']);
const PERSONA_IDS = new Set(['tech-persona']);
const PERSONA_NAMES = new Set(['persona prompting', 'persona-prompting', 'persona']);
const TEMPLATE_BASED_IDS = new Set(['tech-structured-output', 'tech-template-based']);
const TEMPLATE_BASED_NAMES = new Set([
  'template-based output',
  'sjabloongebaseerd prompten',
  'gestructureerde output',
]);
const META_IDS = new Set(['tech-meta-prompting']);
const META_NAMES = new Set(['meta prompting', 'meta-prompting', 'meta-prompten', 'meta prompten']);
const SOCRATIC_IDS = new Set(['tech-socratic']);
const SOCRATIC_NAMES = new Set(['socratic prompting', 'socratisch prompting', 'socratisch prompten']);
// De drie rijksspecifieke technieken uit migratie 0031. Elk heeft een eigen
// bouwer en een eigen verplichte uitvoerstructuur; zie de lib-bestanden
// verification.ts, stepback.ts en rubric.ts voor wat elke techniek nodig heeft.
const COVE_IDS = new Set(['tech-chain-of-verification']);
const STEP_BACK_IDS = new Set(['tech-step-back']);
const RUBRIC_IDS = new Set(['tech-rubric']);
// De Skill Creator (migratie 0035): geen prompt voor één opdracht, maar een
// vaste instructie die elke invoer op dezelfde manier afhandelt.
const SKILL_IDS = new Set(['tech-skill-creator']);

/** Welke vaste uitvoerstructuur hoort bij deze techniek (indien van toepassing)? */
export function structureFormat(t: TechniqueIdentity): StructureFormat | undefined {
  if (isContextPrompt(t)) return 'care';
  const id = t.id;
  const name = t.name.trim().toLowerCase();
  // Vóór de rest: "chain-of-verification" begint met dezelfde woorden als
  // Chain-of-Thought, en een naamswijziging in de admin mag niet stilzwijgend
  // de verkeerde bouwer opleveren.
  if (COVE_IDS.has(id) || name.includes('verification') || name.includes('verificatie')) {
    return 'chain-of-verification';
  }
  if (STEP_BACK_IDS.has(id) || name.includes('step-back') || name.includes('step back')) {
    return 'step-back';
  }
  if (RUBRIC_IDS.has(id) || name.includes('rubric')) return 'rubric';
  if (SKILL_IDS.has(id) || name.includes('skill')) return 'skill';
  if (FEW_SHOT_IDS.has(id) || FEW_SHOT_NAMES.has(name)) return 'few-shot';
  if (COT_IDS.has(id) || COT_NAMES.has(name)) return 'chain-of-thought';
  // Multi-persona vóór persona, want de naam bevat ook "persona".
  if (MULTI_PERSONA_IDS.has(id) || MULTI_PERSONA_NAMES.has(name) || name.includes('multi-persona')) {
    return 'multi-persona';
  }
  if (PERSONA_IDS.has(id) || PERSONA_NAMES.has(name) || name.includes('persona')) {
    return 'persona';
  }
  if (
    TEMPLATE_BASED_IDS.has(id) ||
    TEMPLATE_BASED_NAMES.has(name) ||
    name.includes('sjabloon') ||
    name.includes('template')
  ) {
    return 'template-based';
  }
  if (META_IDS.has(id) || META_NAMES.has(name) || name.includes('meta')) return 'meta';
  if (SOCRATIC_IDS.has(id) || SOCRATIC_NAMES.has(name) || name.includes('socrat')) return 'socratic';
  return undefined;
}

/**
 * Technieken waarvan de bouwer zélf bepaalt wat hij vraagt: stap voor stap, of
 * afhankelijk van wat de gebruiker aanlevert. Ze hebben dus geen vaste
 * vervolgvragen, en er valt in de admin niets aan vragen te beheren. De tekst
 * hieronder legt uit wat de bouwer in plaats daarvan doet.
 *
 * Persona en Multi-Persona staan hier bewust NIET tussen: die bouwers renderen
 * juist wél de vervolgvragen uit de admin (zie {@link ../lib/persona}).
 */
const SELF_DIRECTED_BUILDERS: Partial<Record<StructureFormat, string>> = {
  'chain-of-thought':
    'Deze techniek voert een interview: de AI stelt één vraag tegelijk, vraagt door op elk antwoord en werkt zo toe naar een conclusie. Welke vragen dat zijn hangt af van het vraagstuk van de gebruiker, dus er is geen vaste vragenlijst.',
  socratic:
    'Deze techniek voert een Socratisch interview: de AI stelt één vraag tegelijk om verborgen aannames bloot te leggen en uit te dagen. Elke vraag bouwt voort op het vorige antwoord, dus er is geen vaste vragenlijst.',
  'few-shot':
    'Deze techniek gebruikt een eigen bouwer in fasen: de gebruiker beschrijft de taak, geeft voorbeelden van input en output, en de AI haalt daar de over te nemen kenmerken uit. Welke stappen er komen hangt af van de keuzes van de gebruiker, dus er is geen vaste vragenlijst.',
  meta:
    'Bij deze techniek bouwt de AI zélf een prompt. De gebruiker beschrijft in één veld wat hij nodig heeft; daarna levert de AI een uitvoerbare prompt die met feedback bij te stellen is. Er zijn dus geen in te vullen velden om te beheren.',
  'chain-of-verification':
    'Deze techniek gebruikt een eigen bouwer: de gebruiker plakt het concept, laat de AI scannen welke soorten controleerbare beweringen erin staan, vinkt aan wat gecontroleerd moet worden en legt vast waartegen geverifieerd mag worden. Die keuzes komen uit de tekst zelf, dus er is geen vaste vragenlijst.',
  'step-back':
    'Deze techniek gebruikt een eigen bouwer: de AI stelt drie stap-terug-vragen voor op oplopend abstractieniveau, de gebruiker kiest de hoogte en splitst daarna wat vaststaat van wat alleen is aangenomen. Dat hangt volledig af van het vraagstuk, dus er is geen vaste vragenlijst.',
  rubric:
    'Deze techniek gebruikt een eigen bouwer: de gebruiker kiest een schaal, stelt criteria op en laat per criterium een niveaubeschrijving per schaalpunt schrijven. Het aantal velden verschilt dus per toetsingskader en is niet vooraf te beheren.',
  skill:
    'De Skill Creator gebruikt een eigen bouwer: de gebruiker beschrijft wat hij de AI telkens uitlegt, de AI stelt de overige velden voor of vraagt door waar alleen de gebruiker het antwoord weet, en een triggertest scherpt de beschrijving aan. De vragen liggen vast in de bouwer en zijn niet in de admin te beheren.',
};

/**
 * Bepaalt de bouwer van deze techniek zijn eigen vragen? Zo ja: de uitleg over
 * wat die bouwer doet. Zo nee (undefined): de techniek gebruikt de vervolgvragen
 * uit de admin.
 */
export function selfDirectedBuilder(t: TechniqueIdentity): string | undefined {
  const fmt = structureFormat(t);
  return fmt ? SELF_DIRECTED_BUILDERS[fmt] : undefined;
}

/**
 * Is dit de Skill Creator? Die levert geen prompt voor één opdracht maar een
 * vaste instructie, en hoort daarom niet in de techniekkeuze van /genereren,
 * de doel-aanbeveling of de adviseur: die zoeken een techniek voor een prompt.
 */
export function isSkillCreator(t: TechniqueIdentity): boolean {
  return structureFormat(t) === 'skill';
}

/**
 * Technieken met een eigen invoerscherm: ze halen hun input op via een eigen
 * bouwer (persona/few-shot/meta) of een eigen keuze vooraf (template-based:
 * voorbeelddocument of format-omschrijving), niet via de vervolgvragen.
 */
const OWN_INPUT_FORMATS: StructureFormat[] = [
  'persona',
  'multi-persona',
  'few-shot',
  'meta',
  'template-based',
  'chain-of-verification',
  'step-back',
  'rubric',
  'skill',
];

/**
 * Heeft deze techniek een eigen invoerscherm dat de gebruiker moet zien? Zo ja,
 * dan mag een stap er nooit overheen springen — ook niet als laatste stap, waar
 * anders meteen de compose zou starten en de bouwer dus nooit in beeld kwam.
 *
 * Bewust NIET waar bij technieken die alleen vervolgvragen hebben: die worden
 * automatisch voor-ingevuld uit de context tot dan toe, en een laatste stap mag
 * daarmee gewoon direct de eindprompt samenstellen.
 */
export function hasOwnInputStep(t: TechniqueIdentity): boolean {
  const fmt = structureFormat(t);
  return Boolean(fmt && OWN_INPUT_FORMATS.includes(fmt));
}

/**
 * Voorbeeldopdracht per techniek, voor de placeholder van het contextveld op de
 * techniekenpagina. Eén algemeen voorbeeld werkt daar niet: bij Multi-Persona
 * hoort een vraagstuk met meerdere gezichtspunten, bij Bronbinding een vraag
 * over een aangeleverd document. Het voorbeeld laat dus meteen zien wát de
 * techniek van je wil.
 *
 * Op naam gematcht (de lijst is beheerbaar in de admin, dus namen kunnen
 * wijzigen); valt terug op de vorm van de techniek en daarna op een algemeen
 * voorbeeld. Volgorde telt: specifiekere namen eerst.
 */
const NAME_EXAMPLES: [needle: string, example: string][] = [
  ['nieuwe tool', 'bouw een webpagina die onze Excel-export inleest en per afdeling de open zaken telt'],
  ['bestaande code', 'de export in ons rapportagescherm negeert het actieve filter'],
  ['chain-of-verification', 'controleer deze Kamerbrief op cijfers, data en verwijzingen'],
  ['verification', 'controleer deze Kamerbrief op cijfers, data en verwijzingen'],
  ['step-back', 'moeten we een meldplicht invoeren voor verhuurders?'],
  ['bronbinding', 'beantwoord vragen over de nieuwe subsidieregeling, alleen op basis van de regeling zelf'],
  ['grounding', 'beantwoord vragen over de nieuwe subsidieregeling, alleen op basis van de regeling zelf'],
  ['rubric', 'beoordeel dit projectplan op volledigheid, onderbouwing en haalbaarheid'],
  ['crispe', 'schrijf een advies over de invoering van de Omgevingswet in onze gemeente'],
  ['crisp', 'schrijf een advies over de invoering van de Omgevingswet in onze gemeente'],
  ['co-star', 'schrijf een bericht voor onze socialemediakanalen over het nieuwe subsidieloket'],
  ['raise', 'vat de reacties uit de internetconsultatie samen tot de rode draad'],
  ['craft', 'maak een factsheet over de nieuwe legesverordening voor baliemedewerkers'],
  ['create', 'schrijf een vacaturetekst voor een beleidsadviseur, in de toon van onze eerdere vacatures'],
  ['react', 'beoordeel of deze klacht binnen de wettelijke termijn is afgehandeld'],
  ['care', 'schrijf een brief aan bewoners over werkzaamheden in hun straat'],
];

const FORMAT_EXAMPLES: Record<StructureFormat, string> = {
  care: 'schrijf een brief aan bewoners over werkzaamheden in hun straat',
  'few-shot': 'beantwoord binnengekomen burgerbrieven in dezelfde stijl als onze eerdere antwoorden',
  'chain-of-thought': 'beoordeel of dit subsidieverzoek binnen de regeling past',
  persona: 'leg de nieuwe parkeerregels uit aan bewoners die geen ambtenaar zijn',
  'multi-persona':
    'beoordeel het voorstel voor betaald parkeren vanuit bewoners, ondernemers en de wethouder',
  'template-based': 'maak een beslisnota volgens het vaste sjabloon van ons ministerie',
  meta: 'ik wil een prompt waarmee ik verslagen van vergaderingen laat samenvatten',
  socratic: 'ik wil scherp krijgen waarom onze aanpak van woonoverlast niet werkt',
  'chain-of-verification': 'controleer deze Kamerbrief op cijfers, data en verwijzingen',
  'step-back': 'moeten we een meldplicht invoeren voor verhuurders?',
  rubric: 'beoordeel dit projectplan op volledigheid, onderbouwing en haalbaarheid',
  skill: 'geef feedback op conceptbrieven aan burgers, elke keer volgens onze schrijfwijzer',
};

const DEFAULT_EXAMPLE = 'schrijf een brief aan bewoners over werkzaamheden in hun straat';

/** Voorbeeldzin ("Bijvoorbeeld: …") die bij deze techniek past. */
export function contextExample(t: TechniqueIdentity): string {
  const name = t.name.trim().toLowerCase();
  for (const [needle, example] of NAME_EXAMPLES) {
    if (name.includes(needle)) return `Bijvoorbeeld: ${example}.`;
  }
  const fmt = structureFormat(t);
  return `Bijvoorbeeld: ${fmt ? FORMAT_EXAMPLES[fmt] : DEFAULT_EXAMPLE}.`;
}

/**
 * Startuitleg boven het invulblok: waar de techniek over moet gáán. Bedoeld
 * voor technieken die zich niet vanzelf laten raden omdat de AI iets anders
 * doet dan antwoord geven. Bij Socratic stelt hij juist alléén vragen, en
 * zonder die verwachting vooraf lijkt dat een fout in plaats van de bedoeling.
 */
const FORMAT_STARTERS: Partial<Record<StructureFormat, string>> = {
  socratic:
    'Een voorgenomen besluit, een overtuiging of een aanpak waarvan je denkt dat hij klopt, maar die je nog niet hebt getoetst. Beschrijf de situatie in gewone woorden; je hoeft er zelf geen scherpe stelling van te maken.',
};

/** De startuitleg die bij deze techniek hoort, of undefined als die er niet is. */
export function techniqueStarter(t: TechniqueIdentity): string | undefined {
  const fmt = structureFormat(t);
  return fmt ? FORMAT_STARTERS[fmt] : undefined;
}
