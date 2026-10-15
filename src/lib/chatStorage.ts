// Opslag van chatgesprekken — uitsluitend in localStorage, nooit in de database.
//
// Privacy-uitgangspunt (afgesproken met de beheerder): gespreksinhoud en
// documentteksten blijven op het apparaat van de gebruiker. De gesprekken horen
// bij de browser, niet bij een account: wie wel of niet is ingelogd, ziet op
// dit apparaat dezelfde chats (DEVICE_STORAGE_ID), en uitloggen wist niets.
// Weg zijn ze pas als de gebruiker ze zelf verwijdert of de browsergegevens
// wist; op een andere pc staan ze niet.
//
// Indeling (key-per-gesprek, zodat debounced writes tijdens het streamen alleen
// het actieve gesprek serialiseren en een quota-fout één gesprek raakt):
//   opl.chat.<bak>.index      -> { v: 1, conversations: ChatIndexEntry[] }
//   opl.chat.<bak>.conv.<id>  -> ChatConversation

import { v4 as uuid } from 'uuid';
import type { ChatConversation, ChatIndexEntry, ChatMessage } from '@/types';

export const CHAT_PREFIX = 'opl.chat.';

/**
 * De ene opslagbak van dit apparaat. Heet nog 'gast' omdat de gasten hier al
 * stonden; zo blijven hun gesprekken staan zonder omzetting.
 */
export const DEVICE_STORAGE_ID = 'gast';

/** Maximum aantal bewaarde gesprekken op dit apparaat; oudste worden geëvict. */
export const MAX_CONVERSATIONS = 30;

const INDEX_VERSION = 1;

interface ChatIndex {
  v: number;
  conversations: ChatIndexEntry[];
}

function indexKey(userId: string): string {
  return `${CHAT_PREFIX}${userId}.index`;
}

function convKey(userId: string, conversationId: string): string {
  return `${CHAT_PREFIX}${userId}.conv.${conversationId}`;
}

/**
 * Eenmalige omzetting: vroeger had elk account een eigen bak
 * (opl.chat.<userId>.…). Die gesprekken verhuizen naar de bak van dit
 * apparaat, zodat niemand zijn chats kwijtraakt doordat ze niet meer onder zijn
 * account staan. Draait bij elke start maar doet niets zodra er geen oude bak
 * meer is.
 */
export function migrateAccountBuckets(): void {
  let legacyIds: string[];
  try {
    legacyIds = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(CHAT_PREFIX) || !key.endsWith('.index')) continue;
      const id = key.slice(CHAT_PREFIX.length, -'.index'.length);
      if (id && id !== DEVICE_STORAGE_ID && !id.includes('.')) legacyIds.push(id);
    }
  } catch {
    return;
  }
  if (legacyIds.length === 0) return;

  const merged = new Map(loadChatIndex(DEVICE_STORAGE_ID).map((e) => [e.id, e]));
  for (const legacyId of legacyIds) {
    for (const entry of loadChatIndex(legacyId)) {
      const conv = loadConversation(legacyId, entry.id);
      const current = merged.get(entry.id);
      if (conv && conv.messages.length > 0 && (!current || current.updatedAt < conv.updatedAt)) {
        try {
          localStorage.setItem(convKey(DEVICE_STORAGE_ID, conv.id), JSON.stringify(conv));
          merged.set(conv.id, toIndexEntry(conv));
        } catch {
          /* opslag vol: dit gesprek gaat niet mee */
        }
      }
    }
    deleteAllConversations(legacyId);
  }

  const entries = [...merged.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  for (const evicted of entries.splice(MAX_CONVERSATIONS)) {
    try {
      localStorage.removeItem(convKey(DEVICE_STORAGE_ID, evicted.id));
    } catch {
      /* negeren */
    }
  }
  writeIndex(DEVICE_STORAGE_ID, entries);
}

