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

function readStored(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

/**
 * Geeft de zoekstand terug plus een schakelaar. Standaard uit: zoeken stuurt de
 * vraag van de gebruiker naar een zoekdienst buiten PromptPlein en houdt het
 * antwoord een paar seconden op, dus het hoort een keuze te zijn en niet iets
 * wat ongevraagd aan staat.
 *
 * `scope` 'builder' is de knop in de promptbouwer. Die heeft een eigen stand:
 * daar gaat een hele geplakte prompt naar de zoekdienst in plaats van één vraag,
 * en wie zoeken in de chat aanzette, heeft daar niet mee ingestemd.
 */
export default function useWebSearch(
  scope: 'chat' | 'builder' = 'chat',
): [boolean, (value: boolean) => void] {
  const key = scope === 'builder' ? `${KEY}.builder` : KEY;
  const [webSearch, setWebSearch] = useState(() => readStored(key));

  const set = useCallback(
    (value: boolean) => {
      setWebSearch(value);
      try {
        if (value) localStorage.setItem(key, '1');
        else localStorage.removeItem(key);
      } catch {
        /* negeren, bewaren is best-effort */
      }
    },
    [key],
  );

  return [webSearch, set];
}
