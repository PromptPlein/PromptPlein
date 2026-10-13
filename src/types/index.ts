// Domeinmodellen voor de Overheid Prompt Library (Phase 1).

export type SharingLevel = 'private' | 'department' | 'ministry' | 'public';

/**
 * De deelniveaus die je expliciet kunt aanvinken bij het delen (privé is de
 * afwezigheid van elk niveau). Elk niveau krijgt een eigen rij in
 * prompt_visibility met een eigen goedkeuringsstatus.
 */
export type VisibilityLevel = 'department' | 'ministry' | 'public';

/** Goedkeuringsstatus van één deelniveau van een prompt. */
export type VisibilityStatus = 'approved' | 'pending' | 'rejected';

/**
 * Eén deelniveau van een prompt met een eigen status. Een afdelingsniveau wordt
 * direct goedgekeurd; ministerie wacht op een moderator; Rijksoverheid op een
 * admin. Zo kan een prompt op de afdeling al live zijn terwijl een hoger niveau
 * nog wacht op goedkeuring.
 */
export interface PromptVisibility {
  id: string;
  prompt_id: string;
  level: VisibilityLevel;
  /** Organisatie waarop dit niveau scope heeft (null voor 'public'). */
  org_id?: string | null;
  status: VisibilityStatus;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  note?: string | null;
  created_at?: string;
}

export interface Role {
  id: string;
  name: string;
  description?: string;
  sort_order?: number;
  created_at?: string;
}

export interface Category {
  id: string;
  name: string;
  description?: string;
  icon?: string; // lucide-react icoonnaam
  sort_order?: number;
  created_at?: string;
}

/** Een vervolgvraag die hoort bij een prompttechniek. */
export interface FollowUpQuestion {
  id: string;
  label: string;
  placeholder?: string;
  /**
   * Toelichting onder het veld: waarom deze vraag ertoe doet en waar de gebruiker
   * op moet doorvragen. Voedt ook de AI-invulhulp van de persona-bouwer, die de
   * toelichting als instructie per veld meestuurt.
   */
  why?: string;
}

/**
 * Soort techniek. 'context' = een compleet raamwerk dat de hele prompt
 * structureert (bijv. CRISP, CARE); 'technique' = een losse prompttechniek
 * (bijv. Persona, Chain-of-Thought). Bepaalt de groepering in de UI.
 */
export type TechniqueFamily = 'context' | 'technique';

export interface Technique {
  id: string;
  name: string;
  description?: string;
  /** Groepering in de generator: prompt framework of losse techniek. Default 'technique'. */
  family?: TechniqueFamily;
  /** De kracht van deze techniek — waar is hij sterk in? Voedt de AI-aanbeveling. */
  strength?: string;
  /** Concrete gebruikssituaties waarvoor de techniek geschikt is. */
  use_cases?: string[];
  /** Vragen die aan de gebruiker gesteld worden voordat geoptimaliseerd wordt. */
  follow_up_questions: FollowUpQuestion[];
  /** Template met placeholders zoals {{PROMPT}} en {{vraag_id}}. */
  template: string;
  sort_order?: number;
  /** Soft-delete vlag (admin). */
  is_active?: boolean;
  created_at?: string;
}

/** Levenscyclus van een prompt in de goedkeuringsworkflow. */
export type PromptStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'archived';

export interface Prompt {
  id: string;
  title: string;
  description?: string;
  content: string;
  category_id?: string | null;
  role_id?: string | null;
  organization_id?: string | null;
  sharing_level: SharingLevel;
  created_by: string;
  is_favorite: boolean;
  created_at: string;
  updated_at: string;
  status?: PromptStatus;
  created_by_user?: string | null;
  submitted_at?: string | null;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  /** Aantal likes (duimpjes). Verrijkt door de likeService, niet in de rij opgeslagen. */
  like_count?: number;
  /** Of de huidige gebruiker deze prompt heeft geliket. Verrijkt door de likeService. */
  liked_by_me?: boolean;
  /** De gekozen deelniveaus met hun status. Verrijkt door de visibilityService. */
  visibility?: PromptVisibility[];
}

export interface Optimization {
  id: string;
  /** Nullable: plan-wizard-recepten worden bewaard zonder gekoppelde prompt. */
  prompt_id: string | null;
  technique_id: string;
  optimized_content: string;
  follow_up_answers: Record<string, string>;
  created_at: string;
  /**
   * Optioneel plan-wizard recept (doel + plan + verzameld materiaal). Alleen
   * gevuld voor via de slimme meerstaps-bouwer gemaakte optimalisaties.
   * Zie {@link PromptRecipe} (verderop in dit bestand gedefinieerd).
   */
  recipe?: PromptRecipe | null;
}