/** Lees de gesprekkenlijst; corrupte of ontbrekende data -> lege lijst. */
export function loadChatIndex(userId: string): ChatIndexEntry[] {
  try {
    const raw = localStorage.getItem(indexKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<ChatIndex>;
    if (parsed.v !== INDEX_VERSION || !Array.isArray(parsed.conversations)) return [];
    return parsed.conversations.filter(
      (e): e is ChatIndexEntry =>
        Boolean(e) && typeof e.id === 'string' && typeof e.title === 'string',
    );
  } catch {
    return [];
  }
}

function writeIndex(userId: string, entries: ChatIndexEntry[]): void {
  try {
    localStorage.setItem(
      indexKey(userId),
      JSON.stringify({ v: INDEX_VERSION, conversations: entries } satisfies ChatIndex),
    );
  } catch {
    /* localStorage niet beschikbaar of vol — de chat werkt in-memory door */
  }
}

/** Lees één volledig gesprek; corrupt of afwezig -> null. */
export function loadConversation(userId: string, conversationId: string): ChatConversation | null {
  try {
    const raw = localStorage.getItem(convKey(userId, conversationId));
    if (!raw) return null;
    return normalizeConversation(JSON.parse(raw));
  } catch {
    return null;
  }
}

/**
 * Maak van onbekende data (localStorage of een geïmporteerd bestand) een geldig
 * gesprek; past de vorm niet, dan null.
 */
function normalizeConversation(value: unknown): ChatConversation | null {
  if (!value || typeof value !== 'object') return null;
  const parsed = value as Partial<ChatConversation>;
  if (typeof parsed.id !== 'string' || !parsed.id || !Array.isArray(parsed.messages)) return null;
  return {
    id: parsed.id,
    title: typeof parsed.title === 'string' ? parsed.title : 'Chat',
    createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : new Date().toISOString(),
    updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
    messages: parsed.messages.filter(
      (m): m is ChatMessage =>
        Boolean(m) &&
        typeof m.id === 'string' &&
        (m.role === 'user' || m.role === 'assistant') &&
        typeof m.content === 'string',
    ),
    attachments: Array.isArray(parsed.attachments) ? parsed.attachments : [],
    // Niet vergeten bij nieuwe velden: deze reconstructie laat onbekende
    // velden stilletjes vallen. Zonder deze regel zou een herladen
    // uitvoergesprek terugvallen op de B1-huisregels.
    ...(parsed.kind === 'execution' ? { kind: parsed.kind } : {}),
    // Idem voor het project: zonder deze regel raakt een gesprek na een
    // refresh zijn projectinstructie en bronbestanden kwijt.
    ...(typeof parsed.projectId === 'string' && parsed.projectId
      ? { projectId: parsed.projectId }
      : {}),
  };
}

function toIndexEntry(conv: ChatConversation): ChatIndexEntry {
  return {
    id: conv.id,
    title: conv.title,
    createdAt: conv.createdAt,
    updatedAt: conv.updatedAt,
    messageCount: conv.messages.length,
    // Zonder dit staat een projectgesprek na een refresh weer in de losse
    // gesprekkenlijst in plaats van onder zijn project.
    ...(conv.projectId ? { projectId: conv.projectId } : {}),
  };
}

/**
 * Sla een gesprek op en werk de index bij (recentste bovenaan, cap op
 * MAX_CONVERSATIONS). Bij een volle opslag wordt het oudste andere gesprek
 * geëvict en één keer opnieuw geprobeerd. Geeft `false` terug wanneer opslaan
 * definitief niet lukt — de aanroeper toont dan een waarschuwing.
 */
export function saveConversation(userId: string, conv: ChatConversation): boolean {
  const rest = loadChatIndex(userId).filter((e) => e.id !== conv.id);
  const entries = [toIndexEntry(conv), ...rest];

  // Cap: oudste gesprekken (achteraan) verwijderen, nooit het actieve.
  while (entries.length > MAX_CONVERSATIONS) {
    const evicted = entries.pop();
    if (evicted) {
      try {
        localStorage.removeItem(convKey(userId, evicted.id));
      } catch {
        /* negeren */
      }
    }
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      localStorage.setItem(convKey(userId, conv.id), JSON.stringify(conv));
      writeIndex(userId, entries);
      return true;
    } catch {
      // Waarschijnlijk vol: evict het oudste ANDERE gesprek en probeer opnieuw.
      const evicted = entries.filter((e) => e.id !== conv.id).pop();
      if (!evicted) return false;
      entries.splice(entries.indexOf(evicted), 1);
      try {
        localStorage.removeItem(convKey(userId, evicted.id));
      } catch {
        return false;
      }
    }
  }
  return false;
}

