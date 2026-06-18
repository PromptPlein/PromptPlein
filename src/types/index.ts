// Domeinmodellen voor de Overheid Prompt Library (Phase 1).

export type SharingLevel = 'private' | 'department' | 'ministry' | 'role' | 'public';

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

export interface Technique {
  id: string;
  name: string;
  description?: string;
  /** Vragen die aan de gebruiker gesteld worden voordat geoptimaliseerd wordt. */
  follow_up_questions: FollowUpQuestion[];
  /** Template met placeholders zoals {{PROMPT}} en {{vraag_id}}. */
  template: string;
  sort_order?: number;
  /** Soft-delete vlag (admin). */
  is_active?: boolean;
  created_at?: string;
}

export interface Prompt {
  id: string;
  title: string;
  description?: string;
  content: string;
  category_id?: string | null;
  role_id?: string | null;
  sharing_level: SharingLevel;
  created_by: string;
  is_favorite: boolean;
  created_at: string;
  updated_at: string;
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
  sharing_level: SharingLevel;
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

/** Antwoord van de optimize-prompt service. */
export interface OptimizeResult {
  optimized_content: string;
  success: boolean;
  provider: 'claude' | 'deepseek' | 'local-template';
  error?: string;
}
