import { useEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';
import { pageTitle } from '@/lib/pageTitles';

/** Zo lang wachten we op de kop van een pagina die nog moet laden. */
const MAX_WAIT_MS = 4000;

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

    const main = document.getElementById('inhoud');
    if (!main) return;

    const deadline = Date.now() + MAX_WAIT_MS;
    let handle = 0;
    const focusHeading = () => {
      // Alleen een kop die je kunt zien: terwijl een pagina laadt, verbergt React de
      // vorige en staat die kop dus nog gewoon in de DOM.
      const heading = Array.from(main.querySelectorAll<HTMLElement>('h1')).find(
        (el) => el.getClientRects().length > 0,
      );
      if (!heading && Date.now() < deadline) {
        handle = requestAnimationFrame(focusHeading);
        return;
      }
      // Staat de focus al in de inhoud (een pagina die zelf een veld kiest, of een
      // tabblad binnen dezelfde pagina), dan blijft hij daar.
      const active = document.activeElement;
      const stays =
        active && active !== document.body && main.contains(active) && active.getClientRects().length > 0;
      if (stays) return;
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
