// Opslag van chatgesprekken — uitsluitend in localStorage, nooit in de database.
//
// Privacy-uitgangspunt (afgesproken met de beheerder): gespreksinhoud en
// documentteksten blijven op het apparaat van de gebruiker, gescheiden per
// ingelogd account. "Verwijder gesprek" wist definitief; bij uitloggen wordt
// ALLES onder het prefix gewist (ook restdata van eerdere accounts op een
// gedeelde werkplek).
//
// Indeling (key-per-gesprek, zodat debounced writes tijdens het streamen alleen
// het actieve gesprek serialiseren en een quota-fout één gesprek raakt):
//   opl.chat.<userId>.index      -> { v: 1, conversations: ChatIndexEntry[] }
//   opl.chat.<userId>.conv.<id>  -> ChatConversation

import { v4 as uuid } from 'uuid';
import type { ChatConversation, ChatIndexEntry } from '@/types';

export const CHAT_PREFIX = 'opl.chat.';

/** Maximum aantal bewaarde gesprekken per account; oudste worden geëvict. */
const MAX_CONVERSATIONS = 30;

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
    const parsed = JSON.parse(raw) as Partial<ChatConversation>;
    if (typeof parsed.id !== 'string' || !Array.isArray(parsed.messages)) return null;
    return {
      id: parsed.id,
      title: typeof parsed.title === 'string' ? parsed.title : 'Gesprek',
      createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : new Date().toISOString(),
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
      messages: parsed.messages,
      attachments: Array.isArray(parsed.attachments) ? parsed.attachments : [],
    };
  } catch {
    return null;
  }
}

function toIndexEntry(conv: ChatConversation): ChatIndexEntry {
  return {
    id: conv.id,
    title: conv.title,
    createdAt: conv.createdAt,
    updatedAt: conv.updatedAt,
    messageCount: conv.messages.length,
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

/** Verwijder alle gesprekken van dit account definitief van dit apparaat. */
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

/**
 * Wis ALLE chatdata op dit apparaat, van elk account. Aangeroepen bij
 * uitloggen (SIGNED_OUT), zodat er op een gedeelde werkplek niets achterblijft
 * — ook geen restdata van eerdere accounts of een openstaande handoff.
 */
export function wipeAllChatStorage(): void {
  try {
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(CHAT_PREFIX)) doomed.push(key);
    }
    doomed.forEach((key) => localStorage.removeItem(key));
  } catch {
    /* localStorage niet beschikbaar — dan valt er ook niets te wissen */
  }
  try {
    sessionStorage.removeItem(`${CHAT_PREFIX}handoff`);
  } catch {
    /* negeren */
  }
}

/** Start een nieuw, leeg gesprek (nog niet opgeslagen tot het eerste bericht). */
export function createConversation(): ChatConversation {
  const now = new Date().toISOString();
  return { id: uuid(), title: 'Nieuw gesprek', createdAt: now, updatedAt: now, messages: [], attachments: [] };
}

/** Leid de gesprekstitel af uit het eerste bericht (max ~48 tekens). */
export function titleFromFirstMessage(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return 'Nieuw gesprek';
  return clean.length > 48 ? `${clean.slice(0, 47).trimEnd()}…` : clean;
}
