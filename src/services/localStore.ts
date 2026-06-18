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
  Role,
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
  }
}

/** Eenmalige seed van voorbeeldprompts zodat de app niet leeg oogt. */
function ensureSeeded(): void {
  ensureRefSeeded();
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
      sharing_level: 'public',
      created_by: 'Demo Ambtenaar',
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
      sharing_level: 'ministry',
      created_by: 'Demo Ambtenaar',
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
      sharing_level: 'department',
      created_by: 'Demo Ambtenaar',
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
    if (filters.technique_ids?.length) {
      const opts = read<Optimization[]>(OPTIMIZATIONS_KEY, []);
      const promptIds = new Set(
        opts.filter((o) => filters.technique_ids!.includes(o.technique_id)).map((o) => o.prompt_id),
      );
      prompts = prompts.filter((p) => promptIds.has(p.id));
    }

    // Sortering
    const shares = read<EmailShare[]>(SHARES_KEY, []);
    const shareCount = (id: string) =>
      shares.filter((s) => s.prompt_id === id).reduce((n, s) => n + 1 + s.view_count, 0);

    switch (filters.sort) {
      case 'oldest':
        prompts.sort((a, b) => a.created_at.localeCompare(b.created_at));
        break;
      case 'title':
        prompts.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case 'most_shared':
        prompts.sort((a, b) => shareCount(b.id) - shareCount(a.id));
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
    const prompt: Prompt = {
      id: uid('prompt'),
      ...input,
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
};