/** Payload om een nieuwe prompt aan te maken. */
export interface NewPromptInput {
  title: string;
  description?: string;
  content: string;
  category_id?: string | null;
  role_id?: string | null;
  organization_id?: string | null;
  /**
   * De aangevinkte deelniveaus. Leeg = privé (alleen voor de maker zichtbaar).
   * createPrompt() zet hier per niveau een prompt_visibility-rij voor klaar met
   * de juiste begin-status (afdeling direct goedgekeurd, hoger ter goedkeuring).
   */
  sharing_levels: VisibilityLevel[];
  created_by: string;
}

export type SortOption = 'newest' | 'oldest' | 'title' | 'most_shared';

/** Filters voor de (basis) zoekpagina + favorieten. */
export interface PromptFilters {
  query?: string;
  category_id?: string | null;
  role_id?: string | null;
  sharing_level?: SharingLevel | null;
  technique_id?: string | null;
  favorites_only?: boolean;
}

/** Geavanceerde filters (Phase 2): multi-select, datumbereik, sortering. */
export interface AdvancedPromptFilters {
  query?: string;
  category_ids?: string[];
  role_ids?: string[];
  organization_ids?: string[];
  sharing_levels?: SharingLevel[];
  technique_ids?: string[];
  date_from?: string | null;
  date_to?: string | null;
  favorites_only?: boolean;
  sort?: SortOption;
}

// --- Phase 2 entiteiten ---

export type AnalyticsEventType =
  | 'prompt_created'
  | 'search'
  | 'optimization_run'
  | 'share_created'
  | 'share_viewed'
  | 'favorite_toggled';

export interface AnalyticsEvent {
  id: string;
  event_type: AnalyticsEventType;
  user_identifier?: string;
  prompt_id?: string | null;
  technique_id?: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;
}

/**
 * Soort actie in de fijnmazige gedragslog van de prompt-bouwer. Samen
 * reconstrueren ze het verloop van een sessie, wat waardevol is voor analyse en
 * AI-verbetering (waar lopen gebruikers vast, hoeveel hiaten/vragen, welke
 * technieken combineren ze, waar breken ze af).
 */
export type BehaviorAction =
  | 'session_started' // doel ingevoerd, plan aangevraagd
  | 'plan_routing_asked' // planner kon herhaalbaarheid niet bepalen en vroeg het na
  | 'plan_routing_answered' // gebruiker beantwoordde de herhaalbaarheidsvraag
  | 'plan_generated' // AI stelde een plan op
  | 'plan_edited' // stap herordend/hernoemd/verwijderd in de review
  | 'build_started' // gebruiker start de uitvoering van het plan
  | 'step_started' // een stap werd actief
  | 'step_prefilled' // velden van een stap voor-ingevuld uit doel + eerder materiaal
  | 'analyze_run' // "Genereren" op een stap (input → materiaal + hiaten)
  | 'gaps_shown' // de AI benoemde openstaande hiaten
  | 'clarification_added' // gebruiker vulde een hiaat aan en her-analyseerde
  | 'document_uploaded' // voorbeelddocument ingelezen (template-based)
  | 'format_brief_used' // geen voorbeeld: AI stelde een structuur voor uit een omschrijving
  | 'persona_ai_filled' // persona-velden door de AI ingevuld
  | 'fewshot_example_generated' // AI stelde een concept-voorbeeldpaar voor (few-shot)
  | 'fewshot_extracted' // AI extraheerde kenmerken uit de voorbeelden (few-shot)
  | 'meta_built' // AI bouwde een prompt via meta-prompting
  | 'interview_question' // AI stelde een interview-vraag (chain-of-thought)
  | 'interview_answer' // gebruiker beantwoordde een interview-vraag
  | 'interview_finished' // interview afgerond (door AI of door de stop-knop)
  | 'step_committed' // materiaal van een stap vastgelegd; door naar de volgende
  | 'step_regenerated' // een afgeronde stap opnieuw gedaan
  | 'framework_fit_run' // de AI zocht het best passende framework bij het vraagstuk
  | 'framework_prefilled' // de velden van het gekozen framework voor-ingevuld uit het gesprek
  | 'framework_packaged' // de prompt werd in het gekozen framework opgebouwd
  | 'compose_run' // de eindtemplate werd samengesteld
  | 'assumptions_shown' // socratische eindcontrole vond aannames in het resultaat
  | 'assumptions_applied' // gebruiker beantwoordde aannames; template aangescherpt
  | 'assumptions_skipped' // gebruiker sloeg de aannames-controle over
  | 'template_copied' // eindtemplate gekopieerd
  | 'template_saved' // eindtemplate opgeslagen in de bibliotheek
  | 'executed' // prompt direct uitgevoerd (kant-en-klaar resultaat)
  | 'unclear_rejected' // AI vond de invoer onduidelijk (clarity-gate)
  | 'step_error' // een stap mislukte
  | 'cleared'; // gebruiker maakte alles leeg / begon opnieuw

