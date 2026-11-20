// De opmaak van de downloads en de eigen sjablonen (Word en PowerPoint). Per browser,
// net als de chats: het sjabloon gaat nergens heen. De keuze staat in
// localStorage, het sjabloon zelf in IndexedDB, want een sjabloon met logo is
// al snel groter dan wat localStorage prettig vasthoudt.

import { useSyncExternalStore } from 'react';
import type { WordLook } from './wordExport';

const LOOK_KEY = 'opl.word.vormgeving';
const DB_NAME = 'promptplein';
const STORE = 'bestanden';
const TEMPLATE_KEY = 'word-sjabloon';
const PPTX_KEY = 'pptx-sjabloon';

/** Groter dan dit is geen sjabloon meer maar een document met foto's. */
export const MAX_TEMPLATE_BYTES = 10 * 1024 * 1024;

export interface StoredTemplate {
  name: string;
  bytes: Uint8Array;
  savedAt: string;
}

// --- De gekozen vormgeving ---

function readLook(): WordLook {
  try {
    const value = localStorage.getItem(LOOK_KEY);
    if (value === 'eenvoudig' || value === 'sjabloon' || value === 'eigen') return value;
  } catch {
    /* geen opslag: dan de standaard */
  }
  return 'rijk';
}

let look: WordLook = readLook();
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const emit = () => listeners.forEach((listener) => listener());

export function setWordLook(value: WordLook): void {
  look = value;
  try {
    if (value === 'rijk') localStorage.removeItem(LOOK_KEY);
    else localStorage.setItem(LOOK_KEY, value);
  } catch {
    /* de keuze geldt dan alleen deze sessie */
  }
  emit();
}

export function useWordLook(): WordLook {
  return useSyncExternalStore(subscribe, () => look, () => 'rijk');
}

// --- Het eigen sjabloon ---

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

/** Naam van het sjabloon, voor de instellingen; undefined zolang het nog laadt. */
let templateName: string | null | undefined;
let loading = false;

export async function loadWordTemplate(): Promise<StoredTemplate | null> {
  try {
    const stored = await withStore<StoredTemplate | undefined>('readonly', (s) => s.get(TEMPLATE_KEY));
    templateName = stored?.name ?? null;
    emit();
    return stored ?? null;
  } catch {
    templateName = null;
    emit();
    return null;
  }
}

export async function saveWordTemplate(name: string, bytes: Uint8Array): Promise<void> {
  const value: StoredTemplate = { name, bytes, savedAt: new Date().toISOString() };
  await withStore('readwrite', (s) => s.put(value, TEMPLATE_KEY));
  templateName = name;
  emit();
}

export async function removeWordTemplate(): Promise<void> {
  await withStore('readwrite', (s) => s.delete(TEMPLATE_KEY));
  templateName = null;
  if (look === 'sjabloon' && !pptxName) setWordLook('rijk');
  else emit();
}

/** De naam van het opgeslagen sjabloon: null als er geen is, undefined tijdens het laden. */
export function useWordTemplateName(): string | null | undefined {
  const name = useSyncExternalStore(subscribe, () => templateName, () => undefined);
  if (name === undefined && !loading && typeof indexedDB !== 'undefined') {
    loading = true;
    void loadWordTemplate();
  }
  return name;
}

// --- Het eigen PowerPoint-sjabloon ---

let pptxName: string | null | undefined;
let pptxLoading = false;

export async function loadPptxTemplate(): Promise<StoredTemplate | null> {
  try {
    const stored = await withStore<StoredTemplate | undefined>('readonly', (s) => s.get(PPTX_KEY));
    pptxName = stored?.name ?? null;
    emit();
    return stored ?? null;
  } catch {
    pptxName = null;
    emit();
    return null;
  }
}

export async function savePptxTemplate(name: string, bytes: Uint8Array): Promise<void> {
  const value: StoredTemplate = { name, bytes, savedAt: new Date().toISOString() };
  await withStore('readwrite', (s) => s.put(value, PPTX_KEY));
  pptxName = name;
  emit();
}

export async function removePptxTemplate(): Promise<void> {
  await withStore('readwrite', (s) => s.delete(PPTX_KEY));
  pptxName = null;
  if (look === 'sjabloon' && !templateName) setWordLook('rijk');
  else emit();
}

/** De naam van het PowerPoint-sjabloon: null als er geen is, undefined tijdens het laden. */
export function usePptxTemplateName(): string | null | undefined {
  const name = useSyncExternalStore(subscribe, () => pptxName, () => undefined);
  if (name === undefined && !pptxLoading && typeof indexedDB !== 'undefined') {
    pptxLoading = true;
    void loadPptxTemplate();
  }
  return name;
}
