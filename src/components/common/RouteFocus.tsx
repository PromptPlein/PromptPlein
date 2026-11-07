import { useEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';
import { pageTitle } from '@/lib/pageTitles';

/** Zo lang wachten we op de kop van een pagina die nog moet laden, in beelden. */
const MAX_FRAMES = 90;

/**
 * Bij een nieuwe pagina doet de browser in een app als deze niets vanzelf: de
 * schermlezer blijft stil op de knop die je net aanraakte, de titel blijft staan
 * en je houdt de scrollstand van de vorige pagina. Dit onderdeel doet wat een
 * gewone paginawissel doet: titel zetten, naar boven en de focus naar de kop.
 */
export default function RouteFocus() {
  const { pathname } = useLocation();
  const navigationType = useNavigationType();
  const first = useRef(true);

  useEffect(() => {
    document.title = pageTitle(pathname);
    if (first.current) {
      first.current = false;
      return;
    }
    // Terug in de browser: die zet de scrollstand zelf terug.
    if (navigationType !== 'POP') window.scrollTo(0, 0);

    // Staat de focus al in de inhoud (een pagina die zelf een veld kiest, of een
    // tabblad binnen dezelfde pagina), dan blijft hij daar.
    const main = document.getElementById('inhoud');
    if (!main) return;
    const active = document.activeElement;
    if (active && active !== document.body && main.contains(active)) return;

    let frames = 0;
    let handle = 0;
    const focusHeading = () => {
      const heading = main.querySelector<HTMLElement>('h1');
      if (!heading && frames++ < MAX_FRAMES) {
        handle = requestAnimationFrame(focusHeading);
        return;
      }
      const target = heading ?? main;
      target.tabIndex = -1;
      target.style.outline = 'none';
      target.focus({ preventScroll: true });
    };
    handle = requestAnimationFrame(focusHeading);
    return () => cancelAnimationFrame(handle);
  }, [pathname, navigationType]);

  return null;
}