/** Eén regel uit de fijnmazige gedragslog (tabel `behavior_logs`). */
export interface BehaviorLog {
  id: string;
  /** Groepeert alle acties van één plan-wizard-run. */
  session_id: string;
  /** Volgorde binnen de sessie. */
  sequence: number;
  user_identifier?: string | null;
  action: BehaviorAction;
  /** Op welke stap (index in het plan) de actie sloeg. */
  step_index?: number | null;
  technique_id?: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface EmailShare {
  id: string;
  prompt_id: string;
  share_token: string;
  shared_by: string;
  shared_at: string;
  view_count: number;
  expires_at?: string | null;
}

export interface AuditLogEntry {
  id: string;
  admin_email?: string;
  action: string; // bijv. 'create_technique', 'update_category'
  entity_type: string; // 'technique' | 'category' | 'role'
  entity_id?: string | null;
  changes?: Record<string, unknown>;
  created_at: string;
}

/** Herkomst van een gegenereerd/aanbevolen resultaat. */
export type AiProviderResult = 'claude' | 'openai' | 'deepseek' | 'mistral' | 'local-template';

/** Antwoord van de optimize-prompt service (generatiemodus). */
export interface OptimizeResult {
  optimized_content: string;
  success: boolean;
  provider: AiProviderResult;
  error?: string;
  /**
   * De AI heeft de input als onsamenhangend/onzin beoordeeld en bewust GEEN
   * template gemaakt. `reason` legt uit wat onduidelijk is. De UI toont dit als
   * blokkerende terugkoppeling i.p.v. een (verzonnen) resultaat.
   */
  unclear?: boolean;
  reason?: string;
  /**
   * Optioneel plan-wizard recept dat tot deze template leidde (doel + plan +
   * verzameld materiaal). Alleen gezet door de slimme meerstaps-bouwer; wordt
   * bij de optimalisatie bewaard voor herleidbaarheid/herhaling.
   */
  recipe?: PromptRecipe;
  /**
   * De neerslag van de doel-dialoog die tot deze prompt leidde (doel, gesprek,
   * opdrachtbeschrijving en gekozen framework). Alleen gezet door de doel-flow;
   * voedt de inklapbare toelichting onder het resultaat.
   */
  dialogue?: PromptDialogue;
  /**
   * De internetbronnen die de AI kreeg bij het schrijven. Alleen gezet wanneer
   * een beheerder "Zoeken" aan had en er iets gevonden is.
   */
  sources?: { title: string; url: string }[];
}

/** Eén techniekaanbeveling bij een door de gebruiker beschreven doel. */
export interface TechniqueRecommendation {
  /** Verwijst naar een bestaande Technique.id. */
  id: string;
  /** Korte motivatie waarom deze techniek past. */
  reason: string;
  /**
   * Uitgebreidere onderbouwing van de toegevoegde waarde: waarom dit raamwerk/
   * deze techniek slim is voor precies dít vraagstuk. Gekoppeld aan de inhoud
   * van de geplakte prompt (eigen-prompt-flow). Optioneel.
   */
  value?: string;
}

/**
 * Eén fit-oordeel per framework tegen het ingediende vraagstuk (framework-fit-
 * modus, eigen-prompt-flow). Zegt of het raamwerk past, met een vraagstuk-
 * specifieke uitleg, en zo niet: wat er nog bij moet om het wél te laten matchen.
 */
export interface FrameworkFit {
  /** Verwijst naar een bestaande Technique.id. */
  id: string;
  /** Past dit raamwerk goed bij het vraagstuk? */
  fits: boolean;
  /** Vraagstuk-specifieke uitleg: waarom het (wel of niet) past. */
  value: string;
  /** Alleen bij fits=false: wat er nog aan de prompt bij zou moeten om te matchen. */
  missing?: string;
}

/**
 * Eén techniek die in de adviseur nog in de race is. De zekerheid wordt na élk
 * antwoord opnieuw bepaald, zodat de gebruiker ziet dat zijn antwoord de weging
 * verschoof — en de AI zelf ziet waar het onderscheid nog zit.
 */
export interface AdvisorCandidate {
  /** Verwijst naar een bestaande Technique.id. */
  id: string;
  /** Hoe zeker is deze keuze op dit moment (0-100)? */
  zekerheid: number;
  /** Enkele woorden: waarom deze techniek nog meedoet. */
  waarom: string;
}

/** De volgende vraag van de adviseur, met kant-en-klare antwoordopties. */
export interface AdvisorQuestion {
  tekst: string;
  /** Wat deze vraag beslist — getoond als hint onder de vraag. */
  waarom: string;
  /** 2 tot 4 korte antwoorden om aan te klikken; zelf typen mag ook. */
  opties: string[];
}

/** Het eindadvies: de gekozen techniek plus de context om mee te starten. */
export interface AdvisorAdvies {
  /** Verwijst naar een bestaande Technique.id. */
  id: string;
  reden: string;
  /** De taak van de gebruiker, klaar om in het contextveld te zetten. */
  context: string;
}

/**
 * Eén beurt van de techniek-adviseur: óf een volgende vraag, óf het advies.
 * `kandidaten` komt in beide gevallen mee: dat is de tussenstand van de weging.
 */
export interface AdvisorTurnResult {
  success: boolean;
  redenering: string;
  kandidaten: AdvisorCandidate[];
  klaar: boolean;
  vraag?: AdvisorQuestion;
  advies?: AdvisorAdvies;
  provider: AiProviderResult;
  error?: string;
}

/** Antwoord van de optimize-prompt service (framework-fit-modus). */
export interface FrameworkFitResult {
  fits: FrameworkFit[];
  success: boolean;
  provider: AiProviderResult;
  error?: string;
}

/** Antwoord van de optimize-prompt service (aanbevelingsmodus). */
export interface RecommendResult {
  recommendations: TechniqueRecommendation[];
  success: boolean;
  provider: AiProviderResult;
  error?: string;
  /**
   * Het beschreven doel was onsamenhangend/onzin; er zijn bewust GEEN technieken
   * aanbevolen. `reason` legt uit wat onduidelijk is, zodat de gebruiker het doel
   * kan verduidelijken.
   */
  unclear?: boolean;
  reason?: string;
}

// --- Slimme meerstaps-bouwer ("Plan-wizard", doel-flow) ---
//
// De doel-flow ("Help mij met een prompt om mijn doel te bereiken") bouwt niet
// langer één losse techniek in, maar stelt eerst een PLAN op: een geordend recept
// van techniek-stappen (bijv. persona → template-based → chain-of-thought). Het
// eindresultaat blijft één herbruikbare prompt-template. De AI bepaalt welke
// technieken in welke volgorde nodig zijn; de gebruiker kan het plan inzien en
// aanpassen voordat het wordt uitgevoerd.

/**
 * Wat een stap oplevert; bepaalt hoe het verzamelde materiaal in de uiteindelijke
 * template landt.
 *  - 'persona' → een uitgeschreven doelgroep/rol.
 *  - 'format'  → een gekozen uitvoerstructuur (rubrieken).
 *  - 'brief'   → een geconsolideerde inhoudelijke brief (bijv. uit vraag-na-vraag).
 *  - 'text'    → vrije tekst; ook de compose-basis (laatste stap).
 */
export type StepProduces = 'persona' | 'format' | 'brief' | 'text';

/**
 * Eén stap in het plan. `structure_format` en `interactive` worden client-side
 * afgeleid uit de techniek (via `structureFormat()`), niet door de AI bepaald.
 */
export interface PlanStep {
  /** Stabiele key binnen het plan, bijv. 'step-1'. */
  id: string;
  /** Verwijst naar een bestaande Technique.id (gevalideerd tegen echte id's). */
  technique_id: string;
  /** Korte Nederlandse staptitel, bijv. "Bepaal voor wie het plan is". */
  title: string;
  /** Waarom deze techniek, en waarom op deze plek — getoond in de plan-review. */
  rationale: string;
  /** Vormhint voor de uiteindelijke samenstelling. */
  produces: StepProduces;
  /**
   * Afgeleid: de vaste uitvoerstructuur van de techniek (client-side gedecoreerd
   * via `structureFormat()` uit `@/lib/techniques`). Het literale type wordt hier
   * bewust inline gehouden zodat `@/types` niet van `@/lib` afhankelijk wordt
   * (dat zou een import-cyclus geven — `lib/techniques` importeert al uit `@/types`).
   * Houd in sync met `StructureFormat` in `src/lib/techniques.ts`.
   */
  structure_format?:
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
  /** Afgeleid: true bij chain-of-thought/socratic (vraag-na-vraag stappen). */
  interactive?: boolean;
}

/** Een geordend recept van techniek-stappen om het doel tot een template te bouwen. */
export interface PromptPlan {
  goal: string;
  /** 1–2 zinnen die het recept samenvatten (getoond boven de stappen). */
  summary: string;
  /** Geordende stappen; gecapt op een handvol, met minstens één compose-basis. */
  steps: PlanStep[];
}

/** Antwoord van de optimize-prompt service (plan-modus, doel-flow). */
/**
 * Is de taak van de gebruiker terugkerend of eenmalig? Dit is de voorwaarde voor
 * voorbeelden (few-shot/one-shot): die werken alleen als er telkens een
 * soortgelijke input binnenkomt waarop op dezelfde manier gereageerd moet worden.
 */
export type Recurrence = 'herhaalbaar' | 'eenmalig';

/** Eén keuze in de routingvraag die de planner terugstelt. */
export interface PlanRoutingOption {
  id: Recurrence;
  label: string;
  hint?: string;
}

/**
 * De planner kon de herhaalbaarheid niet uit het doel afleiden en heeft één
 * gerichte vraag teruggesteld in plaats van een plan. Het antwoord gaat als
 * `recurrence` mee in een nieuwe plan-aanvraag.
 */
export interface PlanRouting {
  question: string;
  options: PlanRoutingOption[];
}

export interface PlanResult {
  plan?: PromptPlan;
  success: boolean;
  provider: AiProviderResult;
  /** Niet-blokkerende fout: er is teruggevallen op een lokaal plan. */
  error?: string;
  /**
   * Het beschreven doel was onsamenhangend/onzin; er is bewust GEEN plan gemaakt.
   * `reason` legt uit wat onduidelijk is, zodat de gebruiker het doel kan
   * verduidelijken. Spiegelt de clarity-gate van {@link RecommendResult}.
   */
  unclear?: boolean;
  reason?: string;
  /**
   * De planner kon niet bepalen of de taak herhaalbaar is en heeft bewust GEEN
   * plan gemaakt. Leg {@link PlanRouting} aan de gebruiker voor en plan opnieuw
   * met diens antwoord als `recurrence`.
   */
  routing?: PlanRouting;
}

/**
 * Eén beurt in het vraag-na-vraag-gesprek van een interactieve stap
 * (chain-of-thought / socratic): de vraag die de AI stelde en het antwoord van
 * de gebruiker. Het volledige transcript vormt de basis voor de brief die de
 * stap uiteindelijk oplevert.
 */
export interface TranscriptTurn {
  question: string;
  answer: string;
}

/**
 * Het resultaat van één afgeronde plan-stap: het door de AI uitgeschreven
 * MATERIAAL (een persona-beschrijving, gekozen format-rubrieken, een brief),
 * niet een template. Dit materiaal wordt als context doorgegeven aan de volgende
 * stap en uiteindelijk als gelabeld antwoordveld in de eind-compose verwerkt.
 * Dit is de kern van "dat wat gemaakt is gebruikt voor de volgende stap".
 */
export interface StepOutcome {
  step_id: string;
  technique_id: string;
  produces: StepProduces;
  /** Het uitgeschreven materiaal van deze stap (echte inhoud, geen plaatshouders). */
  material: string;
  /**
   * De antwoorden die de gebruiker op de vervolgvragen van deze stap gaf. Vormen
   * samen met het materiaal de basis voor de volgende stap en de eind-compose.
   */
  answers?: Record<string, string>;
  /**
   * Alleen bij interactieve stappen: het vraag-na-vraag-transcript waaruit het
   * materiaal is geconsolideerd. Bewaard voor de UI en eventuele terugblik.
   */
  transcript?: TranscriptTurn[];
}

/**
 * Eén ontbrekend onderdeel dat de gebruiker nog moet aanleveren om het "totale
 * plaatje" compleet te maken (plan-step-analyse). De AI denkt per stap mee: wat
 * heeft het al, en wat is er nog nodig? Gemodelleerd op {@link MissingField}.
 */
export interface PlanStepGap {
  /** Korte naam van wat ontbreekt (bijv. "Detailniveau"). */
  label: string;
  /** Concrete vraag die de gebruiker helpt dit aan te vullen. */
  question: string;
}

/**
 * Antwoord van de optimize-prompt service voor één plan-stap (plan-step-modus).
 * Twee smaken:
 *  - Niet-interactieve materiaal-stap → `material` (het uitgeschreven materiaal).
 *  - Interactieve stap (vraag-na-vraag) → óf `needs_input`+`question` (nog een
 *    vraag nodig), óf `done`+`material` (genoeg info, brief geconsolideerd).
 * Plus de gedeelde clarity-gate (`unclear`) en foutafhandeling (`error`).
 */
export interface PlanStepResult {
  success: boolean;
  provider: AiProviderResult;
  /** Het uitgeschreven materiaal bij een geslaagde (of afgeronde) stap. */
  material?: string;
  /**
   * Analyse-stap: wat de gebruiker nog moet aanleveren voor het totale plaatje.
   * Leeg = de AI acht deze stap compleet en de gebruiker kan door.
   */
  gaps?: PlanStepGap[];
  /** Korte samenvatting van de analyse (wat is er al, wat mist nog). */
  summary?: string;
  /** Interactieve stap: de AI heeft nog een vraag nodig voordat hij afrondt. */
  needs_input?: boolean;
  /** Interactieve stap: de ene volgende vraag aan de gebruiker. */
  question?: string;
  /** Interactieve stap: de AI is klaar (dan is `material` de brief). */
  done?: boolean;
  /** Blokkerende fout (bijv. AI onbereikbaar); de wizard toont dan een retry. */
  error?: string;
  /** De input voor deze stap was onduidelijk; `reason` legt uit wat. */
  unclear?: boolean;
  reason?: string;
}

/**
 * Antwoord van de optimize-prompt service voor één beurt van de doel-dialoog
 * (clarify-modus): óf `needs_input`+`question` (de volgende vraag), óf
 * `done`+`brief` (het vraagstuk is compleet en uitgeschreven als
 * opdrachtbeschrijving). Plus de gedeelde clarity-gate en foutafhandeling.
 */
export interface ClarifyResult {
  success: boolean;
  provider: AiProviderResult;
  /** Er is nog een vraag nodig voordat de AI het vraagstuk compleet acht. */
  needs_input?: boolean;
  /** De ene volgende vraag aan de gebruiker. */
  question?: string;
  /**
   * De stap uit de vaste vraaglijn waar deze vraag bij hoort ("Het probleem",
   * "Het doel", …). Voedt de voortgangsbalk boven het gesprek.
   */
  step?: string;
  /**
   * De prompttechniek die uit het AFGERONDE gesprek volgt (bijv. "Bronbinding").
   * Komt alleen mee bij `done`: tijdens de vragen is het vraagstuk nog in kaart
   * aan het komen, en een techniek kiezen op basis van één zin zou de vragen de
   * verkeerde kant op sturen. Wordt in de samenvatting getoond.
   */
  technique?: string;
  /** Eén zin: waarom die techniek past, gekoppeld aan wat de gebruiker vertelde. */
  analysis?: string;
  /** Het hoeveelste vraag dit is, en het absolute maximum (server-bepaald). */
  asked?: number;
  max?: number;
  /** De dialoog is afgerond. */
  done?: boolean;
  /** De uitgeschreven opdrachtbeschrijving (doel, context, gebruik, vorm, …). */
  brief?: string;
  /** Blokkerende fout (bijv. AI onbereikbaar); de UI toont dan een retry. */
  error?: string;
  /** De beschrijving was onbruikbaar; `reason` legt uit wat onduidelijk is. */
  unclear?: boolean;
  reason?: string;
}

/**
 * De neerslag van een doel-dialoog bij een gegenereerde prompt: het beschreven
 * doel, het volledige vraag-en-antwoordgesprek, de daaruit afgeleide
 * opdrachtbeschrijving en het gekozen framework. Voedt de inklapbare toelichting
 * onder het resultaat, zodat navolgbaar is waar de prompt vandaan komt.
 */
export interface PromptDialogue {
  goal: string;
  transcript: TranscriptTurn[];
  brief: string;
  frameworkName?: string;
  /** De motivatie van de AI waarom dit framework bij dit vraagstuk past. */
  frameworkReason?: string;
}

/**
 * Het volledige "recept" van een plan-wizard-run: het doel, het uitgevoerde plan
 * en het per stap verzamelde materiaal. Wordt bij een opgeslagen optimalisatie
 * bewaard (JSONB `recipe`-kolom) zodat een via de bouwer gemaakte template later
 * te herleiden of te herhalen is. Ook gebruikt voor lokaal hervatten na herladen.
 */
export interface PromptRecipe {
  goal: string;
  plan: PromptPlan;
  outcomes: StepOutcome[];
}

// --- Chat: rechtstreeks gesprek met het door de admin gekozen model ---

/** Eén bericht in een chatgesprek. */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  /** De provider die dit antwoord daadwerkelijk gaf (kan een fallback zijn). */
  provider?: AiProviderResult;
  /** Het gebruikte model, voor de badge bij het bericht. */
  model?: string;
  /** Foutmelding wanneer het antwoord (deels) mislukte. */
  error?: string;
  /** De gebruiker heeft het antwoord met de stop-knop afgebroken. */
  stopped?: boolean;
  /**
   * De internetbronnen die dit antwoord heeft meegekregen, in de volgorde waarin
   * ze aan het model zijn voorgelegd: bron 1 in de tekst is hier het eerste
   * item. Alleen gevuld wanneer de gebruiker "Zoeken op internet" aan had staan
   * én er iets gevonden is. Gaat mee in de opslag, zodat de bronnenlijst er na
   * een herlaadbeurt nog staat.
   */
  sources?: ChatSource[];
}

