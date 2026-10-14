import { useCallback, useState } from 'react';

/**
 * De zoekstand: laat de AI eerst het internet afzoeken en pas daarna antwoorden.
 *
 * Staat bij elke nieuwe prompt en elke nieuwe chat uit; de gebruiker zet hem
 * zelf aan. Zoeken stuurt een zoekvraag naar een dienst buiten PromptPlein en
 * houdt het antwoord een paar seconden op, dus het is een keuze per opdracht
 * en geen voorkeur die blijft hangen. De stand wordt daarom niet bewaard: een
 * nieuw bezoek begint uit, en de pagina's zetten hem terug bij een nieuwe chat
 * (ChatPage) of een nieuwe prompt ("Opnieuw", "Opschonen").
 *
 * Tot 14-10-2026 stond de stand in localStorage, met een aparte sleutel voor de
 * bouwer; die oude waarden ruimen we hier op.
 */

const LEGACY_KEYS = ['opl.websearch', 'opl.websearch.builder'];

function clearLegacy(): void {
  try {
    for (const key of LEGACY_KEYS) localStorage.removeItem(key);
  } catch {
    /* localStorage niet beschikbaar: niets op te ruimen */
  }
}

/**
 * Geeft de zoekstand terug plus een schakelaar. Begint altijd uit. `scope` is
 * er nog voor de bestaande aanroepen; de chat en de bouwer hebben elk hun eigen
 * stand omdat het losse componenten zijn.
 */
export default function useWebSearch(
  _scope: 'chat' | 'builder' = 'chat',
): [boolean, (value: boolean) => void] {
  const [webSearch, setWebSearch] = useState(() => {
    clearLegacy();
    return false;
  });
  const set = useCallback((value: boolean) => setWebSearch(value), []);
  return [webSearch, set];
}
