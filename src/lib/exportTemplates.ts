// De opmaak van de downloads: welke er gekozen is, en de eigen opmaken die de
// gebruiker maakte in Template-based Output. Alles per browser, net als de chats:
// sjablonen gaan nergens heen. De keuze staat in localStorage, de opmaken zelf in
// IndexedDB, want een sjabloon met logo is al snel groter dan localStorage aankan.

import { useSyncExternalStore } from 'react';
import { choiceFromTemplate, cleanChoice, RIJK_CHOICE, type StyleChoice } from './exportStyle';

/** Standaard de Rijkshuisstijl; `opmaak:<id>` is een eigen opmaak. */
export type ExportLook = 'rijk' | 'eenvoudig' | `opmaak:${string}`;

/** Hoe de kop van een tabel in Excel eruitziet. */
export interface ExcelLook {
  font: string;
  /** Achtergrond van de kop; null is geen vlak. */
  headFill: string | null;
  headText: string;
  headBold: boolean;
  border: string;
}

export interface StoredFile {
  name: string;
  bytes: Uint8Array;
}

export interface Opmaak {
  id: string;
  naam: string;
  /** Letter en kleuren, voor elk formaat zonder eigen sjabloon en altijd voor PDF. */
  choice: StyleChoice;
  /** Wat de gebruiker beschreef, om later verder aan te passen. */
  beschrijving?: string;
  word?: StoredFile;
  pptx?: StoredFile;
  /** Uit een Excel-bestand: de opmaak van de tabelkop. Het bestand zelf is niet nodig. */
  excel?: ExcelLook;
  /** De bestanden waar de opmaak uit komt, met wat erin gelezen is. */
  bronnen?: { kind: 'word' | 'pptx' | 'xlsx'; name: string; gelezen: string[] }[];
  gemaakt: string;
}

/** Groter dan dit is geen sjabloon meer maar een document met foto's. */
export const MAX_TEMPLATE_BYTES = 10 * 1024 * 1024;

const LOOK_KEY = 'opl.word.vormgeving';
const DB_NAME = 'promptplein';
const STORE = 'bestanden';
const LIST_KEY = 'opmaken';

const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const emit = () => listeners.forEach((listener) => listener());

// --- De gekozen opmaak ---

function readLook(): ExportLook {
  try {
    const value = localStorage.getItem(LOOK_KEY);
    if (value === 'eenvoudig' || value?.startsWith('opmaak:')) return value as ExportLook;
    // Van voor de lijst met opmaken; de omzetting hieronder vervangt dit.
    if (value === 'sjabloon' || value === 'eigen') return `opmaak:${value}`;
  } catch {
    /* geen opslag: dan de standaard */
  }
  return 'rijk';
}

let look: ExportLook = typeof localStorage === 'undefined' ? 'rijk' : readLook();

export function setExportLook(value: ExportLook): void {
  look = value;
  try {
    if (value === 'rijk') localStorage.removeItem(LOOK_KEY);
    else localStorage.setItem(LOOK_KEY, value);
  } catch {
    /* de keuze geldt dan alleen deze sessie */
  }
  emit();
}

export function getExportLook(): ExportLook {
  return look;
}

export function useExportLook(): ExportLook {
  // Verwijst de keuze naar een opmaak die er niet meer is, dan de standaard.
  const current = useSyncExternalStore(subscribe, () => look, () => 'rijk' as ExportLook);
  const list = useOpmaken();
  if (current.startsWith('opmaak:') && list && !list.some((o) => `opmaak:${o.id}` === current)) return 'rijk';
  return current;
}

// --- IndexedDB ---

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = run(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result as T);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

// --- De lijst met opmaken ---

let opmaken: Opmaak[] | undefined;
let loading: Promise<Opmaak[]> | null = null;

/** Zet de losse opslag van voor 20-11-2026 om: één Word-, één PowerPoint-sjabloon en één eigen opmaak. */
async function migrate(list: Opmaak[]): Promise<Opmaak[]> {
  const [word, pptx] = await Promise.all([
    withStore<{ name: string; bytes: Uint8Array } | undefined>('readonly', (s) => s.get('word-sjabloon')).catch(() => undefined),
    withStore<{ name: string; bytes: Uint8Array } | undefined>('readonly', (s) => s.get('pptx-sjabloon')).catch(() => undefined),
  ]);
  let own: { beschrijving?: string; choice?: unknown } | null;
  try {
    own = JSON.parse(localStorage.getItem('opl.export.eigen') ?? 'null');
  } catch {
    own = null;
  }
  if (!word && !pptx && !own) return list;

  const next = [...list];
  const now = new Date().toISOString();
  if (word || pptx) {
    const source = word?.bytes ?? pptx?.bytes;
    next.push({
      id: 'sjabloon',
      naam: 'Mijn sjabloon',
      choice: (source && (await choiceFromTemplate(source))) || RIJK_CHOICE,
      ...(word ? { word: { name: word.name, bytes: word.bytes } } : {}),
      ...(pptx ? { pptx: { name: pptx.name, bytes: pptx.bytes } } : {}),
      gemaakt: now,
    });
  }
  const ownChoice = cleanChoice(own?.choice);
  if (ownChoice) {
    next.push({ id: 'eigen', naam: 'Mijn eigen opmaak', choice: ownChoice, beschrijving: own?.beschrijving || undefined, gemaakt: now });
  }
  await withStore('readwrite', (s) => s.put(next, LIST_KEY));
  await Promise.all([
    withStore('readwrite', (s) => s.delete('word-sjabloon')).catch(() => undefined),
    withStore('readwrite', (s) => s.delete('pptx-sjabloon')).catch(() => undefined),
  ]);
  try {
    localStorage.removeItem('opl.export.eigen');
  } catch {
    /* niet erg */
  }
  return next;
}

export function loadOpmaken(): Promise<Opmaak[]> {
  if (opmaken) return Promise.resolve(opmaken);
  if (!loading) {
    loading = (async () => {
      try {
        const stored = (await withStore<Opmaak[] | undefined>('readonly', (s) => s.get(LIST_KEY))) ?? [];
        opmaken = await migrate(stored.filter((o) => o && o.id && cleanChoice(o.choice)));
      } catch {
        opmaken = [];
      }
      emit();
      return opmaken;
    })();
  }
  return loading;
}

/** De eigen opmaken: undefined zolang ze laden. */
export function useOpmaken(): Opmaak[] | undefined {
  const list = useSyncExternalStore(subscribe, () => opmaken, () => undefined);
  if (list === undefined && typeof indexedDB !== 'undefined') void loadOpmaken();
  return list;
}

export async function getOpmaak(id: string): Promise<Opmaak | null> {
  return (await loadOpmaken()).find((o) => o.id === id) ?? null;
}

export async function saveOpmaak(opmaak: Opmaak): Promise<void> {
  const list = await loadOpmaken();
  const next = list.some((o) => o.id === opmaak.id) ? list.map((o) => (o.id === opmaak.id ? opmaak : o)) : [...list, opmaak];
  await withStore('readwrite', (s) => s.put(next, LIST_KEY));
  opmaken = next;
  emit();
}

export async function removeOpmaak(id: string): Promise<void> {
  const next = (await loadOpmaken()).filter((o) => o.id !== id);
  await withStore('readwrite', (s) => s.put(next, LIST_KEY));
  opmaken = next;
  if (look === `opmaak:${id}`) setExportLook('rijk');
  else emit();
}

export function newOpmaakId(): string {
  return `o${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