/** Eén internetbron die de AI voor een antwoord heeft geraadpleegd. */
export interface ChatSource {
  title: string;
  url: string;
}

/** Een geüpload document dat het hele gesprek als bronmateriaal meegaat. */
export interface ChatAttachment {
  id: string;
  name: string;
  /** Aantal tekens van de (eventueel afgekapte) tekst. */
  chars: number;
  text: string;
  /** De tekst is afgekapt op de bijlagelimiet. */
  truncated: boolean;
}

/** Eén gesprek, zoals opgeslagen in localStorage (nooit in de database). */
export interface ChatConversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
  attachments: ChatAttachment[];
  /**
   * 'execution': dit gesprek voert een gegenereerde prompt uit (Testkamer of
   * "Kopiëren in chat"). Alle beurten draaien dan onder de neutrale
   * uitvoer-systeemprompt i.p.v. de B1-huisregels, zonder opmaak-afvlakking.
   */
  kind?: 'execution';
  /**
   * Het chatproject waar dit gesprek onder valt (id uit `chat_projects`). Wordt
   * bij het aanmaken vastgelegd en verandert daarna niet meer: de
   * projectinstructie geldt voor het HELE gesprek, dus hem halverwege wisselen
   * zou eerdere beurten onverklaarbaar maken.
   *
   * Bestaat het project niet meer (verwijderd, of op een ander apparaat
   * aangemaakt), dan draait het gesprek verder als gewone chat.
   */
  projectId?: string;
}

