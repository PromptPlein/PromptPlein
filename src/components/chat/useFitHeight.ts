import { useLayoutEffect, useRef, useState, type RefObject } from 'react';

/** Ondergrens: hieronder wordt de chat onbruikbaar klein. */
const MIN_HEIGHT = 260;
/** Ruimte die onder het element vrij blijft (de onderste paginamarge). */
const BOTTOM_GAP = 16;

/**
 * Berekent hoeveel hoogte er voor de chatkaart overblijft: de vensterhoogte
 * min alles wat er boven staat (de vaste header, paginamarge en op mobiel de
 * gesprekskiezer) én de footer eronder.
 *
 * Waarom meten in plaats van een vaste `calc()`: die hoogtes verschillen per
 * schermformaat — de header is op mobiel ruim twee keer zo hoog als op desktop
 * (mobiele navigatiebalk) en de footertekst breekt daar over twee regels. Met
 * een vaste aftrek werd de pagina nét scrollbaar, waardoor de chatkaart onder
 * de sticky header schoof. Meten geeft op elk toestel een exacte pasvorm.
 *
 * De uitkomst is een MAXIMUM: zolang het gesprek kort is, bepaalt de inhoud de
 * hoogte en blijft de kaart klein.
 */
export default function useFitHeight<T extends HTMLElement>(): [RefObject<T>, number | undefined] {
  const ref = useRef<T>(null);
  const [maxHeight, setMaxHeight] = useState<number | undefined>();

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = () => {
      // Positie ten opzichte van het document (niet het venster), zodat een
      // eventuele scrollstand de meting niet vertekent.
      const top = el.getBoundingClientRect().top + window.scrollY;
      const footer = document.querySelector('footer');
      const footerHeight = footer?.getBoundingClientRect().height ?? 0;
      const available = window.innerHeight - top - footerHeight - BOTTOM_GAP;
      setMaxHeight(Math.round(Math.max(MIN_HEIGHT, available)));
    };

    measure();

    // Herberekenen bij draaien/formaatwijziging en wanneer de header of footer
    // van hoogte verandert (bijv. een extra regel bij een smaller scherm).
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    const observer = new ResizeObserver(measure);
    document.querySelectorAll('header, footer').forEach((node) => observer.observe(node));

    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
      observer.disconnect();
    };
  }, []);

  return [ref, maxHeight];
}