/** Verwijder één gesprek definitief van dit apparaat. */
export function deleteConversation(userId: string, conversationId: string): void {
  try {
    localStorage.removeItem(convKey(userId, conversationId));
  } catch {
    /* negeren */
  }
  writeIndex(userId, loadChatIndex(userId).filter((e) => e.id !== conversationId));
}

/** Verwijder alle gesprekken in deze bak definitief van dit apparaat. */
export function deleteAllConversations(userId: string): void {
  for (const entry of loadChatIndex(userId)) {
    try {
      localStorage.removeItem(convKey(userId, entry.id));
    } catch {
      /* negeren */
    }
  }
  try {
    localStorage.removeItem(indexKey(userId));
  } catch {
    /* negeren */
  }
}

// --- Geschiedenis bewaren als bestand -------------------------------------
//
// De chats staan alleen in deze browser. Wie ze naar een andere pc wil
// meenemen of wil bewaren voor het wissen van de browsergegevens, bewaart ze
// als bestand en zet ze later terug. Ook dit gaat nergens langs een server:
// opbouwen, downloaden en inlezen gebeurt in de browser.

const BACKUP_APP = 'promptplein-chats';
const BACKUP_VERSION = 1;

export interface ChatBackup {
  app: typeof BACKUP_APP;
  v: number;
  exportedAt: string;
  conversations: ChatConversation[];
}

/** Alle gesprekken in deze bak als één bewaarbestand, recentste eerst. */
export function buildChatBackup(userId: string): ChatBackup {
  const conversations = loadChatIndex(userId)
    .map((entry) => loadConversation(userId, entry.id))
    .filter((conv): conv is ChatConversation => conv !== null && conv.messages.length > 0);
  return {
    app: BACKUP_APP,
    v: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    conversations,
  };
}

export interface RestoreResult {
  /** Nieuw toegevoegd of vervangen door een nieuwere versie uit het bestand. */
  restored: number;
  /** Stond er al in dezelfde of een nieuwere versie. */
  unchanged: number;
  /** Viel weg: onleesbaar, opslag vol, of buiten de grens van MAX_CONVERSATIONS. */
  dropped: number;
}

/**
 * Zet een bewaarbestand terug in deze bak. Een gesprek dat er
 * al staat wordt alleen vervangen als het bestand een nieuwere versie heeft.
 * Gooit een Error met een leesbare melding als het bestand niet van PromptPlein
 * is.
 */
