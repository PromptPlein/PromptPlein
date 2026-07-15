import { useCallback, useEffect, useState } from 'react';

/**
 * Bewaart een tekstveld (de eigen prompt of het doel) in localStorage, zodat de
 * inhoud niet verloren gaat als er iets misgaat — een fout, een herlaadactie of
 * een per ongeluk gesloten tab. Bij terugkomst staat de tekst er weer.
 *
 * Werkt als een drop-in vervanging voor `useState<string>('')`: je krijgt de
 * waarde en een setter terug. De setter schrijft (gedebounced) naar localStorage.
 * Roep `clear()` aan om de bewaarde tekst écht leeg te maken (knop "Opschonen").
 *
 * Alle drafts delen het prefix `opl.draft.` zodat ze in één keer op te ruimen
 * zijn; zie `clearAllDrafts()`.
 */

const PREFIX = 'opl.draft.';

/** Volledige storage-sleutel voor een draft. */
function storageKey(key: string): string {
  return `${PREFIX}${key}`;
}

function readStored(key: string): string {
  try {
    return localStorage.getItem(storageKey(key)) ?? '';
  } catch {
    // localStorage niet beschikbaar (privémodus, uitgeschakeld) → geen draft.
    return '';
  }
}

function writeStored(key: string, value: string): void {
  try {
    if (value) localStorage.setItem(storageKey(key), value);
    // Lege waarde niet als "" bewaren; dan staat er ook geen oude draft meer.
    else localStorage.removeItem(storageKey(key));
  } catch {
    /* negeren — bewaren is best-effort */
  }
}

/**
 * Gecontroleerd tekstveld dat zichzelf in localStorage bewaart.
 *
 * @param key   Unieke sleutel voor dit veld (bijv. 'ownPrompt', 'goal').
 * @returns     [waarde, setWaarde, clear]
 */
export function usePersistentDraft(
  key: string,
): [string, (next: string) => void, () => void] {
  const [value, setValue] = useState<string>(() => readStored(key));

  // Schrijf gedebounced weg, zodat we niet bij elke toetsaanslag naar
  // localStorage schrijven. 400ms is ruim onder een normale typpauze.
  useEffect(() => {
    const id = setTimeout(() => writeStored(key, value), 400);
    return () => clearTimeout(id);
  }, [key, value]);

  const clear = useCallback(() => {
    setValue('');
    // Direct verwijderen (niet wachten op de debounce) zodat "Opschonen"
    // gegarandeerd de bewaarde tekst weghaalt.
    try {
      localStorage.removeItem(storageKey(key));
    } catch {
      /* negeren */
    }
  }, [key]);

  return [value, setValue, clear];
}

function readStoredObject<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(storageKey(key));
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    // localStorage niet beschikbaar of corrupte JSON → val terug op de default.
    return fallback;
  }
}

function writeStoredObject<T>(key: string, value: T, isEmpty: (v: T) => boolean): void {
  try {
    // Een "lege" waarde (leeg object/array) niet bewaren, zodat er ook geen oude
    // draft blijft staan — spiegelt het gedrag van writeStored() voor strings.
    if (isEmpty(value)) localStorage.removeItem(storageKey(key));
    else localStorage.setItem(storageKey(key), JSON.stringify(value));
  } catch {
    /* negeren — bewaren is best-effort */
  }
}

/** Waar of een object/array als "leeg" telt (dan wordt de draft verwijderd). */
function defaultIsEmpty(v: unknown): boolean {
  if (Array.isArray(v)) return v.length === 0;
  if (v && typeof v === 'object') return Object.keys(v).length === 0;
  return v === null || v === undefined;
}

/**
 * Als {@link usePersistentDraft}, maar voor een JSON-serialiseerbaar OBJECT of
 * ARRAY in plaats van een enkel tekstveld. Bedoeld om de ingevulde antwoorden van
 * een vragenlijst (veld-id → tekst) te bewaren, zodat de gebruiker bij een fout,
 * herlaadactie of per ongeluk gesloten tab niet al zijn werk kwijtraakt.
 *
 * Deelt hetzelfde `opl.draft.`-prefix, dus {@link clearAllDrafts} en de knop
 * "Opschonen" ruimen deze drafts vanzelf mee op.
 *
 * @param key       Unieke sleutel (bijv. 'ownPromptAnswers', 'builderAnswers').
 * @param fallback  Startwaarde als er nog geen draft is (bijv. `{}` of `[]`).
 * @param isEmpty   Optioneel: wanneer telt de waarde als leeg (→ draft wissen).
 * @returns         [waarde, setWaarde, clear]
 */
export function usePersistentObject<T>(
  key: string,
  fallback: T,
  isEmpty: (v: T) => boolean = defaultIsEmpty,
): [T, (next: T | ((prev: T) => T)) => void, () => void] {
  const [value, setValue] = useState<T>(() => readStoredObject(key, fallback));

  useEffect(() => {
    const id = setTimeout(() => writeStoredObject(key, value, isEmpty), 400);
    return () => clearTimeout(id);
    // isEmpty is een stabiele functie (default of via useCallback); niet in deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, value]);

  const clear = useCallback(() => {
    setValue(fallback);
    try {
      localStorage.removeItem(storageKey(key));
    } catch {
      /* negeren */
    }
    // fallback is een startwaarde; bewust niet in deps om een nieuwe clear per
    // render te vermijden.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return [value, setValue, clear];
}

/**
 * Verwijder ALLE bewaarde drafts in één keer (alles met prefix `opl.draft.`).
 * Gebruikt door de "Opschonen"-knop om gegarandeerd niets te laten staan, ook
 * drafts van velden die op dat moment niet gemonteerd zijn.
 */
export function clearAllDrafts(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* negeren */
  }
}
