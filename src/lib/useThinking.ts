import { useCallback, useState } from 'react';

/**
 * De denkstand: laat het model eerst redeneren en dan pas antwoorden.
 *
 * Staat bij elke nieuwe prompt en elke nieuwe chat uit; de gebruiker zet hem
 * zelf aan. Denken kost meer tokens en laat de gebruiker langer wachten, dus
 * het hoort een bewuste keuze per opdracht te zijn en niet een voorkeur die
 * ongemerkt blijft hangen. De stand wordt daarom niet bewaard: een nieuw
 * bezoek begint uit, en de pagina's zetten hem terug bij een nieuwe chat
 * (ChatPage) of een nieuwe prompt ("Opnieuw", "Opschonen").
 *
 * Tot 14-10-2026 stond de stand in localStorage; die oude waarde ruimen we hier
 * op, zodat hij nergens meer meeweegt.
 */

const LEGACY_KEY = 'opl.thinking';

function clearLegacy(): void {
  try {
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* localStorage niet beschikbaar: niets op te ruimen */
  }
}

/** Geeft de denkstand terug plus een schakelaar. Begint altijd uit. */
export default function useThinking(): [boolean, (value: boolean) => void] {
  const [thinking, setThinking] = useState(() => {
    clearLegacy();
    return false;
  });
  const set = useCallback((value: boolean) => setThinking(value), []);
  return [thinking, set];
}