export function restoreChatBackup(userId: string, data: unknown): RestoreResult {
  const backup = data as Partial<ChatBackup> | null;
  if (!backup || backup.app !== BACKUP_APP || !Array.isArray(backup.conversations)) {
    throw new Error('Dit bestand is geen chatgeschiedenis van PromptPlein.');
  }
  if (typeof backup.v !== 'number' || backup.v > BACKUP_VERSION) {
    throw new Error('Dit bestand komt uit een nieuwere versie van PromptPlein.');
  }

  const existing = new Map(loadChatIndex(userId).map((e) => [e.id, e]));
  const result: RestoreResult = { restored: 0, unchanged: 0, dropped: 0 };
  const restoredIds = new Set<string>();

  for (const item of backup.conversations) {
    const conv = normalizeConversation(item);
    if (!conv) {
      result.dropped++;
      continue;
    }
    const current = existing.get(conv.id);
    if (current && current.updatedAt >= conv.updatedAt) {
      result.unchanged++;
      continue;
    }
    try {
      localStorage.setItem(convKey(userId, conv.id), JSON.stringify(conv));
      existing.set(conv.id, toIndexEntry(conv));
      restoredIds.add(conv.id);
    } catch {
      result.dropped++;
    }
  }

  // Index opnieuw opbouwen op datum, zodat teruggezette gesprekken op hun
  // eigen plek in de lijst staan en niet allemaal bovenaan.
  const entries = [...existing.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  for (const evicted of entries.splice(MAX_CONVERSATIONS)) {
    try {
      localStorage.removeItem(convKey(userId, evicted.id));
    } catch {
      /* negeren */
    }
    restoredIds.delete(evicted.id);
    result.dropped++;
  }
  writeIndex(userId, entries);
  result.restored = restoredIds.size;
  return result;
}

/** Eén gesprek als leesbare tekst (Markdown), om los te bewaren of te delen. */
export function conversationToMarkdown(conv: ChatConversation): string {
  const lines: string[] = [`# ${conv.title}`, '', `Gestart op ${formatStamp(conv.createdAt)}`, ''];
  if (conv.attachments.length > 0) {
    lines.push(`Bijlagen: ${conv.attachments.map((a) => a.name).join(', ')}`, '');
  }
  for (const message of conv.messages) {
    lines.push(`## ${message.role === 'user' ? 'Jij' : 'PromptPlein'}`, '', message.content.trim(), '');
    if (message.sources?.length) {
      lines.push('Bronnen:');
      message.sources.forEach((s, i) => lines.push(`${i + 1}. [${s.title}](${s.url})`));
      lines.push('');
    }
  }
  return lines.join('\n');
}

function formatStamp(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleString('nl-NL', { dateStyle: 'long', timeStyle: 'short' });
}

/**
 * Ruim bij uitloggen de doorgeefluiken in sessionStorage op. De gesprekken
 * zelf blijven staan: die horen bij het apparaat, niet bij het account. Wat
 * hier weg moet, draagt wel iets van de vorige gebruiker mee (een project-id,
 * een half doorgegeven prompt) en zou na het volgende inloggen ongevraagd
 * iets doen.
 */
export function clearChatHandoffs(): void {
  try {
    sessionStorage.removeItem(`${CHAT_PREFIX}handoff`);
    // De omgekeerde handoff (chat → generator) en het resultaat-snapshot van
    // de Testkamer-login.
    sessionStorage.removeItem(`${CHAT_PREFIX}generator-handoff`);
    // De project→bouwer-handoff: die draagt een project-id van de vorige
    // gebruiker, en de bouwer zou daar na het inloggen context mee ophalen.
    sessionStorage.removeItem(`${CHAT_PREFIX}project-handoff`);
    // Het verzoek "maak meteen een project": anders maakt de volgende
    // gebruiker op dit apparaat er ongevraagd een aan zodra hij de chat opent.
    sessionStorage.removeItem(`${CHAT_PREFIX}new-project-handoff`);
    sessionStorage.removeItem('opl.gen.result');
  } catch {
    /* negeren */
  }
}

/**
 * Start een nieuw, leeg gesprek (nog niet opgeslagen tot het eerste bericht).
 * Met `projectId` hoort het gesprek bij dat project en draait het onder de
 * projectinstructie en bronbestanden daarvan — voor het hele gesprek.
 */
export function createConversation(
  kind?: ChatConversation['kind'],
  projectId?: string,
): ChatConversation {
  const now = new Date().toISOString();
  return {
    id: uuid(),
    title: 'Nieuwe chat',
    createdAt: now,
    updatedAt: now,
    messages: [],
    attachments: [],
    ...(kind ? { kind } : {}),
    ...(projectId ? { projectId } : {}),
  };
}

/** Leid de gesprekstitel af uit het eerste bericht (max ~48 tekens). */
export function titleFromFirstMessage(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return 'Nieuwe chat';
  return clean.length > 48 ? `${clean.slice(0, 47).trimEnd()}…` : clean;
}
