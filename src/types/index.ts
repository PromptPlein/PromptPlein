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
  prompt_id: string;
  technique_id: string;
  optimized_content: string;
  follow_up_answers: Record<string, string>;
  created_at: string;
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

/**
 * Antwoord van de optimize-prompt service (framework-aanbevelingsmodus,
 * eigen-prompt-flow). Beveelt het best passende prompt framework aan op basis
 * van de geplakte prompt, met een korte samenvatting van de analyse.
 */
export interface FrameworkRecommendResult {
  /** Korte samenvatting: wat voor prompt dit is en wat het raamwerk toevoegt. */
  summary: string;
  recommendations: TechniqueRecommendation[];
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