/** Regel in de gesprekkenlijst (aparte kleine index-key in localStorage). */
export interface ChatIndexEntry {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  /** Zie ChatConversation.projectId — staat hier zodat de zijbalk kan groeperen. */
  projectId?: string;
}

/**
 * Een chatproject: een map met een eigen projectinstructie en bronbestanden.
 * Anders dan de gesprekken staat dit WÉL in de database (`chat_projects`) — een
 * project is langlopend werk dat een gebruiker op elk apparaat terugverwacht.
 */
export interface ChatProject {
  id: string;
  name: string;
  /** De projectinstructie: leidend voor elk gesprek in dit project. */
  instructions: string;
  createdAt: string;
  updatedAt: string;
  /** Aantal bronbestanden; alleen gevuld in lijstweergaven. */
  fileCount?: number;
}

/**
 * Een bronbestand van een project. Zoals bij een chatbijlage bewaren we de
 * geëxtraheerde platte tekst, niet het originele bestand.
 */
export interface ChatProjectFile {
  id: string;
  projectId: string;
  name: string;
  chars: number;
  truncated: boolean;
  createdAt: string;
  /**
   * De volledige tekst. Bewust optioneel: de bestandslijst in de UI haalt hem
   * niet op (dat zou honderdduizenden tekens door de browser trekken voor een
   * regel met een naam). Alleen {@link ChatProjectContext} heeft hem echt nodig.
   */
  text?: string;
}

