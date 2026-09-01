import { useCallback, useState } from 'react';

/**
 * De zoekstand: laat de AI eerst het internet afzoeken en pas daarna antwoorden.
 *
 * Net als {@link useThinking} één stand voor de hele app in plaats van per
 * gesprek. De gebruiker zet zoeken aan omdat hij iets actueels wil weten, niet
 * omdat hij toevallig in dit gesprek zit; opent hij een nieuwe chat met dezelfde
 * vraag in zijn hoofd, dan hoort de knop nog aan te staan.
 *
 * Staat in localStorage, net als de concepten en de gesprekken: het is een
 * voorkeur van dit apparaat en er hoeft niets voor naar de server. Is
 * localStorage niet beschikbaar (privémodus), dan werkt de knop nog gewoon,
 * alleen onthoudt hij het niet.
 */

const KEY = 'opl.websearch';

function readStored(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Geeft de zoekstand terug plus een schakelaar. Standaard uit: zoeken stuurt de
 * vraag van de gebruiker naar een zoekdienst buiten PromptPlein en houdt het
 * antwoord een paar seconden op, dus het hoort een keuze te zijn en niet iets
 * wat ongevraagd aan staat.
 */
export default function useWebSearch(): [boolean, (value: boolean) => void] {
  const [webSearch, setWebSearch] = useState(readStored);

  const set = useCallback((value: boolean) => {
    setWebSearch(value);
    try {
      if (value) localStorage.setItem(KEY, '1');
      else localStorage.removeItem(KEY);
    } catch {
      /* negeren, bewaren is best-effort */
    }
  }, []);

  return [webSearch, set];
}
