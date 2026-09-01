import { useCallback, useState } from 'react';

/**
 * De denkstand: laat het model eerst redeneren en dan pas antwoorden.
 *
 * Bewust één stand voor de hele app in plaats van per gesprek of per bouwsessie.
 * De gebruiker zet denken aan omdat hij aan een zwaardere vraag werkt, niet
 * omdat hij toevallig in de chat of in de generator zit; de knop op beide
 * plekken hoort dus dezelfde knop te zijn.
 *
 * Staat in localStorage, net als de concepten en de gesprekken: het is een
 * voorkeur van dit apparaat en er hoeft niets voor naar de server. Is
 * localStorage niet beschikbaar (privémodus), dan werkt de knop nog gewoon,
 * alleen onthoudt hij het niet.
 */

const KEY = 'opl.thinking';

function readStored(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Geeft de denkstand terug plus een schakelaar. Standaard uit: denken kost meer
 * tokens en laat de gebruiker langer wachten op de eerste regel, dus het hoort
 * een keuze te zijn en niet iets wat ongevraagd aan staat.
 */
export default function useThinking(): [boolean, (value: boolean) => void] {
  const [thinking, setThinking] = useState(readStored);

  const set = useCallback((value: boolean) => {
    setThinking(value);
    try {
      if (value) localStorage.setItem(KEY, '1');
      else localStorage.removeItem(KEY);
    } catch {
      /* negeren, bewaren is best-effort */
    }
  }, []);

  return [thinking, set];
}
