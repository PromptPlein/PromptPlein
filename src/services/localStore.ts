import { SEED_CATEGORIES, SEED_ROLES, SEED_TECHNIQUES } from '@/data/seed';
import type {
  AdvancedPromptFilters,
  AnalyticsEvent,
  AuditLogEntry,
  Category,
  EmailShare,
  NewPromptInput,
  Optimization,
  Prompt,
  PromptFilters,
  PromptLike,
  PublicProfile,
  Role,
  SharingLevel,
  Technique,
} from '@/types';

// localStorage-backed mock-database. Wordt gebruikt wanneer er geen Supabase
// is geconfigureerd, zodat de app zonder backend volledig werkt.

const PROMPTS_KEY = 'opl.prompts';
const OPTIMIZATIONS_KEY = 'opl.optimizations';
const ROLES_KEY = 'opl.roles';
const CATEGORIES_KEY = 'opl.categories';
const TECHNIQUES_KEY = 'opl.techniques';
const ANALYTICS_KEY = 'opl.analytics';
const SHARES_KEY = 'opl.shares';
const AUDIT_KEY = 'opl.audit';
const LIKES_KEY = 'opl.likes';
const PROFILES_KEY = 'opl.publicProfiles';

/** Vaste "ik"-gebruiker in mock-modus, zodat liken/community werkt zonder echte auth. */
const LOCAL_USER_ID = 'local-user';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}

function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

// --- Reference data (mutable in Phase 2) ---

function ensureRefSeeded(): void {
  if (!localStorage.getItem(ROLES_KEY)) {
    write(ROLES_KEY, SEED_ROLES.map((r, i) => ({ ...r, sort_order: i })));
  }
  if (!localStorage.getItem(CATEGORIES_KEY)) {
    write(CATEGORIES_KEY, SEED_CATEGORIES.map((c, i) => ({ ...c, sort_order: i })));
  }
  if (!localStorage.getItem(TECHNIQUES_KEY)) {
    write(
      TECHNIQUES_KEY,
      SEED_TECHNIQUES.map((t, i) => ({ ...t, sort_order: i, is_active: true })),
    );
  } else {
    backfillTechniqueMetadata();
  }
}

/**
 * Vult ontbrekende metadata (kracht + gebruikssituaties) aan voor technieken die
 * vóór deze velden lokaal zijn geseed. Matcht op id en raakt admin-bewerkte
 * waarden niet aan (alleen lege velden worden ingevuld).
 */
function backfillTechniqueMetadata(): void {
  const techs = read<Technique[]>(TECHNIQUES_KEY, []);
  let changed = false;
  const merged = techs.map((t) => {
    const seed = SEED_TECHNIQUES.find((s) => s.id === t.id);
    if (!seed) return t;
    const next = { ...t };
    if (!next.strength && seed.strength) {
      next.strength = seed.strength;
      changed = true;
    }
    if ((!next.use_cases || next.use_cases.length === 0) && seed.use_cases?.length) {
      next.use_cases = seed.use_cases;
      changed = true;
    }
    if (!next.family && seed.family) {
      next.family = seed.family;
      changed = true;
    }
    return next;
  });
  if (changed) write(TECHNIQUES_KEY, merged);
}

// Vaste demo-organisaties (mock-modus) zodat de boomstructuur en ministeries in
// de community zichtbaar zijn zonder echte backend.
const LOCAL_ORG_RIJK = 'org-rijk';
const LOCAL_ORG_BZK = 'org-bzk';
const LOCAL_ORG_JENV = 'org-jenv';

// Vaste demo-auteurs (mock-modus). De eerste is "ikzelf", zodat liken werkt.
const LOCAL_PROFILES: PublicProfile[] = [
  { id: LOCAL_USER_ID, full_name: 'Jij (demo)', organization_id: LOCAL_ORG_BZK },
  { id: 'demo-sanne', full_name: 'Sanne de Vries', organization_id: LOCAL_ORG_BZK },
  { id: 'demo-mehmet', full_name: 'Mehmet Yıldız', organization_id: LOCAL_ORG_JENV },
];

function ensureProfilesSeeded(): void {
  if (!localStorage.getItem(PROFILES_KEY)) write(PROFILES_KEY, LOCAL_PROFILES);
}