/**
 * Alles wat een project aan een gesprek meegeeft: de projectinstructie plus de
 * tekst van de bronbestanden. Dit is wat er per beurt naar het model gaat.
 */
export interface ChatProjectContext {
  id: string;
  name: string;
  instructions: string;
  files: { name: string; text: string }[];
}

/**
 * Antwoord van de optimize-prompt service (framework-aanbevelingsmodus,
 * eigen-prompt-flow). Beveelt het best passende prompt framework aan op basis
 * van de geplakte prompt, met een korte samenvatting van de analyse.
 */
export interface FrameworkRecommendResult {
  /** Korte samenvatting: wat voor prompt dit is en wat het raamwerk toevoegt. */
  summary: string;
  recommendations: TechniqueRecommendation[];
  /**
   * Korte punten met context die nog ONTBREEKT in de prompt. Als de gebruiker
   * die aanvult en opnieuw laat zoeken, sluit de aanbeveling (en straks de
   * template) beter aan. Leeg = de prompt is al volledig genoeg.
   */
  missingContext: string[];
  success: boolean;
  provider: AiProviderResult;
  error?: string;
}

/** Eén ontbrekend onderdeel uit de prompt-analyse (eigen-prompt-flow). */
export interface MissingField {
  /** Verwijst naar een FollowUpQuestion.id van het gekozen prompt framework. */
  id: string;
  /** Het label van het veld (bijv. "CONTEXT — achtergrond"). */
  label: string;
  /** Korte vraag die de gebruiker helpt dit veld aan te vullen. */
  question: string;
}

