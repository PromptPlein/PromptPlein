import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { isKeyboardOpen, VIEWPORT_EVENT, visibleHeight } from '@/lib/viewportWatch';

/** Ondergrens: hieronder wordt de chat onbruikbaar klein. */
const MIN_HEIGHT = 260;
/** Met het schermtoetsenbord open is er minder over, en dat moet ook passen. */
const MIN_HEIGHT_KEYBOARD = 140;
/**
 * Ruimte die onder het element vrij blijft, in rem: de onderste paginamarge
 * (`py-4`). In rem omdat de tekstgrootte uit Toegankelijkheid die marge meeschaalt.
 */
const BOTTOM_GAP_REM = 1;
/** De marge boven het element met `data-fit-below` (`mt-3`), in rem. */
const BELOW_MARGIN_REM = 0.75;

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
 * Een element met `data-fit-below` staat onder de kaart en telt mee als ruimte
 * die vrij moet blijven, zodat de pagina zelf nooit scrollt.
 *
 * Op de telefoon telt de zichtbare hoogte en niet die van het venster: anders
 * valt de kaart met het tekstvak weg onder het schermtoetsenbord (`viewportWatch`).
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
      const below = document.querySelector<HTMLElement>('[data-fit-below]');
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
      const belowBox = below?.getBoundingClientRect().height ?? 0;
      const belowHeight = belowBox > 0 ? belowBox + BELOW_MARGIN_REM * rem : 0;
      // De onderbalk van de telefoon: de pagina houdt daar ruimte voor vrij.
      const shell = document.getElementById('app-shell');
      const bar = shell ? parseFloat(getComputedStyle(shell).paddingBottom) : 0;
      // Op de telefoon loopt de chat tot de rand door, zonder marge eronder.
      const edge = window.matchMedia('(max-width: 39.99rem)').matches ? 0 : BOTTOM_GAP_REM * rem;
      const keyboard = isKeyboardOpen();
      const available = visibleHeight() - top - footerHeight - belowHeight - bar - edge;
      setMaxHeight(Math.round(Math.max(keyboard ? MIN_HEIGHT_KEYBOARD : MIN_HEIGHT, available)));
      // iOS schuift de pagina omhoog om het tekstvak te tonen. Dat is nu niet
      // meer nodig en zou de bovenkant van de chat uit beeld duwen.
      if (keyboard && window.scrollY > 0) window.scrollTo(0, 0);
    };

    measure();

    // Herberekenen bij draaien/formaatwijziging en wanneer de header of footer
    // van hoogte verandert (bijv. een extra regel bij een smaller scherm).
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    window.addEventListener(VIEWPORT_EVENT, measure);
    const observer = new ResizeObserver(measure);
    document
      .querySelectorAll('header, footer, [data-fit-below]')
      .forEach((node) => observer.observe(node));

    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
      window.removeEventListener(VIEWPORT_EVENT, measure);
      observer.disconnect();
    };
  }, []);

  return [ref, maxHeight];
}
