import { useCallback, useEffect, useState } from 'react';

/**
 * Hoe de gebruiker de invulvelden van een techniek wil zien:
 *  - 'wizard'  → stap voor stap, één vraag per scherm met "Volgende" (default).
 *  - 'stacked' → alle velden in één keer onder elkaar.
 * De keuze wordt persoonlijk bewaard in localStorage, zodat het de volgende keer
 * weer op dezelfde manier verschijnt.
 */
export type FieldLayout = 'wizard' | 'stacked';

const STORAGE_KEY = 'opl.fieldLayout';
const DEFAULT_LAYOUT: FieldLayout = 'wizard';

function readStored(): FieldLayout {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'wizard' || v === 'stacked') return v;
  } catch {
    /* localStorage niet beschikbaar */
  }
  return DEFAULT_LAYOUT;
}

// Eenvoudige in-tab synchronisatie: meerdere componenten die de hook gebruiken
// (bijv. de techniek-flow en de eigen-prompt-flow) blijven gelijk lopen zonder
// een volledige context. Ook tab-overschrijdend via het 'storage'-event.
const listeners = new Set<(layout: FieldLayout) => void>();

/**
 * Persoonlijke voorkeur voor de veld-indeling, bewaard in localStorage.
 * Geeft de huidige indeling terug plus een setter die de keuze opslaat en alle
 * gebruikers van de hook (in deze tab én andere tabs) bijwerkt.
 */
export function useFieldLayout(): [FieldLayout, (next: FieldLayout) => void] {
  const [layout, setLayoutState] = useState<FieldLayout>(() => readStored());

  useEffect(() => {
    const onLocal = (next: FieldLayout) => setLayoutState(next);
    listeners.add(onLocal);
    // Wijziging in een ander tabblad oppikken.
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setLayoutState(readStored());
    };
    window.addEventListener('storage', onStorage);
    return () => {
      listeners.delete(onLocal);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const setLayout = useCallback((next: FieldLayout) => {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* negeren */
    }
    // Werk alle hook-instanties in deze tab bij.
    listeners.forEach((fn) => fn(next));
  }, []);

  return [layout, setLayout];
}
