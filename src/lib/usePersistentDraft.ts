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