/** Antwoord van de optimize-prompt service (analysemodus, eigen-prompt-flow). */
export interface AnalyzeResult {
  /** Korte samenvatting hoe compleet de prompt al is. */
  summary: string;
  /** De velden die nog ontbreken of te vaag zijn. */
  missing: MissingField[];
  success: boolean;
  provider: AiProviderResult;
  error?: string;
}

/** Herkomst van een voor-ingevuld veld: afgeleid uit de prompt of een AI-suggestie. */
export type PrefillSource = 'prompt' | 'ai';

/**
 * Eén voor-ingevuld veld: een voorstel voor de inhoud van een techniek-/raamwerk-
 * veld, met de herkomst (uit de prompt afgeleid of door de AI gesuggereerd) en een
 * korte toelichting. De gebruiker kan de waarde controleren en aanpassen.
 */
export interface PrefilledField {
  /** Verwijst naar een FollowUpQuestion.id van de gekozen techniek. */
  id: string;
  /** Voorgestelde inhoud voor dit veld. */
  value: string;
  /** 'prompt' = uit de tekst van de gebruiker afgeleid; 'ai' = AI-suggestie. */
  source: PrefillSource;
  /** Korte toelichting (bijv. "Afgeleid uit je prompt"). */
  note: string;
}

/**
 * Antwoord van de optimize-prompt service (prefill-modus). Vult de velden van de
 * gekozen techniek alvast voor op basis van de tekst van de gebruiker, zodat die
 * niet met lege velden begint maar met een controleerbare, aanpasbare basis.
 */