/** Eenmalige seed van voorbeeldprompts zodat de app niet leeg oogt. */
function ensureSeeded(): void {
  ensureRefSeeded();
  ensureProfilesSeeded();
  if (localStorage.getItem(PROMPTS_KEY)) return;
  const seeded: Prompt[] = [
    {
      id: uid('prompt'),
      title: 'Begrijpelijke afwijzingsbrief opstellen',
      description: 'Genereert een afwijzingsbrief op B1-taalniveau, vriendelijk en duidelijk.',
      content:
        'Schrijf een afwijzingsbrief voor een aanvraag van een vergunning. Leg duidelijk uit waarom de aanvraag is afgewezen en welke mogelijkheden de aanvrager nog heeft.',
      category_id: 'cat-burgerbrieven',
      role_id: 'role-klantcontact',
      organization_id: LOCAL_ORG_BZK,
      sharing_level: 'public',
      created_by: 'Jij (demo)',
      created_by_user: LOCAL_USER_ID,
      is_favorite: true,
      created_at: nowIso(),
      updated_at: nowIso(),
    },
    {
      id: uid('prompt'),
      title: 'Samenvatting van een beleidsnota',
      description: 'Vat een lange beleidsnota samen tot kernpunten voor het bestuur.',
      content:
        'Vat de bijgevoegde beleidsnota samen in maximaal 10 bullets. Benoem de belangrijkste beslispunten en de financiële gevolgen.',
      category_id: 'cat-beleid',
      role_id: 'role-bestuursadviseur',
      organization_id: LOCAL_ORG_BZK,
      sharing_level: 'ministry',
      created_by: 'Sanne de Vries',
      created_by_user: 'demo-sanne',
      is_favorite: false,
      created_at: nowIso(),
      updated_at: nowIso(),
    },
    {
      id: uid('prompt'),
      title: 'Persbericht concept genereren',
      description: 'Stelt een persbericht op volgens de standaard overheidsstructuur.',
      content:
        'Schrijf een persbericht over de opening van een nieuw informatiepunt voor burgers. Gebruik een pakkende kop, een sterke openingsalinea en een citaat van de wethouder.',
      category_id: 'cat-communicatie',
      role_id: 'role-communicatie',
      organization_id: LOCAL_ORG_JENV,
      sharing_level: 'department',
      created_by: 'Mehmet Yıldız',
      created_by_user: 'demo-mehmet',
      is_favorite: false,
      created_at: nowIso(),
      updated_at: nowIso(),
    },
  ];
  write(PROMPTS_KEY, seeded);
}

function sortByOrder<T extends { sort_order?: number; name: string }>(items: T[]): T[] {
  return [...items].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name),
  );
}