export interface PrefillResult {
  /** Korte samenvatting: wat is afgeleid en wat is aangevuld. */
  summary: string;
  /** De voor-ingevulde velden (kan leeg zijn als de AI niets kon afleiden). */
  fields: PrefilledField[];
  success: boolean;
  provider: AiProviderResult;
  error?: string;
  /** De prompt was onzin; er is bewust niets voor-ingevuld. */
  unclear?: boolean;
  reason?: string;
}

// --- Phase 3 entiteiten (authenticatie, organisaties & RBAC) ---

/** Applicatierollen voor rolgebaseerde toegang (RBAC). */
export type AppRole = 'user' | 'admin' | 'super_admin';

/**
 * Niveau van een organisatie in de Rijksoverheid-boom. 'government' is de
 * overkoepelende root; daaronder ministeries, met directoraten-generaal,
 * directies, agentschappen/dienstonderdelen en afdelingen. De getrapte
 * zichtbaarheid leunt op de boom (parent_id), niet op dit type.
 */
export type OrganizationType =
  | 'government'
  | 'ministry'
  | 'directorate_general'
  | 'directorate'
  | 'agency'
  | 'department';

/** Organisatie (ministerie / afdeling / agentschap) met hiërarchie. */
export interface Organization {
  id: string;
  name: string;
  code?: string | null;
  description?: string | null;
  logo_url?: string | null;
  parent_id?: string | null;
  organization_type: OrganizationType;
  contact_email?: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

/**
 * Koppeling: een gebruiker is moderator van een organisatie (in de praktijk een
 * ministerie). Een moderator beoordeelt de Ministerie-deelniveaus van die hele
 * tak. Admins beheren deze koppelingen.
 */
export interface OrganizationModerator {
  id: string;
  user_id: string;
  organization_id: string;
  added_by?: string | null;
  created_at?: string;
}

/** Gebruikersprofiel, gekoppeld aan een Supabase Auth-gebruiker. */
export interface Profile {
  id: string;
  email: string;
  full_name?: string | null;
  avatar_url?: string | null;
  organization_id?: string | null;
  /** De functie/het vakgebied van de gebruiker (verwijst naar de roles-tabel). */
  function_id?: string | null;
  role: AppRole;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

// --- Community: likes & publieke profielen ---

/** Eén like (duimpje) van een gebruiker op een prompt. */
export interface PromptLike {
  id: string;
  prompt_id: string;
  user_id: string;
  created_at: string;
}

/**
 * Publiek zichtbare auteursgegevens — bewust beperkt tot naam + organisatie,
 * zónder privacygevoelige velden zoals e-mail. Voedt de auteurslabels op
 * prompts en de community-pagina.
 */
export interface PublicProfile {
  id: string;
  full_name?: string | null;
  organization_id?: string | null;
}

/** Een community-lid met afgeleide statistieken voor het overzicht/ranglijst. */
export interface CommunityMember extends PublicProfile {
  /** Aantal (openbare) prompts dat dit lid heeft gemaakt. */
  prompt_count: number;
  /** Totaal aantal ontvangen likes over alle prompts. */
  total_likes: number;
}

// --- Phase 3 samenwerking & goedkeuring ---

export interface PromptVersion {
  id: string;
  prompt_id: string;
  version: number;
  title: string;
  content: string;
  change_summary?: string | null;
  created_by?: string | null;
  created_at: string;
}

export interface PromptComment {
  id: string;
  prompt_id: string;
  user_id: string;
  body: string;
  created_at: string;
  profile?: Pick<Profile, 'email' | 'full_name'> | null;
}

export interface PromptApproval {
  id: string;
  prompt_id: string;
  status: 'approved' | 'rejected';
  reviewer_id?: string | null;
  note?: string | null;
  created_at: string;
}

/** Status van een functie-aanvraag in de goedkeuringswachtrij. */
export type FunctionRequestStatus = 'pending' | 'approved' | 'rejected';

/** Een door een gebruiker aangevraagde (nog) niet-bestaande functie. */
export interface FunctionRequest {
  id: string;
  name: string;
  motivation?: string | null;
  status: FunctionRequestStatus;
  requested_by?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  review_note?: string | null;
  created_role_id?: string | null;
  created_at: string;
  /** Verrijkt vanuit het profiel van de aanvrager (optioneel). */
  requester?: Pick<Profile, 'email' | 'full_name'> | null;
}

export type CategoryRequestStatus = 'pending' | 'approved' | 'rejected';

/** Een door een gebruiker aangevraagde (nog) niet-bestaande categorie. */
export interface CategoryRequest {
  id: string;
  name: string;
  motivation?: string | null;
  status: CategoryRequestStatus;
  requested_by?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  review_note?: string | null;
  created_category_id?: string | null;
  created_at: string;
  /** Verrijkt vanuit het profiel van de aanvrager (optioneel). */
  requester?: Pick<Profile, 'email' | 'full_name'> | null;
}

export type NotificationType = 'approval' | 'comment' | 'collaborator' | 'system';

export interface AppNotification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  link?: string | null;
  read: boolean;
  created_at: string;
}