export const localStore = {
  // --- Prompts ---
  listPrompts(filters: PromptFilters = {}): Prompt[] {
    ensureSeeded();
    let prompts = read<Prompt[]>(PROMPTS_KEY, []);

    if (filters.favorites_only) prompts = prompts.filter((p) => p.is_favorite);
    if (filters.category_id) prompts = prompts.filter((p) => p.category_id === filters.category_id);
    if (filters.role_id) prompts = prompts.filter((p) => p.role_id === filters.role_id);
    if (filters.sharing_level)
      prompts = prompts.filter((p) => p.sharing_level === filters.sharing_level);
    if (filters.query) {
      const q = filters.query.toLowerCase();
      prompts = prompts.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          (p.description ?? '').toLowerCase().includes(q) ||
          p.content.toLowerCase().includes(q),
      );
    }
    if (filters.technique_id) {
      const opts = read<Optimization[]>(OPTIMIZATIONS_KEY, []);
      const promptIds = new Set(
        opts.filter((o) => o.technique_id === filters.technique_id).map((o) => o.prompt_id),
      );
      prompts = prompts.filter((p) => promptIds.has(p.id));
    }

    return prompts.sort((a, b) => b.created_at.localeCompare(a.created_at));
  },

  searchPrompts(filters: AdvancedPromptFilters = {}): Prompt[] {
    ensureSeeded();
    let prompts = read<Prompt[]>(PROMPTS_KEY, []);

    if (filters.favorites_only) prompts = prompts.filter((p) => p.is_favorite);
    if (filters.category_ids?.length)
      prompts = prompts.filter((p) => p.category_id && filters.category_ids!.includes(p.category_id));
    if (filters.role_ids?.length)
      prompts = prompts.filter((p) => p.role_id && filters.role_ids!.includes(p.role_id));
    if (filters.organization_ids?.length)
      prompts = prompts.filter(
        (p) => p.organization_id && filters.organization_ids!.includes(p.organization_id),
      );
    if (filters.sharing_levels?.length)
      prompts = prompts.filter((p) => filters.sharing_levels!.includes(p.sharing_level));
    if (filters.date_from)
      prompts = prompts.filter((p) => p.created_at >= filters.date_from!);
    if (filters.date_to)
      prompts = prompts.filter((p) => p.created_at <= `${filters.date_to!}T23:59:59`);
    if (filters.query) {
      const q = filters.query.toLowerCase();
      prompts = prompts.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          (p.description ?? '').toLowerCase().includes(q) ||
          p.content.toLowerCase().includes(q),
      );
    }

    // Sortering
    switch (filters.sort) {
      case 'oldest':
        prompts.sort((a, b) => a.created_at.localeCompare(b.created_at));
        break;
      case 'title':
        prompts.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case 'newest':
      default:
        prompts.sort((a, b) => b.created_at.localeCompare(a.created_at));
    }

    return prompts;
  },

  getPrompt(id: string): Prompt | null {
    ensureSeeded();
    return read<Prompt[]>(PROMPTS_KEY, []).find((p) => p.id === id) ?? null;
  },

  createPrompt(input: NewPromptInput): Prompt {
    ensureSeeded();
    const prompts = read<Prompt[]>(PROMPTS_KEY, []);
    const { sharing_levels, ...rest } = input;
    // Mock-modus zonder backend: leid één representatief sharing_level af uit de
    // gekozen niveaus (het hoogste telt). Geen niveau = privé.
    const sharing_level: SharingLevel = sharing_levels.includes('public')
      ? 'public'
      : sharing_levels.includes('ministry')
        ? 'ministry'
        : sharing_levels.includes('department')
          ? 'department'
          : 'private';
    const prompt: Prompt = {
      id: uid('prompt'),
      ...rest,
      sharing_level,
      is_favorite: false,
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    write(PROMPTS_KEY, [prompt, ...prompts]);
    return prompt;
  },

  updatePrompt(id: string, patch: Partial<Prompt>): Prompt {
    const prompts = read<Prompt[]>(PROMPTS_KEY, []);
    const idx = prompts.findIndex((p) => p.id === id);
    if (idx === -1) throw new Error('Prompt niet gevonden');
    const updated: Prompt = { ...prompts[idx], ...patch, updated_at: nowIso() };
    prompts[idx] = updated;
    write(PROMPTS_KEY, prompts);
    return updated;
  },

  deletePrompt(id: string): void {
    write(PROMPTS_KEY, read<Prompt[]>(PROMPTS_KEY, []).filter((p) => p.id !== id));
    write(OPTIMIZATIONS_KEY, read<Optimization[]>(OPTIMIZATIONS_KEY, []).filter((o) => o.prompt_id !== id));
    write(SHARES_KEY, read<EmailShare[]>(SHARES_KEY, []).filter((s) => s.prompt_id !== id));
  },

  // --- Optimizations ---
  listOptimizations(promptId: string): Optimization[] {
    return read<Optimization[]>(OPTIMIZATIONS_KEY, [])
      .filter((o) => o.prompt_id === promptId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  },

  allOptimizations(): Optimization[] {
    return read<Optimization[]>(OPTIMIZATIONS_KEY, []);
  },

  createOptimization(input: Omit<Optimization, 'id' | 'created_at'>): Optimization {
    const opts = read<Optimization[]>(OPTIMIZATIONS_KEY, []);
    const optimization: Optimization = { id: uid('opt'), ...input, created_at: nowIso() };
    write(OPTIMIZATIONS_KEY, [optimization, ...opts]);
    return optimization;
  },

  // --- Roles ---
  listRoles(): Role[] {
    ensureRefSeeded();
    return sortByOrder(read<Role[]>(ROLES_KEY, []));
  },
  createRole(input: Omit<Role, 'id' | 'created_at'>): Role {
    ensureRefSeeded();
    const roles = read<Role[]>(ROLES_KEY, []);
    const role: Role = { id: uid('role'), sort_order: roles.length, created_at: nowIso(), ...input };
    write(ROLES_KEY, [...roles, role]);
    return role;
  },
  updateRole(id: string, patch: Partial<Role>): Role {
    const roles = read<Role[]>(ROLES_KEY, []);
    const idx = roles.findIndex((r) => r.id === id);
    if (idx === -1) throw new Error('Rol niet gevonden');
    roles[idx] = { ...roles[idx], ...patch };
    write(ROLES_KEY, roles);
    return roles[idx];
  },
  deleteRole(id: string): void {
    write(ROLES_KEY, read<Role[]>(ROLES_KEY, []).filter((r) => r.id !== id));
  },

  // --- Categories ---
  listCategories(): Category[] {
    ensureRefSeeded();
    return sortByOrder(read<Category[]>(CATEGORIES_KEY, []));
  },
  createCategory(input: Omit<Category, 'id' | 'created_at'>): Category {
    ensureRefSeeded();
    const cats = read<Category[]>(CATEGORIES_KEY, []);
    const cat: Category = { id: uid('cat'), sort_order: cats.length, created_at: nowIso(), ...input };
    write(CATEGORIES_KEY, [...cats, cat]);
    return cat;
  },
  updateCategory(id: string, patch: Partial<Category>): Category {
    const cats = read<Category[]>(CATEGORIES_KEY, []);
    const idx = cats.findIndex((c) => c.id === id);
    if (idx === -1) throw new Error('Categorie niet gevonden');
    cats[idx] = { ...cats[idx], ...patch };
    write(CATEGORIES_KEY, cats);
    return cats[idx];
  },
  deleteCategory(id: string): void {
    write(CATEGORIES_KEY, read<Category[]>(CATEGORIES_KEY, []).filter((c) => c.id !== id));
  },

  // --- Techniques ---
  listTechniques(includeInactive = false): Technique[] {
    ensureRefSeeded();
    const techniques = sortByOrder(read<Technique[]>(TECHNIQUES_KEY, []));
    return includeInactive ? techniques : techniques.filter((t) => t.is_active !== false);
  },
  createTechnique(input: Omit<Technique, 'id' | 'created_at'>): Technique {
    ensureRefSeeded();
    const techs = read<Technique[]>(TECHNIQUES_KEY, []);
    const tech: Technique = {
      id: uid('tech'),
      sort_order: techs.length,
      is_active: true,
      created_at: nowIso(),
      ...input,
    };
    write(TECHNIQUES_KEY, [...techs, tech]);
    return tech;
  },
  updateTechnique(id: string, patch: Partial<Technique>): Technique {
    const techs = read<Technique[]>(TECHNIQUES_KEY, []);
    const idx = techs.findIndex((t) => t.id === id);
    if (idx === -1) throw new Error('Techniek niet gevonden');
    techs[idx] = { ...techs[idx], ...patch };
    write(TECHNIQUES_KEY, techs);
    return techs[idx];
  },
  deleteTechnique(id: string): void {
    write(TECHNIQUES_KEY, read<Technique[]>(TECHNIQUES_KEY, []).filter((t) => t.id !== id));
  },

  // --- Analytics ---
  trackEvent(input: Omit<AnalyticsEvent, 'id' | 'created_at'>): AnalyticsEvent {
    const events = read<AnalyticsEvent[]>(ANALYTICS_KEY, []);
    const event: AnalyticsEvent = { id: uid('evt'), ...input, created_at: nowIso() };
    // Houd de log behapbaar (laatste 2000 events).
    write(ANALYTICS_KEY, [event, ...events].slice(0, 2000));
    return event;
  },
  listEvents(): AnalyticsEvent[] {
    return read<AnalyticsEvent[]>(ANALYTICS_KEY, []);
  },

  // --- Shares ---
  createShare(input: Omit<EmailShare, 'id' | 'shared_at' | 'view_count'>): EmailShare {
    const shares = read<EmailShare[]>(SHARES_KEY, []);
    const share: EmailShare = { id: uid('share'), shared_at: nowIso(), view_count: 0, ...input };
    write(SHARES_KEY, [share, ...shares]);
    return share;
  },
  getShareByToken(token: string): EmailShare | null {
    return read<EmailShare[]>(SHARES_KEY, []).find((s) => s.share_token === token) ?? null;
  },
  incrementShareView(token: string): EmailShare | null {
    const shares = read<EmailShare[]>(SHARES_KEY, []);
    const idx = shares.findIndex((s) => s.share_token === token);
    if (idx === -1) return null;
    shares[idx] = { ...shares[idx], view_count: shares[idx].view_count + 1 };
    write(SHARES_KEY, shares);
    return shares[idx];
  },
  listShares(): EmailShare[] {
    return read<EmailShare[]>(SHARES_KEY, []);
  },

  // --- Audit ---
  addAuditEntry(input: Omit<AuditLogEntry, 'id' | 'created_at'>): AuditLogEntry {
    const log = read<AuditLogEntry[]>(AUDIT_KEY, []);
    const entry: AuditLogEntry = { id: uid('audit'), ...input, created_at: nowIso() };
    write(AUDIT_KEY, [entry, ...log].slice(0, 1000));
    return entry;
  },
  listAuditEntries(): AuditLogEntry[] {
    return read<AuditLogEntry[]>(AUDIT_KEY, []);
  },

  // --- Likes (community) ---
  /** Het vaste "ik" in mock-modus. */
  currentUserId(): string {
    return LOCAL_USER_ID;
  },
  listLikes(): PromptLike[] {
    return read<PromptLike[]>(LIKES_KEY, []);
  },
  /** Like-telling + of de (mock-)gebruiker zelf heeft geliket, voor een set prompts. */
  likeInfo(promptIds: string[]): Record<string, { like_count: number; liked_by_me: boolean }> {
    const likes = read<PromptLike[]>(LIKES_KEY, []);
    const result: Record<string, { like_count: number; liked_by_me: boolean }> = {};
    for (const id of promptIds) {
      const forPrompt = likes.filter((l) => l.prompt_id === id);
      result[id] = {
        like_count: forPrompt.length,
        liked_by_me: forPrompt.some((l) => l.user_id === LOCAL_USER_ID),
      };
    }
    return result;
  },
  /** Toggle de like van de mock-gebruiker; geeft de nieuwe staat terug. */
  toggleLike(promptId: string): { like_count: number; liked_by_me: boolean } {
    const likes = read<PromptLike[]>(LIKES_KEY, []);
    const existing = likes.find((l) => l.prompt_id === promptId && l.user_id === LOCAL_USER_ID);
    let next: PromptLike[];
    if (existing) {
      next = likes.filter((l) => l.id !== existing.id);
    } else {
      next = [
        { id: uid('like'), prompt_id: promptId, user_id: LOCAL_USER_ID, created_at: nowIso() },
        ...likes,
      ];
    }
    write(LIKES_KEY, next);
    const forPrompt = next.filter((l) => l.prompt_id === promptId);
    return {
      like_count: forPrompt.length,
      liked_by_me: forPrompt.some((l) => l.user_id === LOCAL_USER_ID),
    };
  },

  // --- Publieke profielen (community) ---
  listProfiles(): PublicProfile[] {
    ensureProfilesSeeded();
    return read<PublicProfile[]>(PROFILES_KEY, []);
  },
  getProfile(id: string): PublicProfile | null {
    ensureProfilesSeeded();
    return read<PublicProfile[]>(PROFILES_KEY, []).find((p) => p.id === id) ?? null;
  },
  /** Demo-organisaties (mock-modus) — boomstructuur Rijk → ministerie. */
  listOrganizations(): import('@/types').Organization[] {
    const now = nowIso();
    return [
      { id: LOCAL_ORG_RIJK, name: 'Rijksoverheid', code: 'RIJK', parent_id: null, organization_type: 'government', is_active: true, created_at: now },
      { id: LOCAL_ORG_BZK, name: 'Ministerie van Binnenlandse Zaken', code: 'BZK', parent_id: LOCAL_ORG_RIJK, organization_type: 'ministry', is_active: true, created_at: now },
      { id: LOCAL_ORG_JENV, name: 'Ministerie van Justitie en Veiligheid', code: 'JenV', parent_id: LOCAL_ORG_RIJK, organization_type: 'ministry', is_active: true, created_at: now },
    ];
  },
};
